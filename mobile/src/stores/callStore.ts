import { wsService } from '../services/websocketService';
import { ringtoneService } from '../services/ringtoneService';
import { authStore } from './authStore';

export type CallState = 'idle' | 'incoming' | 'outgoing' | 'active' | 'already_accepted';
export type CallType = 'video' | 'audio';

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

  // Media controls
  isMuted: boolean;
  isVideoOff: boolean;
  isSpeakerOn: boolean;

  // Recording feature & privacy toggle (Host controls)
  isRecording: boolean;
  notifyParticipantsOfRecording: boolean;
  recordingSeconds: number;

  // Multi-device synchronization notification banner
  otherDeviceAcceptedMessage: string | null;
}

type Listener = () => void;

class CallStore {
  private state: CallStoreState = {
    callState: 'idle',
    callType: 'video',
    callId: null,
    conversationId: null,
    sessionId: `sess-mob-${Math.random().toString(36).substring(2, 8)}-${Date.now()}`,
    caller: null,
    recipient: null,
    participants: [],
    isCaller: false,
    isGroupCall: false,
    isMuted: false,
    isVideoOff: false,
    isSpeakerOn: true,
    isRecording: false,
    notifyParticipantsOfRecording: true,
    recordingSeconds: 0,
    otherDeviceAcceptedMessage: null,
  };

  private listeners: Set<Listener> = new Set();
  private recordingTimer: any = null;

  constructor() {
    this.setupWebSocketListeners();
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

  private setupWebSocketListeners() {
    wsService.on((data: any) => {
      if (!data || !data.type) return;

      switch (data.type) {
        case 'call_invite': {
          // Check if already in a call
          if (this.state.callState !== 'idle' && this.state.callState !== 'already_accepted') {
            return;
          }

          const callerUser: CallParticipant = {
            id: data.caller_id || data.user_id || 'caller',
            name: data.caller_name || 'Teammate',
            avatar: data.caller_avatar,
          };

          this.state = {
            ...this.state,
            callState: 'incoming',
            callType: data.call_type === 'audio' ? 'audio' : 'video',
            callId: data.call_id || `call-${Date.now()}`,
            conversationId: data.conversation_id || null,
            caller: callerUser,
            recipient: null,
            participants: [callerUser],
            isCaller: false,
            isGroupCall: !!data.is_group_call,
            otherDeviceAcceptedMessage: null,
          };
          ringtoneService.play();
          this.notify();
          break;
        }

        case 'call_accepted': {
          // If this incoming call was accepted by ANOTHER session of the current user
          const isOtherSession = data.session_id && data.session_id !== this.state.sessionId;
          const isSameCall = !data.call_id || data.call_id === this.state.callId;

          if (isOtherSession && isSameCall && (this.state.callState === 'incoming' || this.state.callState === 'outgoing')) {
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
          if (this.state.callState === 'outgoing' && isSameCall) {
            ringtoneService.stop();
            this.state = {
              ...this.state,
              callState: 'active',
            };
            this.notify();
          }
          break;
        }

        case 'call_declined':
        case 'call_ended': {
          if (data.call_id === this.state.callId || !this.state.callId) {
            this.endCall(false);
          }
          break;
        }

        case 'recording_state_change': {
          this.state = {
            ...this.state,
            isRecording: !!data.isRecording,
          };
          this.notify();
          break;
        }

        case 'recording_visibility_change': {
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
      caller: hostParticipant,
      recipient,
      participants: [hostParticipant, recipient],
      isCaller: true,
      isGroupCall: false,
      isMuted: false,
      isVideoOff: false,
      isRecording: false,
      recordingSeconds: 0,
      otherDeviceAcceptedMessage: null,
    };
    this.notify();

    wsService.send({
      type: 'call_invite',
      call_id: generatedCallId,
      target_user_id: recipient.id,
      conversation_id: conversationId || null,
      call_type: type,
      caller_name: hostParticipant.name,
      caller_avatar: hostParticipant.avatar,
      session_id: this.state.sessionId,
      is_group_call: false,
    });
  }

  acceptCall() {
    ringtoneService.stop();
    const current = authStore.getState().user;

    wsService.send({
      type: 'call_accepted',
      call_id: this.state.callId,
      session_id: this.state.sessionId,
      user_id: current?.id,
      user_name: current?.display_name || current?.username,
    });

    this.state = {
      ...this.state,
      callState: 'active',
      otherDeviceAcceptedMessage: null,
    };
    this.notify();
  }

  declineCall() {
    ringtoneService.stop();
    wsService.send({
      type: 'call_declined',
      call_id: this.state.callId,
      session_id: this.state.sessionId,
    });

    this.state = {
      ...this.state,
      callState: 'idle',
      callId: null,
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
      wsService.send({
        type: 'call_ended',
        call_id: this.state.callId,
        session_id: this.state.sessionId,
      });
    }

    this.state = {
      ...this.state,
      callState: 'idle',
      callId: null,
      conversationId: null,
      caller: null,
      recipient: null,
      participants: [],
      isCaller: false,
      isGroupCall: false,
      isRecording: false,
      recordingSeconds: 0,
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
      caller_name: current?.display_name || current?.username || 'Host',
      caller_avatar: current?.avatar_url,
      session_id: this.state.sessionId,
      is_group_call: true,
    });
  }

  // Feature: Host Recording Toggle (Start/Stop Recording)
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

    this.state = {
      ...this.state,
      isRecording: nextRecording,
    };
    this.notify();

    wsService.send({
      type: 'recording_state_change',
      call_id: this.state.callId,
      conversation_id: this.state.conversationId,
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

  toggleMute() {
    this.state = { ...this.state, isMuted: !this.state.isMuted };
    this.notify();
  }

  toggleVideo() {
    this.state = { ...this.state, isVideoOff: !this.state.isVideoOff };
    this.notify();
  }

  toggleSpeaker() {
    this.state = { ...this.state, isSpeakerOn: !this.state.isSpeakerOn };
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
