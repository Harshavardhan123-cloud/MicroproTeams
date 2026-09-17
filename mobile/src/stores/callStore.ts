import { wsService } from '../services/websocketService';
import { ringtoneService } from '../services/ringtoneService';
import { authStore } from './authStore';
import { meetingWebRTCManager } from '../services/MeetingWebRTCManager';
import type {
  AudioRoute,
  LocalDeviceState,
  MeetingError,
  MeetingState as SfuMeetingState,
} from '../services/MeetingWebRTCManager';

export type CallState = 'idle' | 'incoming' | 'outgoing' | 'active' | 'already_accepted';
export type CallType = 'video' | 'audio';

/**
 * A coarse projection of the SFU engine's 12-member `MeetingState` union, kept
 * small on purpose: `getState()` returns a fresh object on every call and every
 * subscriber re-renders on every `notify()`, so only low-frequency, screen-level
 * signals belong in this store. MediaStreams, remote-stream arrays and per-track
 * state stay inside `meetingWebRTCManager` and are consumed directly from its own
 * listeners by the in-call screen.
 */
export type CallMediaState =
  | 'idle'
  | 'acquiring'
  | 'connecting'
  | 'connected'
  | 'reconnecting'
  | 'failed';

/**
 * The SFU room a 1:1 / group call with no conversation id lands in. This literal
 * must stay byte-identical to the web client's (`FullscreenCallOverlay`) or the
 * two clients join different rooms and never see each other.
 */
export const DEFAULT_CALL_ROOM_ID = 'direct-call-room';

export interface CallParticipant {
  id: string;
  name: string;
  avatar?: string;
  isHost?: boolean;
}

interface CallStoreState {
  callState: CallState;
  callType: CallType;
  callId: string | null;
  conversationId: string | null;
  sessionId: string;
  caller: CallParticipant | null;
  recipient: CallParticipant | null;
  participants: CallParticipant[];
  isCaller: boolean;
  isGroupCall: boolean;

  /** The mediasoup/SFU room id for this call. See DEFAULT_CALL_ROOM_ID. */
  roomId: string | null;

  // Media controls — these are a MIRROR of meetingWebRTCManager.getDeviceState(),
  // never the source of truth. The manager pushes corrections through
  // onDeviceStateChange whenever a device acquisition succeeds or fails.
  isMuted: boolean;
  isVideoOff: boolean;
  isSpeakerOn: boolean;

  /** Projection of the engine's state machine — see CallMediaState. */
  mediaState: CallMediaState;
  /** Last error emitted by the engine, cleared when a new session starts. */
  mediaError: string | null;

  // Recording feature & privacy toggle (Host controls)
  isRecording: boolean;
  notifyParticipantsOfRecording: boolean;
  recordingSeconds: number;
  /**
   * Set only when SOMEONE ELSE is recording. Kept separate from `isRecording` so
   * a remote notice lights the badge without flipping this device's own Record
   * button into a "stop" state it has no recorder behind — the exact bug web's
   * MeetingRoom has and the overlay avoids. Mobile cannot record at all: the web
   * recorder is a canvas + MediaRecorder composite with no RN equivalent, and the
   * SFU has no recording capability, so this is a notification, never a control.
   */
  remoteRecording: { recordedBy: string } | null;

  // Multi-device synchronization notification banner
  otherDeviceAcceptedMessage: string | null;
}

type Listener = () => void;

/** Projects the engine's 12-member union onto the 6 states the UI cares about. */
const toMediaState = (state: SfuMeetingState): CallMediaState => {
  switch (state) {
    case 'CONNECTING':
    case 'AUTHENTICATING':
    case 'JOINING':
    case 'JOINED':
      return 'connecting';
    case 'CONNECTING_MEDIA':
    case 'MEDIA_CONNECTED':
      return 'acquiring';
    case 'IN_MEETING':
      return 'connected';
    case 'RECONNECTING':
      return 'reconnecting';
    case 'FAILED':
      return 'failed';
    case 'LEAVING':
    case 'LEFT':
    case 'IDLE':
    default:
      return 'idle';
  }
};

