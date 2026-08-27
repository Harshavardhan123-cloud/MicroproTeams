import React, { useEffect, useState, useCallback } from 'react';
import { Phone, Video, PhoneOff, Shield, Volume2 } from 'lucide-react';
import { useWebSocket } from '../../hooks/useWebSocket';
import { wsService } from '../../services/websocketService';
import { useUIStore } from '../../stores/uiStore';
import { useCallStore } from '../../stores/callStore';

export const IncomingCallModal: React.FC = () => {
  const [incomingCall, setIncomingCall] = useState<any | null>(null);
  const { setActiveTab } = useUIStore();
  const { acceptCall, declineCall } = useCallStore();

  const handleWSEvent = useCallback((event: any) => {
    if (event.type === 'call_invite') {
      setIncomingCall(event);
    } else if (event.type === 'call_response' && event.status === 'declined') {
      setIncomingCall(null);
    }
  }, []);

  useWebSocket(undefined, handleWSEvent);

  if (!incomingCall) return null;

  const handleAcceptCall = () => {
    // 1. Send call accepted response back over WS
    wsService.send({
      type: 'call_response',
      target_user_id: incomingCall.sender_user_id,
      status: 'accepted'
    });

    // 2. Update local call store state to 'active'
    acceptCall();

    // 3. Redirect user to Calls or Chat tab
    if (incomingCall.conversation_id) {
      setActiveTab('chat');
    } else {
      setActiveTab('calls');
    }

    setIncomingCall(null);
  };

  const handleDeclineCall = () => {
    wsService.send({
      type: 'call_response',
      target_user_id: incomingCall.sender_user_id,
      status: 'declined'
    });
    declineCall();
    setIncomingCall(null);
  };

  return (
    <div className="fixed inset-0 bg-black/90 backdrop-blur-xl z-[9999] flex flex-col items-center justify-center p-6 animate-in fade-in zoom-in-95 duration-200 select-none">
      <div className="bg-[#1F1F1F] border-2 border-teams-purple rounded-3xl p-8 max-w-md w-full shadow-2xl flex flex-col items-center text-center relative overflow-hidden">
        {/* Glowing Background Effect */}
        <div className="absolute -top-24 -left-24 w-48 h-48 bg-teams-purple/30 rounded-full blur-3xl" />
        <div className="absolute -bottom-24 -right-24 w-48 h-48 bg-emerald-500/20 rounded-full blur-3xl" />

        {/* Security Badge Header */}
        <div className="flex items-center gap-2 px-3 py-1 bg-teams-purple/20 border border-teams-purple/40 rounded-full text-[11px] font-bold text-teams-accent mb-6">
          <Shield className="w-3.5 h-3.5" />
          <span>Incoming MicroproTeams Call</span>
        </div>

        {/* Caller Avatar with Pulsing Ring */}
        <div className="relative mb-6">
          <div className="w-28 h-28 rounded-full bg-teams-purple border-4 border-teams-purple/50 flex items-center justify-center text-4xl font-black text-white shadow-2xl animate-pulse">
            {incomingCall.caller_name?.charAt(0) || 'U'}
          </div>
          <div className="absolute inset-0 rounded-full border-4 border-emerald-400/40 animate-ping" />
          <div className="absolute -bottom-1 -right-1 w-8 h-8 rounded-full bg-emerald-500 border-2 border-[#1F1F1F] flex items-center justify-center shadow-md">
            {incomingCall.call_type === 'video' ? (
              <Video className="w-4 h-4 text-white" />
            ) : (
              <Phone className="w-4 h-4 text-white" />
            )}
          </div>
        </div>

        {/* Caller Info */}
        <h2 className="text-xl font-bold text-white mb-1">{incomingCall.caller_name || 'Teammate'}</h2>
        <p className="text-xs text-teams-muted mb-8 flex items-center justify-center gap-1">
          <Volume2 className="w-3.5 h-3.5 text-emerald-400 animate-bounce" />
          <span>Incoming 1-on-1 {incomingCall.call_type === 'video' ? 'Video Meeting' : 'Audio Call'}...</span>
        </p>

        {/* Action Buttons */}
        <div className="flex items-center justify-center gap-6 w-full">
          <button
            onClick={handleDeclineCall}
            className="flex-1 py-3.5 px-4 bg-rose-600 hover:bg-rose-700 text-white rounded-2xl font-bold text-xs transition-all shadow-lg hover:scale-105 flex items-center justify-center gap-2"
          >
            <PhoneOff className="w-4 h-4" />
            <span>Decline</span>
          </button>

          <button
            onClick={handleAcceptCall}
            className="flex-1 py-3.5 px-4 bg-emerald-600 hover:bg-emerald-700 text-white rounded-2xl font-bold text-xs transition-all shadow-lg hover:scale-105 flex items-center justify-center gap-2"
          >
            {incomingCall.call_type === 'video' ? (
              <Video className="w-4 h-4" />
            ) : (
              <Phone className="w-4 h-4" />
            )}
            <span>Accept Call</span>
          </button>
        </div>
      </div>
    </div>
  );
};
