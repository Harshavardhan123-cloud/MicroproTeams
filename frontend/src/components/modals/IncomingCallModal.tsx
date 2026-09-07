import React, { useEffect, useState, useCallback, useRef } from 'react';
import { Phone, Video, PhoneOff, Shield, Volume2, CheckCircle2, AlertCircle, Smartphone, X } from 'lucide-react';
import { useWebSocket } from '../../hooks/useWebSocket';
import { wsService } from '../../services/websocketService';
import { useUIStore } from '../../stores/uiStore';
import { useCallStore } from '../../stores/callStore';
import { ringtoneManager } from '../../utils/ringtoneManager';
import { notificationManager } from '../../utils/notificationManager';
import { apiClient } from '../../api/client';

export const IncomingCallModal: React.FC = () => {
  const [incomingCall, setIncomingCall] = useState<any | null>(null);
  const [timeLeft, setTimeLeft] = useState(25);
  const [isAccepting, setIsAccepting] = useState(false);
  const [sessionErrorMessage, setSessionErrorMessage] = useState<string | null>(null);

  const { setActiveTab } = useUIStore();
  const { acceptCall, declineCall, callState, sessionId, callAcceptedOnOtherSession } = useCallStore();

  const currentCallIdRef = useRef<string | null>(null);

  // Clean up audio ringtone and native notifications
  const cleanupCallFeedback = useCallback((callId?: string) => {
    ringtoneManager.stop();
    const id = callId || currentCallIdRef.current;
    if (id) {
      notificationManager.closeCallNotification(id);
    }
  }, []);

  const handleWSEvent = useCallback((event: any) => {
    // 1. New incoming call invite event
    if (event.type === 'call_invite') {
      const callId = event.call_id || `call-${Date.now()}`;
      currentCallIdRef.current = callId;
      setIncomingCall({ ...event, call_id: callId });
      setTimeLeft(25);
      setSessionErrorMessage(null);

      // Start ringing sound and display notification if unfocused
      ringtoneManager.play(event.call_type || 'video');
      notificationManager.showCallNotification({
        callId,
        callerName: event.caller_name || 'Teammate',
        callerAvatar: event.caller_avatar,
        isVideo: event.call_type === 'video',
        onNotificationClick: () => {
          window.focus();
        }
      });
    } 
    // 2. Call accepted state transition event (from any session)
    else if (
      event.type === 'call_accepted' ||
      (event.type === 'call_response' && event.status === 'accepted')
    ) {
      const targetCallId = event.call_id;
      const acceptedSession = event.accepted_by_session_id || event.session_id;

      if (incomingCall && (incomingCall.call_id === targetCallId || !targetCallId)) {
        cleanupCallFeedback(targetCallId);
        
        // Check if accepted by another session / device of the current user
        if (acceptedSession && sessionId && acceptedSession !== sessionId) {
          setSessionErrorMessage('Call was accepted on another device.');
          callAcceptedOnOtherSession();
          setIncomingCall(null);
        } else {
          setIncomingCall(null);
        }
      }
    }
    // 3. Call declined, cancelled, or expired terminal events
    else if (
      (event.type === 'call_response' && event.status === 'declined') ||
      event.type === 'call_declined' ||
      event.type === 'call_cancelled' ||
      event.type === 'call_expired'
    ) {
      cleanupCallFeedback(event.call_id);
      setIncomingCall(null);
      setSessionErrorMessage(null);
    }
  }, [incomingCall, sessionId, cleanupCallFeedback, callAcceptedOnOtherSession]);

  useWebSocket(undefined, handleWSEvent);

  // Handle call expiration timer (25 seconds)
  useEffect(() => {
    if (!incomingCall) return;

    if (timeLeft <= 0) {
      cleanupCallFeedback(incomingCall.call_id);
      declineCall();
      setIncomingCall(null);
      return;
    }

    const timer = setInterval(() => {
      setTimeLeft((prev) => prev - 1);
    }, 1000);

    return () => clearInterval(timer);
  }, [incomingCall, timeLeft, declineCall, cleanupCallFeedback]);

  // Clean up audio ringtone on unmount
  useEffect(() => {
    return () => {
      ringtoneManager.stop();
    };
  }, []);

  const handleAcceptCall = async () => {
    if (!incomingCall || isAccepting) return;
    setIsAccepting(true);

    const callId = incomingCall.call_id || incomingCall.resource_id;

    try {
      // 1. Perform atomic backend call acceptance to ensure single-session ownership
      if (callId && !callId.startsWith('call-')) {
        const res = await apiClient.post(`/calls/${callId}/accept`, {
          session_id: sessionId
        });
        if (res.data?.data?.code === 'CALL_ALREADY_ACCEPTED') {
          cleanupCallFeedback(callId);
          setSessionErrorMessage('Call was already accepted on another session.');
          callAcceptedOnOtherSession();
          setIsAccepting(false);
          setTimeout(() => {
            setIncomingCall(null);
            setSessionErrorMessage(null);
          }, 3500);
          return;
        }
      }
    } catch (err: any) {
      const errCode = err.response?.data?.error?.code || err.response?.data?.code;
      if (errCode === 'CALL_ALREADY_ACCEPTED' || err.response?.status === 409) {
        cleanupCallFeedback(callId);
        setSessionErrorMessage('Call was already accepted on another session.');
        callAcceptedOnOtherSession();
        setIsAccepting(false);
        setTimeout(() => {
          setIncomingCall(null);
          setSessionErrorMessage(null);
        }, 3500);
        return;
      }
    }

    // 2. Stop ringtone & close native notification
    cleanupCallFeedback(callId);

    // 3. Broadcast WS acceptance signal to caller
    wsService.send({
      type: 'call_response',
      target_user_id: incomingCall.sender_user_id,
      status: 'accepted',
      call_id: callId,
      session_id: sessionId
    });

    // 4. Set local state to active call
    acceptCall();

    // 5. Navigate user to direct chat / call screen
    if (incomingCall.conversation_id) {
      setActiveTab('chat');
    } else {
      setActiveTab('calls');
    }

    setIsAccepting(false);
    setIncomingCall(null);
  };

  const handleDeclineCall = useCallback(async () => {
    if (incomingCall) {
      const callId = incomingCall.call_id;
      cleanupCallFeedback(callId);

      wsService.send({
        type: 'call_response',
        target_user_id: incomingCall.sender_user_id,
        status: 'declined',
        call_id: callId,
        session_id: sessionId
      });

      if (callId && !callId.startsWith('call-')) {
        try {
          await apiClient.post(`/calls/${callId}/decline`, { session_id: sessionId });
        } catch (e) {}
      }
    }
    declineCall();
    setIncomingCall(null);
  }, [incomingCall, sessionId, declineCall, cleanupCallFeedback]);

  // Display "Accepted on another session" toast banner if active on this tab
  if (callState === 'already_accepted' && !incomingCall) {
    return (
      <div className="fixed top-6 right-6 z-[9999] bg-[#141722]/95 backdrop-blur-xl border border-amber-500/40 rounded-2xl p-4 shadow-2xl flex items-center gap-3.5 animate-in slide-in-from-top duration-300 max-w-md">
        <div className="p-2.5 bg-amber-500/20 rounded-xl text-amber-400 shrink-0 border border-amber-500/30">
          <Smartphone className="w-5 h-5" />
        </div>
        <div className="flex-1 pr-2">
          <h4 className="text-xs font-bold text-white font-display">Call Accepted on Another Device</h4>
          <p className="text-[11px] text-slate-300 mt-0.5 leading-snug">
            This call was accepted on another active device or session. Only one user session is valid for call acceptance.
          </p>
        </div>
        <button
          onClick={() => useCallStore.setState({ callState: 'idle' })}
          className="p-1.5 text-slate-400 hover:text-white rounded-lg hover:bg-white/10 transition-colors shrink-0"
          title="Dismiss"
        >
          <X className="w-4 h-4" />
        </button>
      </div>
    );
  }

  if (!incomingCall) return null;

  return (
    <div className="fixed inset-0 bg-black/90 backdrop-blur-xl z-[9999] flex flex-col items-center justify-center p-6 animate-in fade-in zoom-in-95 duration-200 select-none">
      <div className="bg-[#1F1F1F] border-2 border-teams-purple rounded-3xl p-8 max-w-md w-full shadow-2xl flex flex-col items-center text-center relative overflow-hidden">
        {/* Glowing Background Effect */}
        <div className="absolute -top-24 -left-24 w-48 h-48 bg-teams-purple/30 rounded-full blur-3xl" />
        <div className="absolute -bottom-24 -right-24 w-48 h-48 bg-emerald-500/20 rounded-full blur-3xl" />

        {/* Security Badge Header */}
        <div className="flex items-center gap-2 px-3 py-1 bg-teams-purple/20 border border-teams-purple/40 rounded-full text-[11px] font-bold text-teams-accent mb-6">
          <Shield className="w-3.5 h-3.5" />
          <span>Incoming Micropro Commute Call</span>
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
        <p className="text-xs text-teams-muted flex items-center justify-center gap-1">
          <Volume2 className="w-3.5 h-3.5 text-emerald-400 animate-bounce" />
          <span>Incoming {incomingCall.is_group_call ? 'Group Meeting' : '1-on-1'} {incomingCall.call_type === 'video' ? 'Video' : 'Audio'} Call...</span>
        </p>

        {sessionErrorMessage ? (
          <div className="my-4 px-4 py-2 bg-amber-500/20 border border-amber-500/40 rounded-xl text-amber-300 text-xs font-semibold flex items-center gap-2">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span>{sessionErrorMessage}</span>
          </div>
        ) : (
          <p className="text-[10px] text-rose-400 font-bold mb-8 mt-2">
            Missed call in {timeLeft}s
          </p>
        )}

        {/* Action Buttons */}
        <div className="flex items-center justify-center gap-6 w-full">
          <button
            onClick={handleDeclineCall}
            disabled={isAccepting}
            className="flex-1 py-3.5 px-4 bg-rose-600 hover:bg-rose-700 text-white rounded-2xl font-bold text-xs transition-all shadow-lg hover:scale-105 flex items-center justify-center gap-2 disabled:opacity-50"
          >
            <PhoneOff className="w-4 h-4" />
            <span>Decline</span>
          </button>

          <button
            onClick={handleAcceptCall}
            disabled={isAccepting || !!sessionErrorMessage}
            className="flex-1 py-3.5 px-4 bg-emerald-600 hover:bg-emerald-700 text-white rounded-2xl font-bold text-xs transition-all shadow-lg hover:scale-105 flex items-center justify-center gap-2 disabled:opacity-50"
          >
            {isAccepting ? (
              <span className="animate-spin w-4 h-4 border-2 border-white border-t-transparent rounded-full" />
            ) : incomingCall.call_type === 'video' ? (
              <Video className="w-4 h-4" />
            ) : (
              <Phone className="w-4 h-4" />
            )}
            <span>{isAccepting ? 'Connecting...' : 'Accept Call'}</span>
          </button>
        </div>
      </div>
    </div>
  );
};
