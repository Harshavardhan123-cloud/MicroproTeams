import { create } from 'zustand';

export type CallState = 'idle' | 'incoming' | 'outgoing' | 'active';
export type CallType = 'video' | 'audio';

export interface CallUser {
  id: string;
  name: string;
  avatar?: string;
}

interface CallStoreState {
  callState: CallState;
  callType: CallType;
  caller: CallUser | null;
  recipient: CallUser | null;
  conversationId: string | null;
  callId: string | null;
  isGroupCall: boolean;
  isCaller: boolean;
  isMuted: boolean;
  isVideoOff: boolean;

  initiateCall: (recipient: CallUser | null, type: CallType, conversationId?: string, isGroupCall?: boolean) => void;
  receiveCall: (caller: CallUser | null, type: CallType, conversationId?: string, isGroupCall?: boolean) => void;
  acceptCall: () => void;
  declineCall: () => void;
  endCall: () => void;
  toggleMute: () => void;
  toggleVideo: () => void;
}

export const useCallStore = create<CallStoreState>((set) => ({
  callState: 'idle',
  callType: 'video',
  caller: null,
  recipient: null,
  conversationId: null,
  callId: null,
  isGroupCall: false,
  isCaller: false,
  isMuted: false,
  isVideoOff: false,

  initiateCall: (recipient, type, conversationId, isGroupCall = false) => {
    set({
      callState: 'outgoing',
      callType: type,
      recipient,
      conversationId: conversationId || null,
      callId: `call-${Date.now()}`,
      isGroupCall,
      isCaller: true,
      isMuted: false,
      isVideoOff: false
    });
  },

  receiveCall: (caller, type, conversationId, isGroupCall = false) => {
    set({
      callState: 'incoming',
      callType: type,
      caller,
      conversationId: conversationId || null,
      callId: `call-${Date.now()}`,
      isGroupCall,
      isCaller: false,
      isMuted: false,
      isVideoOff: false
    });
  },

  acceptCall: () => {
    set({ callState: 'active' });
  },

  declineCall: () => {
    set({
      callState: 'idle',
      caller: null,
      recipient: null,
      conversationId: null,
      callId: null
    });
  },

  endCall: () => {
    set({
      callState: 'idle',
      caller: null,
      recipient: null,
      conversationId: null,
      callId: null
    });
  },

  toggleMute: () => set((state) => ({ isMuted: !state.isMuted })),
  toggleVideo: () => set((state) => ({ isVideoOff: !state.isVideoOff }))
}));
