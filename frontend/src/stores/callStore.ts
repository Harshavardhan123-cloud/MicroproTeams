import { create } from 'zustand';
import { useUIStore } from './uiStore';
import { wsService } from '../services/websocketService';
import { useAuthStore } from './authStore';
import { ringtoneManager } from '../utils/ringtoneManager';
import { notificationManager } from '../utils/notificationManager';

export type CallState = 'idle' | 'incoming' | 'outgoing' | 'active' | 'already_accepted';
export type CallType = 'video' | 'audio';

export interface CallUser {
  id: string;
  name: string;
  avatar?: string;
}

export interface LastCallInfo {
  caller: CallUser | null;
  recipient: CallUser | null;
  callType: CallType;
  conversationId: string | null;
  callId: string | null;
  isGroupCall: boolean;
  isCaller: boolean;
}

interface CallStoreState {
  callState: CallState;
  callType: CallType;
  caller: CallUser | null;
  recipient: CallUser | null;
  conversationId: string | null;
  callId: string | null;
  sessionId: string | null;
  isGroupCall: boolean;
  isCaller: boolean;
  isMuted: boolean;
  isVideoOff: boolean;
  isCallMinimized: boolean;

  canRejoin: boolean;
  lastCallInfo: LastCallInfo | null;
  rejoinTimerId: any | null;

  setSessionId: (sessionId: string) => void;
  initiateCall: (recipient: CallUser | null, type: CallType, conversationId?: string, isGroupCall?: boolean, explicitCallId?: string) => void;
  receiveCall: (caller: CallUser | null, type: CallType, conversationId?: string, isGroupCall?: boolean, callId?: string) => void;
  acceptCall: () => void;
  declineCall: () => void;
  callAcceptedOnOtherSession: () => void;
  endCall: (explicitHostEnd?: boolean) => void;
  rejoinLastCall: () => void;
  clearRejoin: () => void;
  toggleMute: () => void;
  toggleVideo: () => void;
  setIsCallMinimized: (minimized: boolean) => void;
}

const getInitialSessionId = (): string => {
  if (typeof window === 'undefined') return 'sess-server';
  let sid = sessionStorage.getItem('mc_tab_session_id');
  if (!sid) {
    sid = `sess-${Math.random().toString(36).substring(2, 9)}-${Date.now()}`;
    sessionStorage.setItem('mc_tab_session_id', sid);
  }
  return sid;
};

