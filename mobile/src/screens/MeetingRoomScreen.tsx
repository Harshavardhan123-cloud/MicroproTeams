import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Animated,
  BackHandler,
  Easing,
  FlatList,
  KeyboardAvoidingView,
  Modal,
  Platform,
  SafeAreaView,
  ScrollView,
  Share,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
  useWindowDimensions,
} from 'react-native';
import { useNavigation, useRoute, RouteProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { RTCView } from 'react-native-webrtc';
import type { MediaStream } from 'react-native-webrtc';

import { Colors } from '../theme/colors';
import { Avatar } from '../components/common/Avatar';
import { Toast } from '../components/common/Toast';
import { ActionSheet } from '../components/common/ActionSheet';
import type { ActionSheetOption } from '../components/common/ActionSheet';
import { AddPeopleModal } from '../components/call/AddPeopleModal';
import { DeviceSettingsModal } from '../components/modals/DeviceSettingsModal';
import { apiClient, getTargetHostUrl } from '../api/client';
import { authStore } from '../stores/authStore';
import { callStore } from '../stores/callStore';
import { wsService } from '../services/websocketService';
import { meetingWebRTCManager } from '../services/MeetingWebRTCManager';
import type {
  AudioRoute,
  LocalDeviceState,
  MeetingState,
  RemoteParticipantStream,
} from '../services/MeetingWebRTCManager';
import type { RootStackParamList } from '../navigation/types';

// ---------------------------------------------------------------------------
// Types & constants
// ---------------------------------------------------------------------------

/**
 * The web app has two in-call surfaces that are not feature-equal:
 * `FullscreenCallOverlay` (1:1 + escalated group calls, hands/reactions/chat/pin)
 * and `MeetingRoom` (scheduled meetings, lobby + waiting-for-host). Both drive the
 * same media engine, so this screen is their union: the phase machine below comes
 * from `MeetingRoom`, everything above `'in-call'` comes from the overlay.
 */
type JoinPhase = 'loading' | 'ready-to-join' | 'waiting-for-host' | 'in-call' | 'error';

interface MeetingDetails {
  id: string;
  title?: string;
  meeting_code?: string;
  status?: string;
  host_id?: string;
}

/**
 * `remoteStreams` is keyed by producerId, so one peer publishing mic + camera +
 * screen arrives as THREE entries sharing a `participantId`. Grouping them into
 * per-participant tiles is the UI's job — and the screen share gets its own slot
 * rather than overwriting the camera (which is what web's `MeetingRoom` does).
 */
interface Tile {
  participantId: string;
  userName: string;
  videoStream?: MediaStream;
  audioStream?: MediaStream;
  screenStream?: MediaStream;
}

type StageVariant = 'localCamera' | 'localScreen' | 'remoteCamera' | 'remoteScreen';

interface StageTarget {
  key: string;
  title: string;
  variant: StageVariant;
  userName: string;
  stream?: MediaStream | null;
}

interface ChatEntry {
  msgId: string;
  senderName: string;
  text: string;
  mine: boolean;
}

interface FloatingReaction {
  id: string;
  emoji: string;
  x: number;
}

type ToastKind = 'info' | 'success' | 'warning' | 'error';

/** `MeetingRoom.tsx`'s admission poll. The only gate is `status !== 'IN_PROGRESS'`
 *  — there is no host admit/deny queue anywhere in this product. */
const POLL_INTERVAL_MS = 4000;

/** The overlay's reconnect grace window before it force-disconnects. */
const RECONNECT_GRACE_SECONDS = 20;

const REACTION_LIFETIME_MS = 3000;
const REACTIONS = ['👍', '❤️', '👏', '🔥'];

const TOAST_MS = 3000;
const ERROR_TOAST_MS = 5000;

/** Sentinel pin keys. Nothing about pinning is ever sent to any socket. */
const PIN_LOCAL = 'local';
const PIN_LOCAL_SCREEN = 'local_screen';

const CONNECTING_STATES: MeetingState[] = ['CONNECTING', 'JOINING', 'CONNECTING_MEDIA'];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * `MeetingRoom.tsx`'s stricter has-video test (the overlay only checks for the
 * presence of a track). A paused/ended track still exists on the stream, so
 * without the `enabled`/`readyState` check a muted camera renders as a black
 * rectangle instead of falling back to the avatar card.
 */
const hasLiveVideo = (stream?: MediaStream | null): boolean => {
  if (!stream) return false;
  try {
    return stream.getVideoTracks().some((track) => track.enabled && track.readyState !== 'ended');
  } catch {
    return false;
  }
};

/** `toURL()` has to be recomputed on every emission: the manager hands out a new
 *  MediaStream object per rebuild and RTCView only rebinds when the URL changes. */
const streamUrl = (stream?: MediaStream | null): string | null => {
  if (!stream) return null;
  try {
    return stream.getTracks().length > 0 ? stream.toURL() : null;
  } catch {
    return null;
  }
};

/** MM:SS for calls (the overlay), HH:MM:SS for meetings (useElapsedTime). */
const formatElapsed = (totalSeconds: number, withHours: boolean): string => {
  const safe = Math.max(0, totalSeconds);
  const hours = Math.floor(safe / 3600);
  const minutes = Math.floor((safe % 3600) / 60);
  const seconds = safe % 60;
  const pad = (n: number) => n.toString().padStart(2, '0');
  return withHours ? `${pad(hours)}:${pad(minutes)}:${pad(seconds)}` : `${pad(Math.floor(safe / 60))}:${pad(seconds)}`;
};

const normalizeStatus = (status?: string): string => (status || '').toUpperCase();

const evaluatePhase = (
  meeting: MeetingDetails,
  userId?: string,
): { phase: JoinPhase; error?: string } => {
  if (normalizeStatus(meeting.status) === 'ENDED') {
    return { phase: 'error', error: 'This meeting has already ended.' };
  }
  // Both sides are String()-coerced: the web comparison is raw, so a UUID-typed
  // host id never matches and the host gets routed into waiting-for-host.
  if (userId && meeting.host_id && String(meeting.host_id) === String(userId)) {
    return { phase: 'ready-to-join' };
  }
  if (normalizeStatus(meeting.status) === 'IN_PROGRESS') {
    return { phase: 'ready-to-join' };
  }
  return { phase: 'waiting-for-host' };
};

// ---------------------------------------------------------------------------
// Small presentational pieces
// ---------------------------------------------------------------------------

const ReactionBubble: React.FC<{ reaction: FloatingReaction; width: number }> = ({
  reaction,
  width,
}) => {
  const anim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.timing(anim, {
      toValue: 1,
      duration: REACTION_LIFETIME_MS,
      easing: Easing.out(Easing.quad),
      useNativeDriver: true,
    }).start();
  }, [anim]);

  const translateY = anim.interpolate({ inputRange: [0, 1], outputRange: [0, -190] });
  const opacity = anim.interpolate({ inputRange: [0, 0.75, 1], outputRange: [1, 1, 0] });

  return (
    <Animated.Text
      style={[
        styles.reactionBubble,
        { left: (reaction.x / 100) * width, transform: [{ translateY }], opacity },
      ]}
    >
      {reaction.emoji}
    </Animated.Text>
  );
};

interface ControlButtonProps {
  icon: string;
  label: string;
  onPress: () => void;
  active?: boolean;
  danger?: boolean;
  badge?: string | null;
}

const ControlButton: React.FC<ControlButtonProps> = ({
  icon,
  label,
  onPress,
  active,
  danger,
  badge,
}) => (
  <TouchableOpacity
    style={[styles.hudButton, active && styles.hudButtonDanger, danger && styles.hudButtonEndCall]}
    onPress={onPress}
    activeOpacity={0.7}
  >
    <Text style={styles.hudEmoji}>{icon}</Text>
    <Text style={styles.hudLabel}>{label}</Text>
    {badge ? (
      <View style={styles.hudBadge}>
        <Text style={styles.hudBadgeText}>{badge}</Text>
      </View>
    ) : null}
  </TouchableOpacity>
);

// ---------------------------------------------------------------------------
// Screen
// ---------------------------------------------------------------------------