class CallStore {
  private state: CallStoreState = {
    callState: 'idle',
    callType: 'video',
    callId: null,
    conversationId: null,
    // Replaced by the server-assigned session id as soon as the
    // 'connection_established' frame arrives — see setupWebSocketListeners().
    sessionId: `sess-mob-${Math.random().toString(36).substring(2, 8)}-${Date.now()}`,
    caller: null,
    recipient: null,
    participants: [],
    isCaller: false,
    isGroupCall: false,
    roomId: null,
    isMuted: false,
    isVideoOff: false,
    // Mirrors the engine's default audioRoute ('earpiece'), not a wish: the route
    // is corrected by onDeviceStateChange on the first emission.
    isSpeakerOn: false,
    mediaState: 'idle',
    mediaError: null,
    isRecording: false,
    notifyParticipantsOfRecording: true,
    recordingSeconds: 0,
    remoteRecording: null,
    otherDeviceAcceptedMessage: null,
  };

  private listeners: Set<Listener> = new Set();
  private recordingTimer: any = null;

  constructor() {
    this.setupWebSocketListeners();
    this.setupMediaListeners();
  }

  getState(): CallStoreState {
    return { ...this.state };
  }

  subscribe(listener: Listener) {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  private notify() {
    this.listeners.forEach((l) => l());
  }

  // ───────────────────────────────────────────────────────────────────────────
  // Call-control signalling (FastAPI WebSocket)
  //
  // This channel is entirely separate from the SFU's socket.io connection and is
  // the leg that already works end to end. The wire vocabulary
  // (`call_invite` / `call_accepted` / `call_declined` / `recording_*`) and the
  // `call_invite` payload shape are frozen; everything added below is additive.
  // ───────────────────────────────────────────────────────────────────────────

  private setupWebSocketListeners() {
    wsService.on((data: any) => {
      if (!data || !data.type) return;

      switch (data.type) {
        // The server assigns a session id on connect and stamps it onto every
        // inbound event. Adopting it is what makes the multi-device dedupe below
        // able to match at all — a locally generated id can never equal the value
        // the server puts on the wire. The web client does exactly this.
        case 'connection_established': {
          if (!data.session_id) return;
          this.state = { ...this.state, sessionId: String(data.session_id) };
          this.notify();
          break;
        }

        case 'call_invite': {
          // Check if already in a call
          if (this.state.callState !== 'idle' && this.state.callState !== 'already_accepted') {
            return;
          }

          const callerUser: CallParticipant = {
            // The invite payload now carries `caller_id`, and the server stamps
            // `sender_user_id` on every relayed event; either is a real user id,
            // where the old 'caller' fallback was a string that matched nothing.
            id: data.caller_id || data.sender_user_id || data.user_id || 'caller',
            name: data.caller_name || 'Teammate',
            avatar: data.caller_avatar,
          };

          this.state = {
            ...this.state,
            callState: 'incoming',
            callType: data.call_type === 'audio' ? 'audio' : 'video',
            callId: data.call_id || `call-${Date.now()}`,
            conversationId: data.conversation_id || null,
            roomId: data.conversation_id || DEFAULT_CALL_ROOM_ID,
            caller: callerUser,
            recipient: null,
            participants: [callerUser],
            isCaller: false,
            isGroupCall: !!data.is_group_call,
            mediaState: 'idle',
            mediaError: null,
            isRecording: false,
            recordingSeconds: 0,
            remoteRecording: null,
            otherDeviceAcceptedMessage: null,
          };
          ringtoneService.play();
          this.notify();
          break;
        }

        // The web client transitions its caller on `call_response`, and the
        // backend additionally synthesises a `call_accepted` from it. Both shapes
        // are handled here so mobile↔web and mobile↔mobile take the same path.
        case 'call_accepted': {
          this.handleCallAccepted(data);
          break;
        }

        case 'call_response': {
          const status = data.status;
          if (status === 'accepted') {
            this.handleCallAccepted(data);
          } else if (status === 'declined' || status === 'busy' || status === 'ended') {
            if (this.isEventForCurrentCall(data)) {
              this.endCall(false);
            }
          }
          break;
        }

        case 'call_declined':
        case 'call_expired':
        case 'call_cancel':
        case 'call_cancelled':
        case 'call_ended':
        case 'call_ended_for_all':
        case 'mesh_end': {
          // The old condition also fired on `!this.state.callId`, so any stray
          // terminal event received while idle ran a full endCall(). Note
          // `call_ended_for_all` reaches EVERY logged-in user (the backend
          // broadcast_to_all's it), which makes this gate load-bearing.
          if (this.isEventForCurrentCall(data)) {
            this.endCall(false);
          }
          break;
        }

        case 'recording_state_change': {
          // Broadcast to every connected user by the backend, so it must be
          // scoped to the current call or an unrelated host's recording lights up
          // this device's REC badge.
          if (!this.isEventForCurrentCall(data)) return;
          const isRecording = !!data.isRecording;
          const isSelf = this.isEventFromSelf(data);
          this.state = {
            ...this.state,
            isRecording,
            remoteRecording:
              isRecording && !isSelf ? { recordedBy: data.recordedBy || 'Host' } : null,
            // The web sender includes its privacy choice on this event too, not
            // only on recording_visibility_change.
            notifyParticipantsOfRecording:
              data.notifyParticipants === undefined
                ? this.state.notifyParticipantsOfRecording
                : !!data.notifyParticipants,
          };
          this.notify();
          break;
        }

        case 'recording_visibility_change': {
          if (!this.isEventForCurrentCall(data)) return;
          this.state = {
            ...this.state,
            notifyParticipantsOfRecording: !!data.notifyParticipants,
          };
          this.notify();
          break;
        }
      }
    });
  }

  /**
   * Shared by `call_accepted` and `call_response{status:'accepted'}`.
   *
   * The multi-device branch must fire ONLY when another session of *this* user
   * answered. Without the user check, a normal mobile→mobile acceptance trips it:
   * the backend stamps its own `session_id` onto the callee's relayed
   * `call_accepted`, which never equals the caller's session id, so the caller
   * would show "accepted on another device" instead of connecting.
   *
   * The web→mobile path is unaffected: the backend's synthesised payload carries
   * `accepted_by_session_id` / `accepted_by_user_id` and no `session_id` at all,
   * so both guards stay falsy exactly as they do today.
   */
  private handleCallAccepted(data: any) {
    const isSameCall = !data.call_id || data.call_id === this.state.callId;
    if (!isSameCall) return;

    const myUserId = String(authStore.getState().user?.id || '');
    const acceptedByUserId = String(
      data.accepted_by_user_id ?? data.sender_user_id ?? data.user_id ?? ''
    );
    const acceptedBySession = data.accepted_by_session_id || data.session_id;

    const acceptedByMyAccount = !!myUserId && acceptedByUserId === myUserId;
    const isOtherSession =
      acceptedByMyAccount && !!acceptedBySession && acceptedBySession !== this.state.sessionId;

    if (
      isOtherSession &&
      (this.state.callState === 'incoming' || this.state.callState === 'outgoing')
    ) {
      ringtoneService.stop();
      this.state = {
        ...this.state,
        callState: 'already_accepted',
        otherDeviceAcceptedMessage:
          'This call was accepted on another active device or session. Only one user session is valid for call acceptance.',
      };
      this.notify();

      // Automatically dismiss after 5 seconds
      setTimeout(() => {
        if (this.state.callState === 'already_accepted') {
          this.state = {
            ...this.state,
            callState: 'idle',
            otherDeviceAcceptedMessage: null,
          };
          this.notify();
        }
      }, 5000);
      return;
    }

    // If caller was waiting for recipient to accept
    if (this.state.callState === 'outgoing') {
      ringtoneService.stop();
      this.state = {
        ...this.state,
        callState: 'active',
      };
      this.notify();
      this.startMediaSession();
    }
  }

  /**
   * Terminal / stateful call events arrive over three different backend
   * fan-outs — targeted, per-conversation and (for `call_ended_for_all`,
   * `recording_*` and friends) an unconditional broadcast to every logged-in
   * user — and the web client omits `call_id` from several of them. Correlate on
   * whatever identity the payload actually carries, most specific first.
   */
  /**
   * The backend echoes every relayed call event back to the sender's own
   * sessions, so a self-echo has to be recognised or this device reacts to its
   * own actions as if they came from the other party.
   */
  private isEventFromSelf(data: any): boolean {
    const myUserId = String(authStore.getState().user?.id || '');
    if (!myUserId) return false;
    const senderId = String(data.sender_user_id ?? data.user_id ?? '');
    return !!senderId && senderId === myUserId;
  }

  private isEventForCurrentCall(data: any): boolean {
    if (this.state.callState === 'idle') return false;

    if (data.call_id && this.state.callId) {
      return String(data.call_id) === String(this.state.callId);
    }

    // The backend stamps sender_user_id on every relayed call event.
    const remoteId = this.state.isCaller ? this.state.recipient?.id : this.state.caller?.id;
    if (data.sender_user_id && remoteId) {
      return String(data.sender_user_id) === String(remoteId);
    }

    // Last resort: the room. 'direct-call-room' is the shared fallback literal for
    // every conversation-less 1:1 call in the deployment, so it identifies nothing
    // and is deliberately not accepted here.
    const room = data.conversation_id || data.channel_id;
    if (room && this.state.roomId && room !== DEFAULT_CALL_ROOM_ID) {
      return String(room) === String(this.state.roomId);
    }

    return false;
  }

  // ───────────────────────────────────────────────────────────────────────────
  // Media engine wiring
  //
  // The store mirrors the engine; it never owns media state. All four
  // subscriptions replay immediately on registration, which is what seeds the
  // mirror at construction time.
  // ───────────────────────────────────────────────────────────────────────────

  private setupMediaListeners() {
    meetingWebRTCManager.onStateChange((sfuState: SfuMeetingState) => {
      const mediaState = toMediaState(sfuState);
      // The engine notifies synchronously and unconditionally, including on a
      // same-value set, so dedupe here rather than re-rendering every screen.
      if (mediaState === this.state.mediaState) return;
      this.state = {
        ...this.state,
        mediaState,
        // A recovered session should not keep showing the failure that caused it.
        mediaError: mediaState === 'connected' ? null : this.state.mediaError,
      };
      this.notify();
    });

    meetingWebRTCManager.onDeviceStateChange((deviceState: LocalDeviceState) => {
      const isMuted = !deviceState.micEnabled;
      const isVideoOff = !deviceState.camEnabled;
      const isSpeakerOn = deviceState.audioRoute === 'speaker';
      if (
        isMuted === this.state.isMuted &&
        isVideoOff === this.state.isVideoOff &&
        isSpeakerOn === this.state.isSpeakerOn
      ) {
        return;
      }
      this.state = { ...this.state, isMuted, isVideoOff, isSpeakerOn };
      this.notify();
    });

    meetingWebRTCManager.onError((error: MeetingError) => {
      this.state = { ...this.state, mediaError: error.message };
      this.notify();
    });
  }

  /**
   * Joins the SFU room for the current call. Safe to call more than once: the
   * engine's own `join()` guard makes a second call a silent no-op while a
   * session is live, so the in-call screen may call it too without racing.
   */
  startMediaSession() {
    const roomId = this.state.roomId || this.state.conversationId || DEFAULT_CALL_ROOM_ID;
    const user = authStore.getState().user;
    // Never send the sentinels — the SFU rewrites 'Participant'/'Teammate' to
    // 'User' server-side and display names would diverge between clients.
    const displayName = user?.display_name || user?.username || 'User';

    this.state = { ...this.state, roomId, mediaError: null };
    this.notify();

    meetingWebRTCManager.join(roomId, displayName).catch((err) => {
      console.warn('Start media session error:', err);
    });
  }

  /** Idempotent — the engine's `leave()` returns immediately when IDLE or LEFT. */
  stopMediaSession() {
    meetingWebRTCManager.leave().catch((err) => {
      console.warn('Stop media session error:', err);
    });
  }

  // ───────────────────────────────────────────────────────────────────────────
  // Call lifecycle
  // ───────────────────────────────────────────────────────────────────────────

  initiateCall(recipient: CallParticipant, type: CallType, conversationId?: string) {
    if (this.state.callState !== 'idle' && this.state.callState !== 'already_accepted') {
      return;
    }

    const current = authStore.getState().user;
    const generatedCallId = `call-${Date.now()}`;

    const hostParticipant: CallParticipant = {
      id: current?.id || 'me',
      name: current?.display_name || current?.username || 'You',
      avatar: current?.avatar_url,
      isHost: true,
    };

    this.state = {
      ...this.state,
      callState: 'outgoing',
      callType: type,
      callId: generatedCallId,
      conversationId: conversationId || null,
      // Same convention as the web overlay: the conversation id is the room, and
      // conversation-less calls share the 'direct-call-room' literal.
      roomId: conversationId || DEFAULT_CALL_ROOM_ID,
      caller: hostParticipant,
      recipient,
      participants: [hostParticipant, recipient],
      isCaller: true,
      isGroupCall: false,
      isMuted: false,
      isVideoOff: false,
      mediaState: 'idle',
      mediaError: null,
      isRecording: false,
      recordingSeconds: 0,
      remoteRecording: null,
      otherDeviceAcceptedMessage: null,
    };
    this.notify();

    wsService.send({
      type: 'call_invite',
      call_id: generatedCallId,
      target_user_id: recipient.id,
      conversation_id: conversationId || null,
      call_type: type,
      // Without this the recipient's `caller.id` degraded to the literal 'caller',
      // which then matched no user and broke every targeted reply.
      caller_id: hostParticipant.id,
      caller_name: hostParticipant.name,
      caller_avatar: hostParticipant.avatar,
      session_id: this.state.sessionId,
      is_group_call: false,
    });
  }

  acceptCall() {
    ringtoneService.stop();
    const current = authStore.getState().user;
    const callerId = this.state.caller?.id;

    // Without target_user_id the backend's `if target_user_id:` branch never runs
    // and the caller is never told the call was answered.
    wsService.send({
      type: 'call_accepted',
      call_id: this.state.callId,
      target_user_id: callerId,
      conversation_id: this.state.conversationId,
      session_id: this.state.sessionId,
      user_id: current?.id,
      user_name: current?.display_name || current?.username,
    });

    // The web caller transitions on `call_response` only, and this is also the
    // event the backend turns into its clean synthesised `call_accepted`.
    wsService.send({
      type: 'call_response',
      status: 'accepted',
      call_id: this.state.callId,
      target_user_id: callerId,
      conversation_id: this.state.conversationId,
      session_id: this.state.sessionId,
    });

    this.state = {
      ...this.state,
      callState: 'active',
      roomId: this.state.roomId || this.state.conversationId || DEFAULT_CALL_ROOM_ID,
      otherDeviceAcceptedMessage: null,
    };
    this.notify();

    this.startMediaSession();
  }

  declineCall() {
    ringtoneService.stop();
    const callerId = this.state.caller?.id;

    wsService.send({
      type: 'call_declined',
      call_id: this.state.callId,
      target_user_id: callerId,
      conversation_id: this.state.conversationId,
      session_id: this.state.sessionId,
    });
    // Web routes its caller's "call was declined" off `call_response`.
    wsService.send({
      type: 'call_response',
      status: 'declined',
      call_id: this.state.callId,
      target_user_id: callerId,
      conversation_id: this.state.conversationId,
      session_id: this.state.sessionId,
    });

    this.state = {
      ...this.state,
      callState: 'idle',
      callId: null,
      roomId: null,
      caller: null,
      recipient: null,
      participants: [],
      otherDeviceAcceptedMessage: null,
    };
    this.notify();
  }

  endCall(sendWs: boolean = true) {
    ringtoneService.stop();
    if (this.recordingTimer) {
      clearInterval(this.recordingTimer);
      this.recordingTimer = null;
    }

    if (sendWs && this.state.callId) {
      const remoteId = this.state.isCaller
        ? this.state.recipient?.id
        : this.state.caller?.id;
      const room = this.state.roomId || this.state.conversationId || DEFAULT_CALL_ROOM_ID;
      const wasRinging = this.state.callState === 'outgoing';

      // `call_ended` is in NEITHER backend allow-list and was silently dropped, so
      // a remote hangup never arrived. These three are all routed events:
      //  - call_ended_for_all: what the web client itself sends on hangup.
      //  - call_response{ended}: what the web caller's router turns into endCall().
      //  - call_expired: the only routed event that dismisses a web callee's
      //    still-ringing incoming-call modal when the caller cancels.
      wsService.send({
        type: 'call_ended_for_all',
        call_id: this.state.callId,
        target_user_id: remoteId,
        conversation_id: room,
        channel_id: room,
        session_id: this.state.sessionId,
      });
      wsService.send({
        type: 'call_response',
        status: 'ended',
        call_id: this.state.callId,
        target_user_id: remoteId,
        conversation_id: this.state.conversationId,
        session_id: this.state.sessionId,
      });
      if (wasRinging) {
        wsService.send({
          type: 'call_expired',
          call_id: this.state.callId,
          target_user_id: remoteId,
          conversation_id: this.state.conversationId,
          session_id: this.state.sessionId,
        });
      }
    }

    // Runs synchronously through the engine's teardown, so the mediaState mirror
    // is already 'idle' by the time the new state object is built below.
    this.stopMediaSession();

    this.state = {
      ...this.state,
      callState: 'idle',
      callId: null,
      conversationId: null,
      roomId: null,
      caller: null,
      recipient: null,
      participants: [],
      isCaller: false,
      isGroupCall: false,
      mediaState: 'idle',
      mediaError: null,
      isRecording: false,
      recordingSeconds: 0,
      remoteRecording: null,
    };
    this.notify();
  }

  // Feature: Add People to 1-to-1 or group call (ENABLED always)
  addParticipant(user: CallParticipant) {
    // Check if participant is already in the list
    if (this.state.participants.some((p) => p.id === user.id)) {
      return;
    }

    this.state = {
      ...this.state,
      isGroupCall: true,
      participants: [...this.state.participants, user],
    };
    this.notify();

    // Send call invite to new participant
    const current = authStore.getState().user;
    wsService.send({
      type: 'call_invite',
      call_id: this.state.callId,
      target_user_id: user.id,
      conversation_id: this.state.conversationId,
      call_type: this.state.callType,
      caller_id: current?.id,
      caller_name: current?.display_name || current?.username || 'Host',
      caller_avatar: current?.avatar_url,
      session_id: this.state.sessionId,
      is_group_call: true,
    });
  }

  // Feature: Host Recording Toggle (Start/Stop Recording)
  //
  // Signalling only. The web "recording" is a canvas composite driven by
  // MediaRecorder + document.querySelectorAll('video'), none of which exists on
  // React Native, and the SFU has no recording capability at all. What is real
  // and cross-client is the badge and the privacy toggle below.
  toggleRecording() {
    const nextRecording = !this.state.isRecording;
    if (nextRecording) {
      this.state.recordingSeconds = 0;
      this.recordingTimer = setInterval(() => {
        this.state.recordingSeconds += 1;
        this.notify();
      }, 1000);
    } else {
      if (this.recordingTimer) {
        clearInterval(this.recordingTimer);
        this.recordingTimer = null;
      }
    }

    const current = authStore.getState().user;
    const hostName = current?.display_name || current?.username || 'Host';
    const remoteId = this.state.isCaller ? this.state.recipient?.id : this.state.caller?.id;
    const room = this.state.roomId || this.state.conversationId || DEFAULT_CALL_ROOM_ID;

    this.state = {
      ...this.state,
      isRecording: nextRecording,
      // This device is the one recording, so there is no remote notice to show.
      remoteRecording: null,
    };
    this.notify();

    wsService.send({
      type: 'recording_state_change',
      call_id: this.state.callId,
      // The web peer keys its banner off conversation_id/channel_id and renders
      // `recordedBy`, so both are sent for cross-client parity.
      conversation_id: this.state.conversationId || room,
      channel_id: room,
      target_user_id: remoteId,
      recordedBy: hostName,
      isRecording: nextRecording,
      notifyParticipants: this.state.notifyParticipantsOfRecording,
    });
  }

  // Feature: Host Privacy Toggle - Show/Hide recording notification for other attendees
  toggleRecordingVisibility(): boolean {
    const nextVisibility = !this.state.notifyParticipantsOfRecording;
    this.state = {
      ...this.state,
      notifyParticipantsOfRecording: nextVisibility,
    };
    this.notify();

    wsService.send({
      type: 'recording_visibility_change',
      call_id: this.state.callId,
      conversation_id: this.state.conversationId,
      isRecording: this.state.isRecording,
      notifyParticipants: nextVisibility,
    });

    return nextVisibility;
  }

  // ───────────────────────────────────────────────────────────────────────────
  // Media controls
  //
  // These were pure booleans that touched no hardware and no signalling. They now
  // drive the engine; the resulting deviceState emission is what actually writes
  // the mirrored booleans back. The optimistic local flip is only there so the
  // button reacts on the same frame as the tap — an acquisition failure is
  // corrected within a few hundred ms by onDeviceStateChange.
  // ───────────────────────────────────────────────────────────────────────────

  toggleMute() {
    const deviceState = meetingWebRTCManager.getDeviceState();
    const nextMuted = deviceState.micEnabled;

    // With no session live, `enableMicrophone()` would open the capture device
    // outside a call. Record the preference locally instead; the engine re-reads
    // its own micEnabled at join time.
    if (this.state.mediaState !== 'idle') {
      if (deviceState.micEnabled) {
        meetingWebRTCManager.disableMicrophone();
      } else {
        meetingWebRTCManager.enableMicrophone(deviceState.selectedMicId).catch((err) => {
          console.warn('Enable microphone error:', err);
        });
      }
    }

    this.state = { ...this.state, isMuted: nextMuted };
    this.notify();
  }

  toggleVideo() {
    const deviceState = meetingWebRTCManager.getDeviceState();
    const nextVideoOff = deviceState.camEnabled;

    if (this.state.mediaState !== 'idle') {
      if (deviceState.camEnabled) {
        meetingWebRTCManager.disableCamera();
      } else {
        meetingWebRTCManager.enableCamera(deviceState.selectedCamId).catch((err) => {
          console.warn('Enable camera error:', err);
        });
      }
    }

    this.state = { ...this.state, isVideoOff: nextVideoOff };
    this.notify();
  }

  /**
   * NOTE: `setAudioRoute` is state-only until a native routing module ships —
   * react-native-webrtc exposes no routing API and `react-native-incall-manager`
   * is deliberately not installed. The toggle stays coherent; the OS output route
   * does not change yet.
   */
  toggleSpeaker() {
    const deviceState = meetingWebRTCManager.getDeviceState();
    const nextRoute: AudioRoute = deviceState.audioRoute === 'speaker' ? 'earpiece' : 'speaker';

    meetingWebRTCManager.setAudioRoute(nextRoute).catch((err) => {
      console.warn('Set audio route error:', err);
    });

    this.state = { ...this.state, isSpeakerOn: nextRoute === 'speaker' };
    this.notify();
  }

  /** Front/back flip. No track swap and no renegotiation — remote peers see only
   *  a changed picture, which is why mobile has no camera-device picker. */
  switchCamera() {
    meetingWebRTCManager.switchCamera().catch((err) => {
      console.warn('Switch camera error:', err);
    });
  }

  clearMediaError() {
    if (this.state.mediaError === null) return;
    this.state = { ...this.state, mediaError: null };
    this.notify();
  }

  dismissOtherDeviceAlert() {
    this.state = {
      ...this.state,
      callState: 'idle',
      otherDeviceAcceptedMessage: null,
    };
    this.notify();
  }
}

export const callStore = new CallStore();