export const useCallStore = create<CallStoreState>((set, get) => ({
  callState: 'idle',
  callType: 'video',
  caller: null,
  recipient: null,
  conversationId: null,
  callId: null,
  sessionId: getInitialSessionId(),
  isGroupCall: false,
  isCaller: false,
  isMuted: false,
  isVideoOff: false,
  isCallMinimized: false,

  canRejoin: false,
  lastCallInfo: null,
  rejoinTimerId: null,

  setSessionId: (sessionId) => {
    if (typeof window !== 'undefined' && sessionId) {
      sessionStorage.setItem('mc_tab_session_id', sessionId);
    }
    set({ sessionId });
  },

  initiateCall: (recipient, type, conversationId, isGroupCall = false, explicitCallId) => {
    const { callState, rejoinTimerId } = get();
    if (callState !== 'idle' && callState !== 'already_accepted') {
      alert('⚠️ You are already attending an active meeting. Please leave your current meeting before starting a new call.');
      return;
    }
    if (rejoinTimerId) clearTimeout(rejoinTimerId);

    const generatedCallId = explicitCallId || `call-${Date.now()}`;

    const currentUser = useAuthStore.getState().user;
    const callerUser = currentUser ? {
      id: currentUser.id,
      name: currentUser.display_name || currentUser.username || (currentUser as any).first_name || 'Caller',
      avatar: currentUser.avatar_url
    } : null;

    set({
      callState: 'outgoing',
      callType: type,
      caller: callerUser,
      recipient,
      conversationId: conversationId || null,
      callId: generatedCallId,
      isGroupCall,
      isCaller: true,
      isMuted: false,
      isVideoOff: false,
      isCallMinimized: false,
      canRejoin: false,
      lastCallInfo: null,
      rejoinTimerId: null
    });

    if (recipient?.id && recipient.id !== 'target_user' && recipient.id !== 'user') {
      const currentUser = useAuthStore.getState().user;
      wsService.send({
        type: 'call_invite',
        call_id: generatedCallId,
        target_user_id: recipient.id,
        conversation_id: conversationId || null,
        call_type: type,
        caller_name: currentUser?.display_name || currentUser?.username || currentUser?.first_name || 'Teammate',
        caller_avatar: currentUser?.avatar_url,
        is_group_call: isGroupCall
      });
    }
  },

  receiveCall: (caller, type, conversationId, isGroupCall = false, callId) => {
    const { callState, rejoinTimerId } = get();
    if (callState !== 'idle' && callState !== 'already_accepted') {
      return; // Ignore incoming call if user is already attending a meeting
    }
    if (rejoinTimerId) clearTimeout(rejoinTimerId);

    set({
      callState: 'incoming',
      callType: type,
      caller,
      conversationId: conversationId || null,
      callId: callId || `call-${Date.now()}`,
      isGroupCall,
      isCaller: false,
      isMuted: false,
      isVideoOff: false,
      isCallMinimized: false,
      canRejoin: false,
      lastCallInfo: null,
      rejoinTimerId: null
    });
  },

  acceptCall: () => {
    ringtoneManager.stop();
    notificationManager.closeAllNotifications();
    set({ callState: 'active' });
  },

  declineCall: () => {
    ringtoneManager.stop();
    notificationManager.closeAllNotifications();
    const { rejoinTimerId } = get();
    if (rejoinTimerId) clearTimeout(rejoinTimerId);

    set({
      callState: 'idle',
      caller: null,
      recipient: null,
      conversationId: null,
      callId: null,
      isCallMinimized: false,
      canRejoin: false,
      lastCallInfo: null,
      rejoinTimerId: null
    });
  },

  callAcceptedOnOtherSession: () => {
    ringtoneManager.stop();
    notificationManager.closeAllNotifications();
    const { rejoinTimerId } = get();
    if (rejoinTimerId) clearTimeout(rejoinTimerId);

    set({
      callState: 'already_accepted',
      caller: null,
      recipient: null,
      conversationId: null,
      callId: null,
      isCallMinimized: false,
      canRejoin: false,
      lastCallInfo: null,
      rejoinTimerId: null
    });
    
    // Auto reset to idle after 4 seconds
    setTimeout(() => {
      if (get().callState === 'already_accepted') {
        set({ callState: 'idle' });
      }
    }, 4000);
  },

  endCall: (explicitHostEnd = false) => {
    ringtoneManager.stop();
    notificationManager.closeAllNotifications();
    const state = get();
    if (state.rejoinTimerId) clearTimeout(state.rejoinTimerId);

    // Reset popped out meeting and active meeting ID in UI store
    useUIStore.getState().setActiveMeetingId(null);
    useUIStore.getState().setIsMeetingPoppedOut(false);

    // If explicitHostEnd is true, OR if call is in outgoing/incoming state (canceled/declined before connecting),
    // clear rejoin state completely so host/users are not prompted to rejoin!
    if (explicitHostEnd || state.callState === 'outgoing' || state.callState === 'incoming') {
      set({
        callState: 'idle',
        caller: null,
        recipient: null,
        conversationId: null,
        callId: null,
        isCallMinimized: false,
        canRejoin: false,
        lastCallInfo: null,
        rejoinTimerId: null
      });
      return;
    }

    const info: LastCallInfo = {
      caller: state.caller,
      recipient: state.recipient,
      callType: state.callType,
      conversationId: state.conversationId,
      callId: state.callId,
      isGroupCall: state.isGroupCall,
      isCaller: state.isCaller
    };

    set({
      callState: 'idle',
      caller: null,
      recipient: null,
      conversationId: null,
      callId: null,
      isCallMinimized: false,
      canRejoin: true,
      lastCallInfo: info,
      rejoinTimerId: null
    });
  },

  rejoinLastCall: () => {
    ringtoneManager.stop();
    notificationManager.closeAllNotifications();
    const { lastCallInfo, rejoinTimerId } = get();
    if (!lastCallInfo) return;

    if (rejoinTimerId) clearTimeout(rejoinTimerId);

    if (lastCallInfo.conversationId) {
      useUIStore.getState().setActiveMeetingId(lastCallInfo.conversationId);
    }

    set({
      callState: 'active',
      caller: lastCallInfo.caller,
      recipient: lastCallInfo.recipient,
      callType: lastCallInfo.callType,
      conversationId: lastCallInfo.conversationId,
      callId: lastCallInfo.callId || `call-${Date.now()}`,
      isGroupCall: lastCallInfo.isGroupCall,
      isCaller: lastCallInfo.isCaller,
      isCallMinimized: false,
      canRejoin: false,
      lastCallInfo: null,
      rejoinTimerId: null
    });
  },

  clearRejoin: () => {
    const { rejoinTimerId } = get();
    if (rejoinTimerId) clearTimeout(rejoinTimerId);

    set({
      canRejoin: false,
      lastCallInfo: null,
      rejoinTimerId: null
    });
  },

  toggleMute: () => set((state) => ({ isMuted: !state.isMuted })),
  toggleVideo: () => set((state) => ({ isVideoOff: !state.isVideoOff })),
  setIsCallMinimized: (minimized) => set({ isCallMinimized: minimized })
}));

// Automatic reactive safety listener to stop ringtone as soon as call becomes active or idle
useCallStore.subscribe((state) => {
  if (state.callState === 'active' || state.callState === 'idle' || state.callState === 'already_accepted') {
    ringtoneManager.stop();
    notificationManager.closeAllNotifications();
  }
});