export const MeetingRoomScreen: React.FC = () => {
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const route = useRoute<RouteProp<RootStackParamList, 'MeetingRoom'>>();
  const { roomId, meetingId, callType, isHost: isHostParam } = route.params;

  const { width, height } = useWindowDimensions();
  const isLandscape = width > height;

  const currentUser = authStore.getState().user;
  const myUserId = String(currentUser?.id ?? 'local');
  const myUserIdRef = useRef(myUserId);
  myUserIdRef.current = myUserId;

  // The server rewrites falsy / 'Participant' / 'Teammate' to the literal 'User',
  // so never send those — display names would diverge from web in the same room.
  const displayName =
    route.params.displayName || currentUser?.display_name || currentUser?.username || 'User';

  // ── Engine state (all four registries replay immediately on subscribe) ────
  const [meetingState, setMeetingState] = useState<MeetingState>(() =>
    meetingWebRTCManager.getState(),
  );
  const [remoteStreams, setRemoteStreams] = useState<RemoteParticipantStream[]>(() =>
    meetingWebRTCManager.getRemoteStreams(),
  );
  const [deviceState, setDeviceState] = useState<LocalDeviceState>(() =>
    meetingWebRTCManager.getDeviceState(),
  );
  const [localStream, setLocalStream] = useState<MediaStream | null>(() =>
    meetingWebRTCManager.getLocalStream(),
  );
  const localStreamRef = useRef<MediaStream | null>(localStream);

  // ── Screen state ─────────────────────────────────────────────────────────
  const [phase, setPhase] = useState<JoinPhase>(meetingId ? 'loading' : 'in-call');
  const [meeting, setMeeting] = useState<MeetingDetails | null>(null);
  const [hostName, setHostName] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [elapsed, setElapsed] = useState(0);
  const [reconnectSeconds, setReconnectSeconds] = useState(RECONNECT_GRACE_SECONDS);

  const [pinnedKey, setPinnedKey] = useState<string | null>(null);
  const [raisedHands, setRaisedHands] = useState<Map<string, string>>(new Map());
  const [reactions, setReactions] = useState<FloatingReaction[]>([]);
  const [reactionBarOpen, setReactionBarOpen] = useState(false);

  const [chatMessages, setChatMessages] = useState<ChatEntry[]>([]);
  const [chatOpen, setChatOpen] = useState(false);
  const [chatUnread, setChatUnread] = useState(0);
  const [chatDraft, setChatDraft] = useState('');
  const chatOpenRef = useRef(false);
  chatOpenRef.current = chatOpen;

  const [moreSheetVisible, setMoreSheetVisible] = useState(false);
  const [leaveSheetVisible, setLeaveSheetVisible] = useState(false);
  const [devicesVisible, setDevicesVisible] = useState(false);
  const [addPeopleVisible, setAddPeopleVisible] = useState(false);

  const [toast, setToast] = useState<{ message: string; type: ToastKind } | null>(null);
  const toastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const reactionTimersRef = useRef<Array<ReturnType<typeof setTimeout>>>([]);

  const joinedRef = useRef(false);
  const autoJoinedRef = useRef(false);
  const previewStartedRef = useRef(false);

  const [callSnapshot, setCallSnapshot] = useState(() => callStore.getState());

  const isHost = useMemo(() => {
    if (typeof isHostParam === 'boolean') return isHostParam;
    if (meeting?.host_id && currentUser?.id) {
      return String(meeting.host_id) === String(currentUser.id);
    }
    return callSnapshot.isCaller;
  }, [isHostParam, meeting?.host_id, currentUser?.id, callSnapshot.isCaller]);

  const roomTitle =
    meeting?.title ||
    (callSnapshot.recipient?.name
      ? `Call with ${callSnapshot.recipient.name}`
      : callSnapshot.caller?.name
        ? `Call with ${callSnapshot.caller.name}`
        : 'Meeting Room');

  // ── Toast ────────────────────────────────────────────────────────────────
  const showToast = useCallback((message: string, type: ToastKind = 'info') => {
    if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    setToast({ message, type });
    toastTimerRef.current = setTimeout(
      () => setToast(null),
      type === 'error' ? ERROR_TOAST_MS : TOAST_MS,
    );
  }, []);

  // ── Engine subscriptions ─────────────────────────────────────────────────
  useEffect(() => {
    const unsubState = meetingWebRTCManager.onStateChange(setMeetingState);
    const unsubRemote = meetingWebRTCManager.onRemoteStreamsChange(setRemoteStreams);
    const unsubDevice = meetingWebRTCManager.onDeviceStateChange(setDeviceState);
    const unsubLocal = meetingWebRTCManager.onLocalStreamChange((stream) => {
      localStreamRef.current = stream;
      setLocalStream(stream);
    });
    const unsubError = meetingWebRTCManager.onError((err) => {
      showToast(err.message, 'error');
    });
    const unsubCall = callStore.subscribe(() => setCallSnapshot(callStore.getState()));

    return () => {
      unsubState();
      unsubRemote();
      unsubDevice();
      unsubLocal();
      unsubError();
      unsubCall();
    };
  }, [showToast]);

  // ── Meeting lifecycle: load, evaluate, poll ──────────────────────────────
  const loadMeeting = useCallback(async (): Promise<MeetingDetails | null> => {
    if (!meetingId) return null;
    const res = await apiClient.get(`/meetings/${meetingId}`);
    const data: MeetingDetails = res.data?.data || res.data;
    return data && data.id ? data : null;
  }, [meetingId]);

  useEffect(() => {
    if (!meetingId) return;
    let cancelled = false;

    (async () => {
      try {
        const data = await loadMeeting();
        if (cancelled) return;
        if (!data) {
          setErrorMessage('Meeting not found.');
          setPhase('error');
          return;
        }
        setMeeting(data);
        const outcome = evaluatePhase(data, currentUser?.id);
        if (outcome.error) setErrorMessage(outcome.error);
        setPhase(outcome.phase);
      } catch (err) {
        if (cancelled) return;
        const message =
          (err as { message?: string } | null)?.message || 'Failed to load meeting details.';
        setErrorMessage(message);
        setPhase('error');
      }
    })();

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [meetingId, loadMeeting]);

  // 4 s admission poll. The only gate is the meeting status flipping to
  // IN_PROGRESS — there is no admit queue to wait on.
  useEffect(() => {
    if (phase !== 'waiting-for-host' || !meetingId) return;

    const tick = async () => {
      try {
        const data = await loadMeeting();
        if (!data) return;
        setMeeting(data);
        const outcome = evaluatePhase(data, currentUser?.id);
        if (outcome.error) setErrorMessage(outcome.error);
        if (outcome.phase !== 'waiting-for-host') setPhase(outcome.phase);
      } catch {
        // Transient failures are recovered by the next tick.
      }
    };

    const id = setInterval(tick, POLL_INTERVAL_MS);
    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, meetingId, loadMeeting]);

  // Web renders `meeting?.host_id` — a raw UUID — in the waiting copy. Resolve a
  // real display name instead, and degrade to 'the host' rather than a uuid.
  useEffect(() => {
    if (phase !== 'waiting-for-host' || !meeting?.host_id || hostName) return;
    let cancelled = false;

    (async () => {
      try {
        const res = await apiClient.get('/users');
        const users = res.data?.data || res.data || [];
        if (cancelled || !Array.isArray(users)) return;
        const host = users.find((u: any) => String(u?.id) === String(meeting.host_id));
        if (host) setHostName(host.display_name || host.username || null);
      } catch {
        // Cosmetic only.
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [phase, meeting?.host_id, hostName]);

  // ── Lobby self-preview ───────────────────────────────────────────────────
  // The engine only acquires local tracks inside its join pipeline, so the lobby
  // asks for them up front. `join()` resets media state and re-acquires, so these
  // preview tracks are replaced (not leaked) the moment the user joins.
  useEffect(() => {
    if (phase !== 'ready-to-join' || previewStartedRef.current) return;
    previewStartedRef.current = true;

    (async () => {
      if (deviceState.micEnabled) {
        try {
          await meetingWebRTCManager.enableMicrophone(deviceState.selectedMicId);
        } catch {
          // Surfaced through the manager's error listener.
        }
      }
      if (deviceState.camEnabled && callType !== 'audio') {
        try {
          await meetingWebRTCManager.enableCamera(deviceState.selectedCamId);
        } catch {
          // Surfaced through the manager's error listener.
        }
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase]);

  /** Releases lobby-preview capture when the user backs out without joining.
   *  `leave()` is a no-op at IDLE, so the tracks have to be stopped directly. */
  const stopPreviewTracks = useCallback(() => {
    const stream = localStreamRef.current;
    if (!stream) return;
    try {
      stream.getTracks().forEach((track) => {
        try {
          track.stop();
        } catch {
          /* already stopped */
        }
      });
    } catch {
      /* nothing to release */
    }
  }, []);

  // ── Join / leave ─────────────────────────────────────────────────────────
  const handleJoin = useCallback(async () => {
    const engineState = meetingWebRTCManager.getState();
    // The manager's own guard makes a second join a silent no-op; surface it.
    if (engineState !== 'IDLE' && engineState !== 'LEFT' && engineState !== 'FAILED') {
      showToast('You can only attend one meeting at a time. Leave the other one first.', 'warning');
      return;
    }

    joinedRef.current = true;
    setPhase('in-call');

    // An audio call must not light up the camera. The engine's initial media step
    // reads `camEnabled`, so flipping it here (synchronously, before join) is what
    // keeps an audio call audio-only. Note this persists into the next session,
    // matching the engine's "a user who muted stays muted" semantics.
    if (callType === 'audio' && meetingWebRTCManager.getDeviceState().camEnabled) {
      meetingWebRTCManager.disableCamera();
    }

    // Host starting a SCHEDULED meeting flips it to IN_PROGRESS so the waiting
    // attendees' 4 s poll lets them in.
    if (meetingId && isHost && normalizeStatus(meeting?.status) !== 'IN_PROGRESS') {
      try {
        await apiClient.post(`/meetings/${meetingId}/join`);
      } catch (err) {
        console.warn('[MEETING] Failed to mark meeting in progress:', err);
      }
    }

    await meetingWebRTCManager.join(roomId, displayName);
  }, [callType, displayName, isHost, meeting?.status, meetingId, roomId, showToast]);

  const handleLeave = useCallback(
    async (endForEveryone: boolean) => {
      if (endForEveryone && meetingId) {
        try {
          await apiClient.post(`/meetings/${meetingId}/end`);
        } catch (err) {
          console.warn('[MEETING] Failed to end meeting for everyone:', err);
          showToast('Could not end the meeting on the server, leaving anyway.', 'warning');
        }
      }

      setPinnedKey(null);
      setRaisedHands(new Map());
      setReactions([]);

      try {
        await meetingWebRTCManager.leave();
      } catch (err) {
        console.warn('[MEETING] Leave warning:', err);
      }

      // Only touch call signalling when this screen is actually backing a call.
      if (callStore.getState().callState !== 'idle') {
        callStore.endCall(true);
      }

      if (navigation.canGoBack()) navigation.goBack();
    },
    [meetingId, navigation, showToast],
  );

  // 1:1 calls have no meeting record and no lobby — the overlay drops straight in.
  useEffect(() => {
    if (meetingId || autoJoinedRef.current) return;
    autoJoinedRef.current = true;
    void handleJoin();
  }, [meetingId, handleJoin]);

  // Unmounting without an explicit leave would strand a live session with no UI
  // (there is no minimized call banner on mobile yet), so tear it down here.
  useEffect(
    () => () => {
      if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
      reactionTimersRef.current.forEach(clearTimeout);
      reactionTimersRef.current = [];

      if (joinedRef.current) {
        const engineState = meetingWebRTCManager.getState();
        if (engineState !== 'LEFT' && engineState !== 'IDLE') {
          void meetingWebRTCManager.leave();
        }
      } else {
        stopPreviewTracks();
      }
    },
    [stopPreviewTracks],
  );

  // Hardware back must not silently drop out of a live call.
  useEffect(() => {
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      if (phase === 'in-call') {
        setLeaveSheetVisible(true);
        return true;
      }
      return false;
    });
    return () => sub.remove();
  }, [phase]);

  // ── Elapsed timer ────────────────────────────────────────────────────────
  useEffect(() => {
    if (phase !== 'in-call') return;
    const startedAt = Date.now();
    setElapsed(0);
    const id = setInterval(() => setElapsed(Math.floor((Date.now() - startedAt) / 1000)), 1000);
    return () => clearInterval(id);
  }, [phase]);

  // ── Reconnect countdown ──────────────────────────────────────────────────
  useEffect(() => {
    if (meetingState !== 'RECONNECTING') {
      setReconnectSeconds(RECONNECT_GRACE_SECONDS);
      return;
    }
    setReconnectSeconds(RECONNECT_GRACE_SECONDS);
    const id = setInterval(() => setReconnectSeconds((prev) => Math.max(0, prev - 1)), 1000);
    return () => clearInterval(id);
  }, [meetingState]);

  useEffect(() => {
    if (meetingState === 'RECONNECTING' && reconnectSeconds === 0) {
      void handleLeave(false);
    }
  }, [meetingState, reconnectSeconds, handleLeave]);

  // ── Hands / reactions / chat over the FastAPI WebSocket ──────────────────
  // None of this touches the SFU: the mediasoup server knows nothing about hands,
  // emoji or chat. It rides `call_action` / `call_chat_message` on the app socket,
  // exactly as the web overlay does, so the two clients interoperate.
  const pushReaction = useCallback((emoji: string) => {
    const id = `${Date.now()}-${Math.random()}`;
    setReactions((prev) => [...prev, { id, emoji, x: Math.random() * 70 + 15 }]);
    const timer = setTimeout(() => {
      setReactions((prev) => prev.filter((r) => r.id !== id));
    }, REACTION_LIFETIME_MS);
    reactionTimersRef.current.push(timer);
  }, []);

  useEffect(() => {
    const unsub = wsService.on((data: any) => {
      if (!data || !data.type) return;

      // The backend `broadcast_to_all`s these to every logged-in user on the
      // deployment, so scope them to this room client-side.
      if (data.conversation_id && String(data.conversation_id) !== String(roomId)) return;

      if (data.type === 'call_action') {
        // The server overwrites sender_user_id with the authenticated user id, so
        // this is the only key that both the local and the remote path agree on.
        const senderId = String(data.sender_user_id ?? '');
        const senderName = data.senderName || 'User';

        if (data.action === 'raise_hand') {
          setRaisedHands((prev) => {
            const next = new Map(prev);
            if (data.isRaised) next.set(senderId, senderName);
            else next.delete(senderId);
            return next;
          });
          if (senderId !== myUserIdRef.current && data.isRaised) {
            showToast(`${senderName} raised their hand`);
          }
          return;
        }

        if (data.action === 'reaction') {
          // Web is missing this guard, so combined with the unconditional
          // broadcast echo the sender renders their own emoji twice.
          if (senderId === myUserIdRef.current) return;
          pushReaction(String(data.emoji || '👍'));
        }
        return;
      }

      if (data.type === 'call_chat_message') {
        if (String(data.sender_user_id ?? '') === myUserIdRef.current) return;
        const msgId = String(data.msgId || `${Date.now()}-${Math.random()}`);
        setChatMessages((prev) =>
          prev.some((m) => m.msgId === msgId)
            ? prev
            : [
                ...prev,
                {
                  msgId,
                  senderName: data.senderName || 'User',
                  text: String(data.text ?? ''),
                  mine: false,
                },
              ],
        );
        if (!chatOpenRef.current) setChatUnread((count) => count + 1);
      }
    });

    return () => unsub();
  }, [roomId, pushReaction, showToast]);

  const handRaised = raisedHands.has(myUserId);

  const toggleHand = useCallback(() => {
    const nextRaised = !raisedHands.has(myUserId);
    setRaisedHands((prev) => {
      const next = new Map(prev);
      if (nextRaised) next.set(myUserId, displayName);
      else next.delete(myUserId);
      return next;
    });
    showToast(nextRaised ? 'You raised your hand' : 'You lowered your hand');
    wsService.send({
      type: 'call_action',
      conversation_id: roomId,
      channel_id: roomId,
      action: 'raise_hand',
      sender_user_id: myUserId,
      senderName: displayName,
      isRaised: nextRaised,
    });
  }, [displayName, myUserId, raisedHands, roomId, showToast]);

  const sendReaction = useCallback(
    (emoji: string) => {
      pushReaction(emoji);
      wsService.send({
        type: 'call_action',
        conversation_id: roomId,
        channel_id: roomId,
        action: 'reaction',
        sender_user_id: myUserId,
        senderName: displayName,
        emoji,
      });
    },
    [displayName, myUserId, pushReaction, roomId],
  );

  const sendChat = useCallback(() => {
    const text = chatDraft.trim();
    if (!text) return;
    const msgId = `msg-${Date.now()}-${Math.random()}`;
    setChatMessages((prev) => [...prev, { msgId, senderName: displayName, text, mine: true }]);
    setChatDraft('');
    wsService.send({
      type: 'call_chat_message',
      msgId,
      conversation_id: roomId,
      channel_id: roomId,
      target_user_id: callStore.getState().recipient?.id ?? null,
      senderName: displayName,
      text,
    });
  }, [chatDraft, displayName, roomId]);

  // ── Media controls ───────────────────────────────────────────────────────
  const toggleAudio = useCallback(() => {
    if (deviceState.micEnabled) meetingWebRTCManager.disableMicrophone();
    else void meetingWebRTCManager.enableMicrophone(deviceState.selectedMicId);
  }, [deviceState.micEnabled, deviceState.selectedMicId]);

  const toggleVideo = useCallback(() => {
    if (deviceState.camEnabled) meetingWebRTCManager.disableCamera();
    else void meetingWebRTCManager.enableCamera(deviceState.selectedCamId);
  }, [deviceState.camEnabled, deviceState.selectedCamId]);

  const toggleScreenShare = useCallback(() => {
    if (deviceState.screenSharing) void meetingWebRTCManager.stopScreenShare();
    else void meetingWebRTCManager.startScreenShare();
  }, [deviceState.screenSharing]);

  const handleResync = useCallback(() => {
    const engineState = meetingWebRTCManager.getState();
    // The engine's own guard makes a resync a silent no-op outside these two
    // states — which is exactly when a user would reach for the button.
    if (engineState !== 'IN_MEETING' && engineState !== 'MEDIA_CONNECTED') {
      showToast(`Re-sync is unavailable while the session is ${engineState}.`, 'warning');
      return;
    }
    void meetingWebRTCManager.resyncRemoteProducers();
    showToast('Re-synchronized WebRTC media tracks', 'success');
  }, [showToast]);

  const handleShareLink = useCallback(async () => {
    const code = meeting?.meeting_code || roomId;
    const url = `${getTargetHostUrl()}/meet/${code}`;
    try {
      await Share.share({ message: `Join my Micropro Commute meeting: ${url}` });
    } catch (err) {
      console.warn('[MEETING] Share sheet warning:', err);
      showToast('Could not open the share sheet.', 'warning');
    }
  }, [meeting?.meeting_code, roomId, showToast]);

  const handleSelectAudioRoute = useCallback((audioRoute: AudioRoute) => {
    void meetingWebRTCManager.setAudioRoute(audioRoute);
  }, []);

  // ── Tiles & stage ────────────────────────────────────────────────────────
  const tiles = useMemo(() => {
    const map = new Map<string, Tile>();
    for (const stream of remoteStreams) {
      const tile: Tile = map.get(stream.participantId) ?? {
        participantId: stream.participantId,
        userName: stream.userName,
      };
      if (stream.kind === 'audio') tile.audioStream = stream.stream;
      // A screen producer gets its own slot: web's MeetingRoom collapses screen
      // and camera into one field, so a share overwrites the camera tile.
      else if (stream.source === 'screen') tile.screenStream = stream.stream;
      else tile.videoStream = stream.stream;
      map.set(stream.participantId, tile);
    }
    return Array.from(map.values());
  }, [remoteStreams]);

  const stageCandidates = useMemo<StageTarget[]>(() => {
    const out: StageTarget[] = [];
    if (deviceState.screenSharing) {
      out.push({
        key: PIN_LOCAL_SCREEN,
        title: 'You are sharing your screen',
        variant: 'localScreen',
        userName: 'You',
      });
    }
    for (const tile of tiles) {
      if (!tile.screenStream) continue;
      out.push({
        key: `${tile.participantId}:screen`,
        title: `${tile.userName} (Screen Share)`,
        variant: 'remoteScreen',
        userName: tile.userName,
        stream: tile.screenStream,
      });
    }
    out.push({
      key: PIN_LOCAL,
      title: `You${deviceState.screenSharing ? ' (Sharing Screen)' : ''}`,
      variant: 'localCamera',
      userName: displayName,
      stream: localStream,
    });
    for (const tile of tiles) {
      out.push({
        key: tile.participantId,
        title: tile.userName,
        variant: 'remoteCamera',
        userName: tile.userName,
        stream: tile.videoStream,
      });
    }
    return out;
  }, [deviceState.screenSharing, displayName, localStream, tiles]);

  const stage = useMemo<StageTarget | null>(() => {
    if (pinnedKey) {
      const pinned = stageCandidates.find((candidate) => candidate.key === pinnedKey);
      if (pinned) return pinned;
    }
    // Screen share always takes the stage when nothing is explicitly pinned.
    return (
      stageCandidates.find(
        (candidate) => candidate.variant === 'localScreen' || candidate.variant === 'remoteScreen',
      ) ?? null
    );
  }, [pinnedKey, stageCandidates]);

  // The local camera lives in the self-view PIP, so it is left out of the rail
  // unless it is what is on the stage.
  const filmstrip = useMemo(
    () =>
      stageCandidates.filter(
        (candidate) => candidate.key !== stage?.key && candidate.key !== PIN_LOCAL,
      ),
    [stageCandidates, stage?.key],
  );

  const columns = useMemo(() => {
    const count = tiles.length;
    if (count <= 1) return 1;
    if (count <= 3) return 2;
    return isLandscape ? 3 : 2;
  }, [tiles.length, isLandscape]);

  const gridGutter = 10;
  const gridWidth = Math.max(160, width - 24);
  const tileWidth = Math.floor((gridWidth - gridGutter * (columns - 1)) / columns);
  const tileHeight = Math.floor(tileWidth * (columns === 1 ? 0.95 : 0.78));

  const localVideoUrl = streamUrl(localStream);
  const showLocalVideo = deviceState.camEnabled && hasLiveVideo(localStream);
  const participantCount = tiles.length + 1;

  /**
   * Hands are keyed by backend user id while tiles are keyed by the SFU
   * `socket.id`, and nothing correlates the two — so a per-tile badge can only be
   * matched on display name. The hands banner above the grid is the reliable
   * readout; this is a best-effort visual extra.
   */
  const raisedNames = useMemo(() => Array.from(raisedHands.values()), [raisedHands]);
  const isHandRaisedFor = useCallback(
    (name: string) => raisedNames.some((raised) => raised === name),
    [raisedNames],
  );

  const showRecordingBadge =
    callSnapshot.isRecording && (isHost || callSnapshot.notifyParticipantsOfRecording);

  // ── Renderers ────────────────────────────────────────────────────────────
  const renderVideoSurface = (
    stream: MediaStream | null | undefined,
    fallbackName: string,
    objectFit: 'cover' | 'contain',
    mirror: boolean,
    avatarSize: number,
  ) => {
    const url = hasLiveVideo(stream) ? streamUrl(stream) : null;
    if (url) {
      return (
        <RTCView streamURL={url} objectFit={objectFit} mirror={mirror} style={styles.videoSurface} />
      );
    }
    return (
      <View style={styles.avatarFallback}>
        <Avatar name={fallbackName} size={avatarSize} />
      </View>
    );
  };

  const renderStage = () => {
    if (!stage) return null;

    return (
      <View style={styles.stageWrap}>
        <TouchableOpacity
          style={styles.stage}
          activeOpacity={1}
          onPress={() => setPinnedKey(pinnedKey ? null : stage.key)}
        >
          {stage.variant === 'localScreen' ? (
            <View style={styles.shareCard}>
              <Text style={styles.shareIcon}>🖥️</Text>
              <Text style={styles.shareTitle}>You are sharing your screen</Text>
              <Text style={styles.shareSubtitle}>
                Everyone in this meeting can see your screen
              </Text>
            </View>
          ) : (
            renderVideoSurface(
              stage.stream,
              stage.userName,
              'contain',
              stage.variant === 'localCamera',
              96,
            )
          )}

          <View style={styles.stageLabel}>
            <View style={styles.liveDot} />
            <Text style={styles.stageLabelText} numberOfLines={1}>
              {stage.title}
            </Text>
            {isHandRaisedFor(stage.userName) ? <Text style={styles.handGlyph}>✋</Text> : null}
          </View>

          {pinnedKey === stage.key ? (
            <View style={styles.pinnedPill}>
              <Text style={styles.pinnedPillText}>PINNED · tap to unpin</Text>
            </View>
          ) : null}
        </TouchableOpacity>

        {filmstrip.length > 0 ? (
          <FlatList
            horizontal
            data={filmstrip}
            keyExtractor={(item) => item.key}
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.filmstrip}
            renderItem={({ item }: { item: StageTarget }) => (
              <TouchableOpacity
                style={styles.filmstripCard}
                activeOpacity={0.8}
                onPress={() => setPinnedKey(item.key)}
              >
                {item.variant === 'localScreen' ? (
                  <View style={styles.filmstripShare}>
                    <Text style={styles.filmstripShareIcon}>🖥️</Text>
                  </View>
                ) : (
                  renderVideoSurface(
                    item.stream,
                    item.userName,
                    'cover',
                    item.variant === 'localCamera',
                    34,
                  )
                )}
                <Text style={styles.filmstripLabel} numberOfLines={1}>
                  {item.title}
                </Text>
              </TouchableOpacity>
            )}
          />
        ) : null}
      </View>
    );
  };

  const renderGrid = () => {
    if (tiles.length === 0) {
      const connecting = CONNECTING_STATES.indexOf(meetingState) !== -1;
      return (
        <View style={styles.waitingCard}>
          <ActivityIndicator color={Colors.primary} size="large" />
          <Text style={styles.waitingText}>
            {connecting
              ? `Connecting WebRTC & SFU Media... (${meetingState})`
              : 'Waiting for participants to join...'}
          </Text>
          <Text style={styles.waitingSub}>Mediasoup SFU • {meetingState}</Text>
        </View>
      );
    }

    return (
      <ScrollView contentContainerStyle={styles.grid} showsVerticalScrollIndicator={false}>
        {tiles.map((tile) => (
          <TouchableOpacity
            key={tile.participantId}
            style={[styles.tile, { width: tileWidth, height: tileHeight }]}
            activeOpacity={0.9}
            onPress={() => setPinnedKey(tile.participantId)}
          >
            {renderVideoSurface(tile.videoStream, tile.userName, 'cover', false, 70)}

            <View style={styles.tileLabel}>
              <View style={styles.liveDot} />
              <Text style={styles.tileLabelText} numberOfLines={1}>
                {tile.userName}
              </Text>
              {isHandRaisedFor(tile.userName) ? <Text style={styles.handGlyph}>✋</Text> : null}
            </View>

            {tile.screenStream ? (
              <View style={styles.tileScreenBadge}>
                <Text style={styles.tileScreenBadgeText}>Screen Share</Text>
              </View>
            ) : null}
          </TouchableOpacity>
        ))}
      </ScrollView>
    );
  };

  const moreOptions = useMemo<ActionSheetOption[]>(
    () => [
      {
        label: handRaised ? 'Lower Hand' : 'Raise Hand',
        onPress: toggleHand,
      },
      {
        label: reactionBarOpen ? 'Hide Reactions' : 'Send a Reaction',
        onPress: () => setReactionBarOpen((open) => !open),
      },
      {
        label: chatUnread > 0 ? `In-Call Chat (${chatUnread > 9 ? '9+' : chatUnread})` : 'In-Call Chat',
        onPress: () => {
          setChatUnread(0);
          setChatOpen(true);
        },
      },
      { label: 'Add People', onPress: () => setAddPeopleVisible(true) },
      { label: 'Share Meeting Link', onPress: () => void handleShareLink() },
      { label: 'Audio & Devices', onPress: () => setDevicesVisible(true) },
      { label: 'Re-Sync Media', onPress: handleResync },
      {
        label: 'AI Summary & Insights',
        onPress: () => showToast('Coming Soon: AI Summary & Insights'),
      },
      {
        label: 'Live Transcript',
        onPress: () => showToast('Coming Soon: Live Searchable Transcript'),
      },
      {
        label: 'AI Copilot Assistant',
        onPress: () => showToast('Coming Soon: AI Copilot Meeting Assistant'),
      },
    ],
    [chatUnread, handRaised, handleResync, handleShareLink, reactionBarOpen, showToast, toggleHand],
  );

  const leaveOptions = useMemo<ActionSheetOption[]>(() => {
    if (isHost && meetingId) {
      return [
        {
          label: 'End Meeting for Everyone',
          destructive: true,
          onPress: () => void handleLeave(true),
        },
        { label: 'Just Leave Meeting', onPress: () => void handleLeave(false) },
      ];
    }
    return [{ label: 'Leave Meeting', destructive: true, onPress: () => void handleLeave(false) }];
  }, [handleLeave, isHost, meetingId]);

  // ── Phase views ──────────────────────────────────────────────────────────
  if (phase === 'loading') {
    return (
      <SafeAreaView style={styles.container}>
        <Toast message={toast?.message ?? null} type={toast?.type} />
        <View style={styles.centered}>
          <ActivityIndicator color={Colors.primary} size="large" />
          <Text style={styles.centeredTitle}>Loading meeting…</Text>
        </View>
      </SafeAreaView>
    );
  }

  if (phase === 'error') {
    return (
      <SafeAreaView style={styles.container}>
        <Toast message={toast?.message ?? null} type={toast?.type} />
        <View style={styles.centered}>
          <Text style={styles.errorGlyph}>⚠️</Text>
          <Text style={styles.centeredTitle}>Unable to join</Text>
          <Text style={styles.centeredSub}>{errorMessage || 'Something went wrong.'}</Text>
          <View style={styles.rowButtons}>
            <TouchableOpacity
              style={styles.secondaryBtn}
              onPress={() => navigation.goBack()}
              activeOpacity={0.8}
            >
              <Text style={styles.secondaryBtnText}>Back</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.primaryBtn}
              onPress={() => {
                setErrorMessage(null);
                setPhase(meetingId ? 'loading' : 'in-call');
              }}
              activeOpacity={0.85}
            >
              <Text style={styles.primaryBtnText}>Retry</Text>
            </TouchableOpacity>
          </View>
        </View>
      </SafeAreaView>
    );
  }

  if (phase === 'waiting-for-host') {
    return (
      <SafeAreaView style={styles.container}>
        <Toast message={toast?.message ?? null} type={toast?.type} />
        <View style={styles.centered}>
          <View style={styles.waitingRing}>
            <Text style={styles.waitingGlyph}>⏳</Text>
          </View>
          <Text style={styles.centeredTitle}>Waiting for Host to Start</Text>
          <Text style={styles.centeredSub}>
            {hostName ? `${hostName} hasn't started` : 'The host has not started'}{' '}
            {meeting?.title ? `“${meeting.title}”` : 'this meeting'} yet. You will join
            automatically the moment it begins.
          </Text>
          <ActivityIndicator color={Colors.primary} style={{ marginTop: 18 }} />
          <TouchableOpacity
            style={[styles.secondaryBtn, { marginTop: 22 }]}
            onPress={() => navigation.goBack()}
            activeOpacity={0.8}
          >
            <Text style={styles.secondaryBtnText}>Leave</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  if (phase === 'ready-to-join') {
    return (
      <SafeAreaView style={styles.container}>
        <Toast message={toast?.message ?? null} type={toast?.type} />
        <ScrollView contentContainerStyle={styles.lobbyScroll} keyboardShouldPersistTaps="handled">
          <View style={styles.lobbyCard}>
            <Text style={styles.lobbyTitle} numberOfLines={2}>
              {meeting?.title || roomTitle}
            </Text>
            <Text style={styles.lobbySubtitle}>Signed in as {displayName}</Text>

            <View style={styles.lobbyPreview}>
              {showLocalVideo && localVideoUrl ? (
                <RTCView
                  streamURL={localVideoUrl}
                  objectFit="cover"
                  mirror
                  style={styles.videoSurface}
                />
              ) : (
                <View style={styles.lobbyPreviewOff}>
                  <Avatar name={displayName} size={72} />
                  <Text style={styles.lobbyPreviewOffText}>Camera is turned off</Text>
                </View>
              )}
            </View>

            <View style={styles.lobbyToggles}>
              <TouchableOpacity
                style={[styles.lobbyToggle, !deviceState.micEnabled && styles.lobbyToggleOff]}
                onPress={toggleAudio}
                activeOpacity={0.75}
              >
                <Text style={styles.lobbyToggleIcon}>
                  {deviceState.micEnabled ? '🎙️' : '🔇'}
                </Text>
                <Text style={styles.lobbyToggleText}>
                  {deviceState.micEnabled ? 'Mic On' : 'Mic Off'}
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.lobbyToggle, !deviceState.camEnabled && styles.lobbyToggleOff]}
                onPress={toggleVideo}
                activeOpacity={0.75}
              >
                <Text style={styles.lobbyToggleIcon}>
                  {deviceState.camEnabled ? '📹' : '🚫'}
                </Text>
                <Text style={styles.lobbyToggleText}>
                  {deviceState.camEnabled ? 'Camera On' : 'Camera Off'}
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.lobbyToggle}
                onPress={() => void meetingWebRTCManager.switchCamera()}
                activeOpacity={0.75}
              >
                <Text style={styles.lobbyToggleIcon}>🔄</Text>
                <Text style={styles.lobbyToggleText}>Flip</Text>
              </TouchableOpacity>
            </View>

            <TouchableOpacity
              style={styles.joinBtn}
              onPress={() => void handleJoin()}
              activeOpacity={0.85}
            >
              <Text style={styles.joinBtnText}>Join Now</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.lobbyCancel}
              onPress={() => navigation.goBack()}
              activeOpacity={0.7}
            >
              <Text style={styles.lobbyCancelText}>Cancel</Text>
            </TouchableOpacity>

            <Text style={styles.lobbyNote}>
              Device choices carry into the meeting — anything switched off here starts off.
            </Text>
          </View>
        </ScrollView>

        <DeviceSettingsModal
          visible={devicesVisible}
          onClose={() => setDevicesVisible(false)}
          deviceState={deviceState}
          onSelectMicrophone={(id) => void meetingWebRTCManager.changeMicrophone(id)}
          onSelectCamera={(id) => void meetingWebRTCManager.changeCamera(id)}
          onFlipCamera={() => void meetingWebRTCManager.switchCamera()}
          onSelectAudioRoute={handleSelectAudioRoute}
          onRefreshDevices={() => void meetingWebRTCManager.updateAvailableDevices()}
        />
      </SafeAreaView>
    );
  }

  // ── In-call ──────────────────────────────────────────────────────────────
  return (
    <SafeAreaView style={styles.container}>
      <Toast message={toast?.message ?? null} type={toast?.type} />

      {/* Top status bar */}
      <View style={styles.topBar}>
        <View style={styles.topInfo}>
          <View style={styles.callTypePill}>
            <Text style={styles.callTypePillText}>
              {meetingId ? 'Meeting' : callSnapshot.isGroupCall ? 'Group Call' : '1-on-1 Call'}
            </Text>
          </View>
          <Text style={styles.timerText}>{formatElapsed(elapsed, !!meetingId)}</Text>
          {showRecordingBadge ? (
            <View style={styles.recBadge}>
              <View style={styles.recDot} />
              <Text style={styles.recText}>REC</Text>
            </View>
          ) : null}
        </View>

        <View style={styles.topRight}>
          <Text style={styles.countText}>{participantCount} in call</Text>
          <TouchableOpacity
            style={styles.leaveTopBtn}
            onPress={() => setLeaveSheetVisible(true)}
            activeOpacity={0.8}
          >
            <Text style={styles.leaveTopBtnText}>Leave</Text>
          </TouchableOpacity>
        </View>
      </View>

      <View style={styles.subBar}>
        <Text style={styles.subBarText} numberOfLines={1}>
          {roomTitle}
        </Text>
        <Text style={styles.subBarState} numberOfLines={1}>
          Mediasoup SFU • {meetingState}
        </Text>
      </View>

      {raisedNames.length > 0 ? (
        <View style={styles.handsBanner}>
          <Text style={styles.handsBannerText} numberOfLines={2}>
            ✋ {raisedNames.join(', ')} {raisedNames.length === 1 ? 'has' : 'have'} a hand raised
          </Text>
        </View>
      ) : null}

      {/* Stage + filmstrip, or the equal grid */}
      <View style={styles.stageArea}>
        {stage ? renderStage() : renderGrid()}

        {/* Self view PIP — tap to swap it onto the stage */}
        {stage?.key !== PIN_LOCAL ? (
          <TouchableOpacity
            style={styles.selfPip}
            activeOpacity={0.9}
            onPress={() => setPinnedKey(pinnedKey === PIN_LOCAL ? null : PIN_LOCAL)}
          >
            {showLocalVideo && localVideoUrl ? (
              <RTCView
                streamURL={localVideoUrl}
                objectFit="cover"
                mirror
                zOrder={1}
                style={styles.videoSurface}
              />
            ) : (
              <View style={styles.avatarFallback}>
                <Avatar name={displayName} size={44} />
              </View>
            )}
            <View style={styles.selfPipLabel}>
              <Text style={styles.selfPipLabelText} numberOfLines={1}>
                You{deviceState.screenSharing ? ' (Sharing Screen)' : ''}
                {handRaised ? ' ✋' : ''}
              </Text>
            </View>
          </TouchableOpacity>
        ) : null}

        {/* Floating reactions — never intercept taps meant for the tiles below */}
        <View pointerEvents="none" style={StyleSheet.absoluteFill}>
          {reactions.map((reaction) => (
            <ReactionBubble key={reaction.id} reaction={reaction} width={width} />
          ))}
        </View>
      </View>

      {reactionBarOpen ? (
        <View style={styles.reactionBar}>
          {REACTIONS.map((emoji) => (
            <TouchableOpacity
              key={emoji}
              style={styles.reactionBtn}
              onPress={() => sendReaction(emoji)}
              activeOpacity={0.7}
            >
              <Text style={styles.reactionBtnText}>{emoji}</Text>
            </TouchableOpacity>
          ))}
          <TouchableOpacity
            style={styles.reactionClose}
            onPress={() => setReactionBarOpen(false)}
            activeOpacity={0.7}
          >
            <Text style={styles.reactionCloseText}>✕</Text>
          </TouchableOpacity>
        </View>
      ) : null}

      {/* Control dock */}
      <View style={styles.hudDock}>
        <ControlButton
          icon={deviceState.micEnabled ? '🎙️' : '🔇'}
          label={deviceState.micEnabled ? 'Mute' : 'Unmute'}
          active={!deviceState.micEnabled}
          onPress={toggleAudio}
        />
        <ControlButton
          icon={deviceState.camEnabled ? '📹' : '🚫'}
          label={deviceState.camEnabled ? 'Video' : 'Video Off'}
          active={!deviceState.camEnabled}
          onPress={toggleVideo}
        />
        <ControlButton
          icon="🔄"
          label="Flip"
          onPress={() => void meetingWebRTCManager.switchCamera()}
        />
        {Platform.OS === 'android' ? (
          <ControlButton
            icon={deviceState.screenSharing ? '⏹️' : '🖥️'}
            label={deviceState.screenSharing ? 'Stop' : 'Share'}
            onPress={toggleScreenShare}
          />
        ) : null}
        <ControlButton
          icon="⋯"
          label="More"
          badge={chatUnread > 0 ? (chatUnread > 9 ? '9+' : String(chatUnread)) : null}
          onPress={() => setMoreSheetVisible(true)}
        />
        <ControlButton
          icon="📞"
          label="End"
          danger
          onPress={() => setLeaveSheetVisible(true)}
        />
      </View>

      {/* RECONNECTING overlay */}
      {meetingState === 'RECONNECTING' ? (
        <View style={styles.blockingOverlay}>
          <ActivityIndicator color={Colors.amber} size="large" />
          <Text style={styles.overlayTitle}>Connection Lost</Text>
          <Text style={styles.overlaySub}>
            If the connection is not restored within {reconnectSeconds} seconds, you will be
            automatically disconnected
          </Text>
          <View style={styles.progressTrack}>
            <View style={[styles.progressFill, { flex: Math.max(reconnectSeconds, 0) }]} />
            <View style={{ flex: Math.max(RECONNECT_GRACE_SECONDS - reconnectSeconds, 0) }} />
          </View>
          <TouchableOpacity
            style={styles.overlayDangerBtn}
            onPress={() => void handleLeave(false)}
            activeOpacity={0.85}
          >
            <Text style={styles.overlayDangerBtnText}>Leave Now</Text>
          </TouchableOpacity>
        </View>
      ) : null}

      {/* FAILED overlay */}
      {meetingState === 'FAILED' ? (
        <View style={styles.blockingOverlay}>
          <Text style={styles.errorGlyph}>⚠️</Text>
          <Text style={styles.overlayTitle}>Media Connection Failed</Text>
          <Text style={styles.overlaySub}>
            The meeting server could not be reached on this network. Check the media server
            address in the server settings, then try again.
          </Text>
          <View style={styles.rowButtons}>
            <TouchableOpacity
              style={styles.secondaryBtn}
              onPress={() => void handleLeave(false)}
              activeOpacity={0.8}
            >
              <Text style={styles.secondaryBtnText}>Leave</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.primaryBtn}
              onPress={() => void meetingWebRTCManager.join(roomId, displayName)}
              activeOpacity={0.85}
            >
              <Text style={styles.primaryBtnText}>Try Again</Text>
            </TouchableOpacity>
          </View>
        </View>
      ) : null}

      {/* In-call chat — ephemeral, nothing is persisted anywhere */}
      <Modal
        visible={chatOpen}
        transparent
        animationType="slide"
        onRequestClose={() => setChatOpen(false)}
      >
        <KeyboardAvoidingView
          style={styles.chatBackdrop}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        >
          <View style={styles.chatSheet}>
            <View style={styles.chatHeader}>
              <Text style={styles.chatTitle}>In-Call Chat</Text>
              <TouchableOpacity
                style={styles.closeBtn}
                onPress={() => setChatOpen(false)}
                activeOpacity={0.7}
              >
                <Text style={styles.closeText}>✕</Text>
              </TouchableOpacity>
            </View>

            <FlatList
              data={chatMessages}
              keyExtractor={(item) => item.msgId}
              style={styles.chatList}
              contentContainerStyle={styles.chatListContent}
              renderItem={({ item }: { item: ChatEntry }) => (
                <View style={[styles.chatBubble, item.mine && styles.chatBubbleMine]}>
                  <Text style={styles.chatSender}>{item.mine ? 'You' : item.senderName}</Text>
                  <Text style={styles.chatText}>{item.text}</Text>
                </View>
              )}
              ListEmptyComponent={
                <Text style={styles.chatEmpty}>
                  Messages are visible only while this call is running — nothing is saved.
                </Text>
              }
            />

            <View style={styles.chatComposer}>
              <TextInput
                style={styles.chatInput}
                value={chatDraft}
                onChangeText={setChatDraft}
                placeholder="Message everyone in the call"
                placeholderTextColor={Colors.textMuted}
                multiline
              />
              <TouchableOpacity style={styles.chatSend} onPress={sendChat} activeOpacity={0.8}>
                <Text style={styles.chatSendText}>Send</Text>
              </TouchableOpacity>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      <ActionSheet
        visible={moreSheetVisible}
        title="Meeting Options"
        subtitle={roomTitle}
        options={moreOptions}
        onClose={() => setMoreSheetVisible(false)}
      />

      <ActionSheet
        visible={leaveSheetVisible}
        title={isHost && meetingId ? 'End or leave this meeting?' : 'Leave this meeting?'}
        subtitle={
          isHost && meetingId
            ? 'Ending it disconnects everyone. Leaving keeps the meeting running.'
            : 'You can rejoin from the Meetings tab while it is running.'
        }
        options={leaveOptions}
        onClose={() => setLeaveSheetVisible(false)}
      />

      <DeviceSettingsModal
        visible={devicesVisible}
        onClose={() => setDevicesVisible(false)}
        deviceState={deviceState}
        onSelectMicrophone={(id) => void meetingWebRTCManager.changeMicrophone(id)}
        onSelectCamera={(id) => void meetingWebRTCManager.changeCamera(id)}
        onFlipCamera={() => void meetingWebRTCManager.switchCamera()}
        onSelectAudioRoute={handleSelectAudioRoute}
        onRefreshDevices={() => void meetingWebRTCManager.updateAvailableDevices()}
      />

      <AddPeopleModal visible={addPeopleVisible} onClose={() => setAddPeopleVisible(false)} />
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  centered: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 28,
  },
  centeredTitle: {
    color: Colors.textPrimary,
    fontSize: 18,
    fontWeight: '800',
    marginTop: 16,
    textAlign: 'center',
  },
  centeredSub: {
    color: Colors.textSecondary,
    fontSize: 13,
    lineHeight: 19,
    marginTop: 8,
    textAlign: 'center',
  },
  errorGlyph: {
    fontSize: 34,
  },
  rowButtons: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 22,
  },
  primaryBtn: {
    backgroundColor: Colors.primary,
    paddingHorizontal: 22,
    paddingVertical: 12,
    borderRadius: 12,
  },
  primaryBtnText: {
    color: '#FFFFFF',
    fontSize: 13.5,
    fontWeight: '700',
  },
  secondaryBtn: {
    backgroundColor: Colors.surfaceLight,
    borderWidth: 1,
    borderColor: Colors.surfaceBorder,
    paddingHorizontal: 22,
    paddingVertical: 12,
    borderRadius: 12,
  },
  secondaryBtnText: {
    color: Colors.textPrimary,
    fontSize: 13.5,
    fontWeight: '600',
  },

  // Waiting for host
  waitingRing: {
    width: 88,
    height: 88,
    borderRadius: 44,
    borderWidth: 2,
    borderColor: 'rgba(99, 102, 241, 0.35)',
    backgroundColor: 'rgba(99, 102, 241, 0.12)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  waitingGlyph: {
    fontSize: 34,
  },

  // Lobby
  lobbyScroll: {
    flexGrow: 1,
    justifyContent: 'center',
    padding: 20,
  },
  lobbyCard: {
    backgroundColor: Colors.surface,
    borderRadius: 24,
    borderWidth: 1,
    borderColor: Colors.surfaceBorder,
    padding: 20,
  },
  lobbyTitle: {
    color: Colors.textPrimary,
    fontSize: 19,
    fontWeight: '800',
  },
  lobbySubtitle: {
    color: Colors.textSecondary,
    fontSize: 12.5,
    marginTop: 4,
    marginBottom: 16,
  },
  lobbyPreview: {
    width: '100%',
    aspectRatio: 3 / 4,
    maxHeight: 340,
    borderRadius: 20,
    overflow: 'hidden',
    backgroundColor: '#05070B',
    borderWidth: 1.5,
    borderColor: Colors.surfaceBorderLight,
  },
  lobbyPreviewOff: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
  },
  lobbyPreviewOffText: {
    color: Colors.textSecondary,
    fontSize: 12.5,
    fontWeight: '600',
  },
  lobbyToggles: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 16,
  },
  lobbyToggle: {
    flex: 1,
    alignItems: 'center',
    backgroundColor: Colors.surfaceLight,
    borderWidth: 1.5,
    borderColor: Colors.surfaceBorderLight,
    borderRadius: 14,
    paddingVertical: 10,
  },
  lobbyToggleOff: {
    borderColor: 'rgba(239, 68, 68, 0.5)',
    backgroundColor: 'rgba(239, 68, 68, 0.12)',
  },
  lobbyToggleIcon: {
    fontSize: 18,
    marginBottom: 3,
  },
  lobbyToggleText: {
    color: Colors.textPrimary,
    fontSize: 11,
    fontWeight: '600',
  },
  joinBtn: {
    backgroundColor: Colors.primary,
    borderRadius: 16,
    paddingVertical: 15,
    alignItems: 'center',
    marginTop: 18,
  },
  joinBtnText: {
    color: '#FFFFFF',
    fontSize: 15.5,
    fontWeight: '800',
  },
  lobbyCancel: {
    alignItems: 'center',
    paddingVertical: 12,
  },
  lobbyCancelText: {
    color: Colors.textSecondary,
    fontSize: 13.5,
    fontWeight: '600',
  },
  lobbyNote: {
    color: Colors.textMuted,
    fontSize: 11,
    textAlign: 'center',
    lineHeight: 16,
  },

  // Top bars
  topBar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: Colors.surfaceBorder,
  },
  topInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  topRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  callTypePill: {
    backgroundColor: 'rgba(99, 102, 241, 0.15)',
    borderWidth: 1,
    borderColor: 'rgba(99, 102, 241, 0.3)',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 999,
  },
  callTypePillText: {
    color: Colors.teamsPurpleLight,
    fontSize: 11,
    fontWeight: '700',
  },
  timerText: {
    color: Colors.textSecondary,
    fontSize: 12,
    fontWeight: '700',
    fontVariant: ['tabular-nums'],
  },
  recBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(239, 68, 68, 0.2)',
    borderWidth: 1,
    borderColor: 'rgba(239, 68, 68, 0.4)',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 999,
    gap: 6,
  },
  recDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: Colors.rose,
  },
  recText: {
    color: '#FF6B6B',
    fontSize: 10.5,
    fontWeight: '800',
  },
  countText: {
    color: Colors.textMuted,
    fontSize: 11.5,
    fontWeight: '600',
  },
  leaveTopBtn: {
    backgroundColor: 'rgba(239, 68, 68, 0.15)',
    borderWidth: 1,
    borderColor: 'rgba(239, 68, 68, 0.4)',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 10,
  },
  leaveTopBtnText: {
    color: '#FF6B6B',
    fontSize: 12,
    fontWeight: '700',
  },
  subBar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 6,
    gap: 12,
  },
  subBarText: {
    color: Colors.textPrimary,
    fontSize: 12.5,
    fontWeight: '700',
    flexShrink: 1,
  },
  subBarState: {
    color: Colors.textMuted,
    fontSize: 10.5,
    fontWeight: '600',
  },
  handsBanner: {
    marginHorizontal: 16,
    marginBottom: 6,
    backgroundColor: 'rgba(245, 158, 11, 0.12)',
    borderWidth: 1,
    borderColor: 'rgba(245, 158, 11, 0.35)',
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 7,
  },
  handsBannerText: {
    color: Colors.amber,
    fontSize: 11.5,
    fontWeight: '700',
  },

  // Stage / grid
  stageArea: {
    flex: 1,
    position: 'relative',
  },
  stageWrap: {
    flex: 1,
    paddingHorizontal: 12,
    paddingTop: 6,
  },
  stage: {
    flex: 1,
    borderRadius: 20,
    overflow: 'hidden',
    backgroundColor: '#000000',
    borderWidth: 1.5,
    borderColor: Colors.surfaceBorder,
  },
  stageLabel: {
    position: 'absolute',
    left: 12,
    bottom: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: 'rgba(11, 14, 20, 0.85)',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 999,
    maxWidth: '80%',
  },
  stageLabelText: {
    color: Colors.textPrimary,
    fontSize: 11.5,
    fontWeight: '700',
    flexShrink: 1,
  },
  pinnedPill: {
    position: 'absolute',
    top: 12,
    right: 12,
    backgroundColor: 'rgba(99, 102, 241, 0.25)',
    borderWidth: 1,
    borderColor: Colors.primary,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 999,
  },
  pinnedPillText: {
    color: Colors.textPrimary,
    fontSize: 9.5,
    fontWeight: '800',
  },
  filmstrip: {
    paddingVertical: 10,
  },
  filmstripCard: {
    width: 124,
    height: 88,
    borderRadius: 14,
    overflow: 'hidden',
    backgroundColor: Colors.surface,
    borderWidth: 1.5,
    borderColor: Colors.surfaceBorder,
    marginRight: 10,
  },
  filmstripShare: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(99, 102, 241, 0.12)',
  },
  filmstripShareIcon: {
    fontSize: 26,
  },
  filmstripLabel: {
    position: 'absolute',
    left: 6,
    right: 6,
    bottom: 6,
    color: Colors.textPrimary,
    fontSize: 10,
    fontWeight: '700',
    backgroundColor: 'rgba(11, 14, 20, 0.85)',
    paddingHorizontal: 6,
    paddingVertical: 3,
    borderRadius: 999,
    overflow: 'hidden',
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    padding: 12,
    justifyContent: 'center',
  },
  tile: {
    backgroundColor: Colors.surface,
    borderWidth: 1.5,
    borderColor: Colors.surfaceBorder,
    borderRadius: 20,
    overflow: 'hidden',
    position: 'relative',
  },
  tileLabel: {
    position: 'absolute',
    left: 8,
    bottom: 8,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: 'rgba(11, 14, 20, 0.85)',
    paddingHorizontal: 9,
    paddingVertical: 4,
    borderRadius: 999,
    maxWidth: '88%',
  },
  tileLabelText: {
    color: Colors.textPrimary,
    fontSize: 11,
    fontWeight: '600',
    flexShrink: 1,
  },
  tileScreenBadge: {
    position: 'absolute',
    top: 8,
    right: 8,
    backgroundColor: 'rgba(6, 182, 212, 0.2)',
    borderWidth: 1,
    borderColor: 'rgba(6, 182, 212, 0.45)',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 999,
  },
  tileScreenBadgeText: {
    color: Colors.cyan,
    fontSize: 9,
    fontWeight: '800',
  },
  liveDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: Colors.emerald,
  },
  handGlyph: {
    fontSize: 11,
  },
  videoSurface: {
    flex: 1,
    backgroundColor: '#000000',
  },
  avatarFallback: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.surfaceElevated,
  },
  shareCard: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    paddingHorizontal: 24,
  },
  shareIcon: {
    fontSize: 42,
  },
  shareTitle: {
    color: Colors.textPrimary,
    fontSize: 15,
    fontWeight: '800',
    textAlign: 'center',
  },
  shareSubtitle: {
    color: Colors.textSecondary,
    fontSize: 12,
    textAlign: 'center',
  },
  waitingCard: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
    paddingHorizontal: 30,
  },
  waitingText: {
    color: Colors.textPrimary,
    fontSize: 14,
    fontWeight: '700',
    textAlign: 'center',
  },
  waitingSub: {
    color: Colors.textMuted,
    fontSize: 11.5,
    fontWeight: '600',
  },

  // Self view
  selfPip: {
    position: 'absolute',
    right: 12,
    bottom: 96,
    width: 108,
    height: 144,
    borderRadius: 16,
    overflow: 'hidden',
    backgroundColor: '#05070B',
    borderWidth: 1.5,
    borderColor: Colors.surfaceBorderLight,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.5,
    shadowRadius: 10,
    elevation: 8,
  },
  selfPipLabel: {
    position: 'absolute',
    left: 6,
    right: 6,
    bottom: 6,
    backgroundColor: 'rgba(11, 14, 20, 0.85)',
    paddingHorizontal: 7,
    paddingVertical: 3,
    borderRadius: 999,
  },
  selfPipLabelText: {
    color: Colors.textPrimary,
    fontSize: 9.5,
    fontWeight: '700',
  },

  // Reactions
  reactionBubble: {
    position: 'absolute',
    bottom: 40,
    fontSize: 34,
  },
  reactionBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    paddingVertical: 8,
  },
  reactionBtn: {
    width: 46,
    height: 46,
    borderRadius: 23,
    backgroundColor: Colors.surfaceLight,
    borderWidth: 1,
    borderColor: Colors.surfaceBorderLight,
    alignItems: 'center',
    justifyContent: 'center',
  },
  reactionBtnText: {
    fontSize: 22,
  },
  reactionClose: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.surfaceBorder,
    alignItems: 'center',
    justifyContent: 'center',
  },
  reactionCloseText: {
    color: Colors.textSecondary,
    fontSize: 13,
    fontWeight: '700',
  },

  // Control dock
  hudDock: {
    flexDirection: 'row',
    backgroundColor: Colors.surface,
    borderTopWidth: 1,
    borderTopColor: Colors.surfaceBorder,
    paddingVertical: 12,
    paddingHorizontal: 8,
    justifyContent: 'space-around',
    alignItems: 'center',
  },
  hudButton: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 6,
    paddingHorizontal: 8,
    borderRadius: 12,
    position: 'relative',
  },
  hudButtonDanger: {
    backgroundColor: 'rgba(239, 68, 68, 0.15)',
  },
  hudButtonEndCall: {
    backgroundColor: Colors.rose,
    borderRadius: 16,
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  hudEmoji: {
    fontSize: 20,
    marginBottom: 2,
  },
  hudLabel: {
    color: Colors.textPrimary,
    fontSize: 10,
    fontWeight: '600',
  },
  hudBadge: {
    position: 'absolute',
    top: 0,
    right: 0,
    minWidth: 16,
    height: 16,
    borderRadius: 8,
    paddingHorizontal: 4,
    backgroundColor: Colors.rose,
    alignItems: 'center',
    justifyContent: 'center',
  },
  hudBadgeText: {
    color: '#FFFFFF',
    fontSize: 9,
    fontWeight: '800',
  },

  // Blocking overlays
  blockingOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(5, 7, 11, 0.94)',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 30,
    gap: 8,
  },
  overlayTitle: {
    color: Colors.textPrimary,
    fontSize: 19,
    fontWeight: '800',
    marginTop: 10,
  },
  overlaySub: {
    color: Colors.textSecondary,
    fontSize: 13,
    lineHeight: 19,
    textAlign: 'center',
  },
  progressTrack: {
    flexDirection: 'row',
    height: 6,
    width: '100%',
    borderRadius: 3,
    overflow: 'hidden',
    backgroundColor: Colors.surfaceLight,
    marginTop: 16,
  },
  progressFill: {
    backgroundColor: Colors.amber,
  },
  overlayDangerBtn: {
    marginTop: 22,
    backgroundColor: Colors.rose,
    paddingHorizontal: 26,
    paddingVertical: 12,
    borderRadius: 14,
  },
  overlayDangerBtnText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '800',
  },

  // Chat
  chatBackdrop: {
    flex: 1,
    backgroundColor: Colors.overlay,
    justifyContent: 'flex-end',
  },
  chatSheet: {
    maxHeight: '75%',
    backgroundColor: Colors.surfaceElevated,
    borderTopLeftRadius: 22,
    borderTopRightRadius: 22,
    borderWidth: 1,
    borderBottomWidth: 0,
    borderColor: Colors.surfaceBorder,
    paddingBottom: 18,
  },
  chatHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: Colors.surfaceBorder,
  },
  chatTitle: {
    color: Colors.textPrimary,
    fontSize: 15,
    fontWeight: '700',
  },
  closeBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: Colors.surfaceLight,
    alignItems: 'center',
    justifyContent: 'center',
  },
  closeText: {
    color: Colors.textSecondary,
    fontSize: 14,
    fontWeight: '700',
  },
  chatList: {
    flexGrow: 0,
  },
  chatListContent: {
    padding: 16,
    gap: 10,
  },
  chatBubble: {
    alignSelf: 'flex-start',
    maxWidth: '85%',
    backgroundColor: Colors.surfaceLight,
    borderWidth: 1,
    borderColor: Colors.surfaceBorder,
    borderRadius: 14,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  chatBubbleMine: {
    alignSelf: 'flex-end',
    backgroundColor: 'rgba(99, 102, 241, 0.16)',
    borderColor: 'rgba(99, 102, 241, 0.35)',
  },
  chatSender: {
    color: Colors.textMuted,
    fontSize: 10,
    fontWeight: '700',
    marginBottom: 2,
  },
  chatText: {
    color: Colors.textPrimary,
    fontSize: 13.5,
  },
  chatEmpty: {
    color: Colors.textMuted,
    fontSize: 12,
    textAlign: 'center',
    lineHeight: 17,
    paddingVertical: 20,
  },
  chatComposer: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 10,
    paddingHorizontal: 16,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: Colors.surfaceBorder,
  },
  chatInput: {
    flex: 1,
    maxHeight: 100,
    backgroundColor: Colors.surfaceLight,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: Colors.surfaceBorder,
    paddingHorizontal: 14,
    paddingVertical: 10,
    color: Colors.textPrimary,
    fontSize: 14,
  },
  chatSend: {
    backgroundColor: Colors.primary,
    paddingHorizontal: 18,
    paddingVertical: 12,
    borderRadius: 14,
  },
  chatSendText: {
    color: '#FFFFFF',
    fontSize: 13.5,
    fontWeight: '700',
  },
});
