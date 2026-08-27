import React, { useEffect, useState, useRef, useCallback } from 'react';
import { Phone, Video, Mic, MicOff, VideoOff, PhoneOff, Shield, Volume2, AlertCircle, MessageSquare, Hand, Smile, Send, MonitorUp } from 'lucide-react';
import { useCallStore } from '../../stores/callStore';
import { wsService } from '../../services/websocketService';
import { useWebRTC } from '../../hooks/useWebRTC';
import { useMediasoup } from '../../hooks/useMediasoup';
import { useWebSocket } from '../../hooks/useWebSocket';
import { useAuthStore } from '../../stores/authStore';

interface RemoteVideoTileProps {
  userId: string;
  defaultDisplayName: string;
  remoteStreams: { participantId: string; userName: string; stream: MediaStream; kind: string }[];
  isHandRaised: boolean;
}

const RemoteVideoTile: React.FC<RemoteVideoTileProps> = ({
  userId,
  defaultDisplayName,
  remoteStreams,
  isHandRaised
}) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const audioRef = useRef<HTMLAudioElement>(null);

  const participantStreams = remoteStreams.filter(s => s.participantId === userId);
  const videoStreamObj = participantStreams.find(s => s.kind === 'video');
  const audioStreamObj = participantStreams.find(s => s.kind === 'audio');

  const videoStream = videoStreamObj?.stream;
  const audioStream = audioStreamObj?.stream;
  
  const peerUserName = participantStreams[0]?.userName || defaultDisplayName;

  useEffect(() => {
    if (videoRef.current && videoStream) {
      videoRef.current.srcObject = videoStream;
      videoRef.current.play().catch((e) => console.warn('Remote video play error:', e));
    }
  }, [videoStream]);

  useEffect(() => {
    if (audioRef.current && audioStream) {
      audioRef.current.srcObject = audioStream;
      audioRef.current.play().catch((e) => console.warn('Remote audio play error:', e));
    }
  }, [audioStream]);

  return (
    <div className="relative w-full h-full bg-[#1A1A1E] rounded-2xl overflow-hidden border border-teams-border shadow-xl flex items-center justify-center min-h-[200px]">
      {videoStream ? (
        <video
          ref={videoRef}
          autoPlay
          playsInline
          className="w-full h-full object-contain bg-black"
        />
      ) : (
        <div className="flex flex-col items-center justify-center space-y-3">
          <div className="w-20 h-20 rounded-full bg-teams-purple/30 border-2 border-teams-purple flex items-center justify-center font-bold text-2xl text-white uppercase shadow-lg">
            {peerUserName.charAt(0)}
          </div>
          <span className="text-xs text-teams-muted">{peerUserName} (Camera Off)</span>
        </div>
      )}
      {audioStream && <audio ref={audioRef} autoPlay />}

      <div className="absolute bottom-4 left-4 px-3 py-1 bg-black/70 rounded-lg text-xs font-bold text-white backdrop-blur flex items-center gap-2 z-10">
        <span className="w-2 h-2 rounded-full bg-emerald-400" />
        <span className="line-clamp-1">{peerUserName}</span>
        {isHandRaised && <Hand className="w-3.5 h-3.5 text-amber-400 ml-1" />}
      </div>
    </div>
  );
};

export const FullscreenCallOverlay: React.FC = () => {
  const {
    callState,
    callType,
    caller,
    recipient,
    isCaller,
    isGroupCall,
    isMuted,
    isVideoOff,
    conversationId,
    acceptCall,
    declineCall,
    endCall,
    toggleMute,
    toggleVideo
  } = useCallStore();

  const [callDuration, setCallDuration] = useState(0);
  const [isChatOpen, setIsChatOpen] = useState(false);
  const [chatMessages, setChatMessages] = useState<{ id: string, senderName: string, text: string }[]>([]);
  const [chatInput, setChatInput] = useState('');
  
  const [raisedHands, setRaisedHands] = useState<Set<string>>(new Set());
  const [activeReactions, setActiveReactions] = useState<{ id: string, emoji: string, x: number }[]>([]);

  const { user } = useAuthStore();
  const currentUser = user ? { id: user.id, name: user.display_name, avatar: user.avatar_url } : null;
  const timerRef = useRef<any>(null);

  const {
    localStream,
    isAudioMuted,
    isVideoMuted,
    isScreenSharing,
    toggleAudio: toggleWebRTCAudio,
    toggleVideo: toggleWebRTCVideo,
    toggleScreenShare,
    stopStream,
    error: webRtcError
  } = useWebRTC();

  const targetUser = callState === 'incoming' ? caller : recipient;
  const rawName = targetUser?.name || (callState === 'incoming' ? caller?.name : recipient?.name);
  const displayName: string = (rawName && rawName !== 'Teammate') ? rawName : 'Alice Smith';

  // Initialize Mediasoup SFU Client
  const { remoteStreams } = useMediasoup(
    localStream,
    conversationId,
    callState,
    currentUser?.name || displayName
  );

  // Handle incoming mesh events (chat, hand raise, reactions)
  const handleMeshEvents = useCallback((event: any) => {
    if (event.type === 'call_chat_message' && event.text) {
      setChatMessages(prev => [...prev, { id: Date.now().toString(), senderName: event.senderName || 'Peer', text: event.text }]);
    }
    else if (event.type === 'call_action') {
      if (event.action === 'raise_hand') {
        setRaisedHands(prev => {
          const next = new Set(prev);
          if (event.isRaised) next.add(event.sender_user_id);
          else next.delete(event.sender_user_id);
          return next;
        });
      } else if (event.action === 'reaction') {
        const reactId = Date.now().toString() + Math.random();
        setActiveReactions(prev => [...prev, { id: reactId, emoji: event.emoji, x: Math.random() * 80 + 10 }]);
        setTimeout(() => {
          setActiveReactions(prev => prev.filter(r => r.id !== reactId));
        }, 3000);
      }
    }
    else if (event.type === 'mesh_end' && !isCaller) {
      // Host ended the meeting
      handleLeaveCall();
    }
  }, [isCaller]);

  useWebSocket(undefined, handleMeshEvents);

  const setLocalVideoRef = useCallback(
    (el: HTMLVideoElement | null) => {
      if (el && localStream) {
        el.srcObject = localStream;
        el.play().catch((e) => console.warn('Auto-play local video error:', e));
      }
    },
    [localStream]
  );

  useEffect(() => {
    if (callState !== 'idle') {
      document.body.style.overflow = 'hidden';
      document.body.style.userSelect = 'none';
    } else {
      document.body.style.overflow = 'auto';
      document.body.style.userSelect = 'auto';
      setCallDuration(0);
      setChatMessages([]);
      setRaisedHands(new Set());
      if (timerRef.current) clearInterval(timerRef.current);
    }
    return () => {
      document.body.style.overflow = 'auto';
      document.body.style.userSelect = 'auto';
    };
  }, [callState]);

  useEffect(() => {
    if (callState === 'active') {
      timerRef.current = setInterval(() => {
        setCallDuration((prev) => prev + 1);
      }, 1000);
    } else {
      if (timerRef.current) clearInterval(timerRef.current);
    }
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [callState]);

  if (callState === 'idle') return null;

  const formatTime = (sec: number) => {
    const mins = Math.floor(sec / 60).toString().padStart(2, '0');
    const secs = (sec % 60).toString().padStart(2, '0');
    return `${mins}:${secs}`;
  };

  const handleAccept = () => {
    if (caller?.id) {
      wsService.send({ type: 'call_response', target_user_id: caller.id, status: 'accepted' });
    }
    acceptCall();
  };

  const handleDecline = () => {
    const targetId = caller?.id || recipient?.id;
    if (targetId) {
      wsService.send({ type: 'call_response', target_user_id: targetId, status: 'declined' });
    }
    stopStream();
    declineCall();
  };

  // Attendee leaves the mesh network
  const handleLeaveCall = () => {
    if (conversationId) {
      wsService.send({ type: 'mesh_leave', conversation_id: conversationId });
    }
    stopStream();
    endCall();
  };

  // Host ends the call for everyone
  const handleEndCallForAll = () => {
    if (conversationId) {
      wsService.send({ type: 'mesh_end', conversation_id: conversationId });
    }
    stopStream();
    endCall();
  };

  const handleSendChat = (e: React.FormEvent) => {
    e.preventDefault();
    if (!chatInput.trim() || !conversationId) return;
    
    wsService.send({
      type: 'call_chat_message',
      conversation_id: conversationId,
      senderName: currentUser?.name || 'Me',
      text: chatInput
    });
    
    setChatMessages(prev => [...prev, { id: Date.now().toString(), senderName: 'Me', text: chatInput }]);
    setChatInput('');
  };

  const toggleHandRaise = () => {
    const isRaised = !raisedHands.has(currentUser?.id || 'local');
    setRaisedHands(prev => {
      const next = new Set(prev);
      if (isRaised) next.add(currentUser?.id || 'local');
      else next.delete(currentUser?.id || 'local');
      return next;
    });
    if (conversationId) {
      wsService.send({
        type: 'call_action',
        conversation_id: conversationId,
        action: 'raise_hand',
        isRaised
      });
    }
  };

  const sendReaction = (emoji: string) => {
    if (conversationId) {
      wsService.send({
        type: 'call_action',
        conversation_id: conversationId,
        action: 'reaction',
        emoji
      });
    }
    const reactId = Date.now().toString() + Math.random();
    setActiveReactions(prev => [...prev, { id: reactId, emoji, x: Math.random() * 80 + 10 }]);
    setTimeout(() => {
      setActiveReactions(prev => prev.filter(r => r.id !== reactId));
    }, 3000);
  };

  // Render video grid based on stream count
  const renderVideoGrid = () => {
    // Group remote streams by participantId for unified UI mapping
    const participantIds = Array.from(new Set(remoteStreams.map(s => s.participantId)));
    const count = participantIds.length;
    
    let gridCols = "grid-cols-1";
    if (count === 1) gridCols = "grid-cols-1";
    else if (count === 2 || count === 3) gridCols = "grid-cols-2";
    else if (count >= 4) gridCols = "grid-cols-2 md:grid-cols-3";

    return (
      <div className={`w-full h-full grid ${gridCols} gap-4 p-4 items-center justify-center auto-rows-fr`}>
        {count === 0 && (
          <div className="flex flex-col items-center justify-center space-y-4 col-span-full">
            <div className="w-24 h-24 sm:w-32 sm:h-32 rounded-full bg-teams-purple/20 border-4 border-teams-purple/50 flex items-center justify-center text-4xl font-black text-teams-purple shadow-2xl animate-pulse">
              {displayName.charAt(0)}
            </div>
            <p className="text-teams-muted text-sm animate-pulse text-center px-4">
              {isGroupCall ? 'Waiting for participants to join...' : `Waiting for ${displayName} to join...`}
            </p>
          </div>
        )}
        
        {participantIds.map((userId) => (
          <RemoteVideoTile
            key={userId}
            userId={userId}
            defaultDisplayName={displayName}
            remoteStreams={remoteStreams}
            isHandRaised={raisedHands.has(userId)}
          />
        ))}
      </div>
    );
  };

  return (
    <div
      className="fixed inset-0 w-full h-full bg-[#0F0F12] text-white z-[999999] flex flex-col p-4 md:p-6 select-none overflow-hidden"
      onClick={(e) => e.stopPropagation()}
      onKeyDown={(e) => e.stopPropagation()}
    >
      {/* Floating Reactions Overlay */}
      <div className="absolute inset-0 pointer-events-none z-50 overflow-hidden">
        {activeReactions.map(reaction => (
          <div 
            key={reaction.id}
            className="absolute bottom-24 text-4xl animate-float-up opacity-0"
            style={{ left: `${reaction.x}%` }}
          >
            {reaction.emoji}
          </div>
        ))}
      </div>

      {/* Top Header */}
      <div className="flex items-center justify-between w-full z-20 shrink-0 mb-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-teams-purple flex items-center justify-center font-bold text-lg shadow-lg uppercase">
            {displayName.charAt(0)}
          </div>
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <h1 className="font-bold text-base line-clamp-1">{isGroupCall ? `Group Meeting: ${displayName}` : displayName}</h1>
              <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 whitespace-nowrap">
                {isCaller ? (isGroupCall ? 'Host' : 'Caller') : (isGroupCall ? 'Attendee' : 'Recipient')}
              </span>
            </div>
            <p className="text-xs text-teams-muted flex items-center gap-1 mt-0.5">
              <Shield className="w-3.5 h-3.5 text-teams-purple" />
              <span>Mediasoup SFU Multi-Party</span>
            </p>
          </div>
        </div>

        {callState === 'active' && (
          <div className="px-4 py-1.5 rounded-full bg-[#1F1F24] border border-teams-border text-xs font-mono font-bold text-emerald-400 shadow-md">
            ⏱️ {formatTime(callDuration)}
          </div>
        )}
      </div>

      {/* Main Layout Area */}
      <div className="flex-1 flex gap-4 min-h-0 relative">
        
        {webRtcError && (
          <div className="absolute top-4 left-1/2 -translate-x-1/2 z-50 px-4 py-2 bg-rose-500/90 text-white rounded-lg text-xs font-bold flex items-center gap-2 shadow-2xl backdrop-blur-md">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span>{webRtcError}</span>
          </div>
        )}

        {/* Video Grid Area */}
        <div className={`flex-1 transition-all duration-300 relative bg-[#151518] rounded-3xl overflow-hidden border border-teams-border/50 ${isChatOpen ? 'w-2/3 hidden md:flex' : 'w-full'}`}>
          
          {callState === 'active' && callType === 'video' ? (
            <>
              {renderVideoGrid()}
              
              {/* Local Video PIP */}
              <div className="absolute bottom-4 right-4 w-32 h-24 sm:w-48 sm:h-32 bg-[#0F0F12] rounded-xl overflow-hidden border-2 border-teams-purple/60 shadow-2xl z-20">
                <video ref={setLocalVideoRef} autoPlay playsInline muted className="w-full h-full object-cover" />
                <div className="absolute bottom-2 left-2 px-2 py-1 bg-black/75 rounded-md text-[10px] font-bold text-white flex items-center gap-1">
                  You {raisedHands.has(currentUser?.id || 'local') && <Hand className="w-3 h-3 text-amber-400" />}
                </div>
              </div>
            </>
          ) : (
            <div className="w-full h-full flex flex-col items-center justify-center space-y-6">
              <div className="relative">
                <div className="w-32 h-32 rounded-full bg-teams-purple border-4 border-teams-purple/50 flex items-center justify-center text-5xl font-black text-white shadow-2xl animate-pulse">
                  {displayName.charAt(0)}
                </div>
                {callState === 'incoming' && <div className="absolute inset-0 rounded-full border-4 border-emerald-400/40 animate-ping" />}
                <div className="absolute -bottom-2 -right-2 w-10 h-10 rounded-full bg-emerald-500 border-4 border-[#0F0F12] flex items-center justify-center">
                  {callType === 'video' ? <Video className="w-5 h-5" /> : <Phone className="w-5 h-5" />}
                </div>
              </div>
              <div className="text-center">
                <h2 className="text-2xl font-bold">{displayName}</h2>
                <p className="text-sm text-teams-muted mt-1">
                  {callState === 'incoming' ? 'Incoming Group Call...' : callState === 'outgoing' ? 'Initiating Mesh Network...' : 'Call Connected'}
                </p>
              </div>
            </div>
          )}
        </div>

        {/* Chat Drawer Sidebar */}
        {isChatOpen && callState === 'active' && (
          <div className="w-full md:w-80 bg-[#1A1A1E] rounded-3xl border border-teams-border shadow-2xl flex flex-col overflow-hidden animate-in slide-in-from-right-8">
            <div className="p-4 border-b border-teams-border flex items-center justify-between bg-[#1F1F24]">
              <h3 className="font-bold text-sm flex items-center gap-2">
                <MessageSquare className="w-4 h-4 text-teams-purple" />
                In-Call Chat
              </h3>
              <button onClick={() => setIsChatOpen(false)} className="text-teams-muted hover:text-white">✕</button>
            </div>
            <div className="flex-1 p-4 overflow-y-auto space-y-3">
              {chatMessages.length === 0 ? (
                <p className="text-xs text-teams-muted text-center mt-10">No messages yet. Send a message to the group!</p>
              ) : (
                chatMessages.map(msg => (
                  <div key={msg.id} className="flex flex-col">
                    <span className="text-[10px] text-teams-muted mb-0.5">{msg.senderName}</span>
                    <div className="bg-[#2D2D32] px-3 py-2 rounded-xl text-sm w-fit max-w-[90%]">
                      {msg.text}
                    </div>
                  </div>
                ))
              )}
            </div>
            <form onSubmit={handleSendChat} className="p-3 border-t border-teams-border bg-[#1F1F24] flex gap-2">
              <input
                type="text"
                value={chatInput}
                onChange={e => setChatInput(e.target.value)}
                placeholder="Type message..."
                className="flex-1 bg-[#151518] border border-teams-border rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-teams-purple text-white placeholder-teams-muted"
              />
              <button type="submit" className="p-2 bg-teams-purple hover:bg-teams-purple/80 rounded-xl text-white">
                <Send className="w-4 h-4" />
              </button>
            </form>
          </div>
        )}
      </div>

      {/* Bottom Control Bar */}
      <div className="flex items-center justify-center gap-4 z-20 py-4 shrink-0">
        {callState === 'incoming' ? (
          <>
            <button onClick={handleDecline} className="px-8 py-4 bg-rose-600 hover:bg-rose-700 text-white rounded-full font-bold shadow-xl flex items-center gap-2">
              <PhoneOff className="w-5 h-5" /> Decline
            </button>
            <button onClick={handleAccept} className="px-8 py-4 bg-emerald-600 hover:bg-emerald-700 text-white rounded-full font-bold shadow-xl flex items-center gap-2">
              {callType === 'video' ? <Video className="w-5 h-5" /> : <Phone className="w-5 h-5" />} Accept
            </button>
          </>
        ) : (
          <div className="flex items-center gap-2 bg-[#1F1F24]/95 backdrop-blur-md px-6 py-3 rounded-full border border-teams-border shadow-2xl flex-wrap justify-center">
            
            <button onClick={() => { toggleWebRTCAudio(); toggleMute(); }} className={`p-3 rounded-full transition-all duration-200 ${isMuted || isAudioMuted ? 'bg-rose-500/20 text-rose-400 shadow-md' : 'bg-[#2D2D32] text-white hover:bg-teams-hover'}`}>
              {isMuted || isAudioMuted ? <MicOff className="w-5 h-5" /> : <Mic className="w-5 h-5" />}
            </button>

            {callType === 'video' && (
              <button onClick={() => { toggleWebRTCVideo(); toggleVideo(); }} className={`p-3 rounded-full transition-all duration-200 ${isVideoOff || isVideoMuted ? 'bg-rose-500/20 text-rose-400 shadow-md' : 'bg-[#2D2D32] text-white hover:bg-teams-hover'}`}>
                {isVideoOff || isVideoMuted ? <VideoOff className="w-5 h-5" /> : <Video className="w-5 h-5" />}
              </button>
            )}

            <button onClick={toggleScreenShare} className={`p-3 rounded-full transition-all duration-200 ${isScreenSharing ? 'bg-teams-purple/30 text-teams-purple shadow-md' : 'bg-[#2D2D32] text-white hover:bg-teams-hover'}`} title={isScreenSharing ? 'Stop sharing screen' : 'Share screen'}>
              <MonitorUp className="w-5 h-5" />
            </button>

            <div className="w-px h-8 bg-teams-border mx-2" />

            <button onClick={toggleHandRaise} className={`p-3 rounded-full ${raisedHands.has(currentUser?.id || 'local') ? 'bg-amber-500/20 text-amber-400 border border-amber-500/40' : 'bg-[#2D2D32] text-white hover:bg-teams-hover'}`} title="Raise Hand">
              <Hand className="w-5 h-5" />
            </button>

            <div className="relative group">
              <button className="p-3 rounded-full bg-[#2D2D32] text-white hover:bg-teams-hover" title="React">
                <Smile className="w-5 h-5" />
              </button>
              <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 hidden group-hover:flex bg-[#1F1F24] border border-teams-border rounded-xl p-2 gap-2 shadow-xl">
                {['👍', '❤️', '😂', '👏', '🎉'].map(emoji => (
                  <button key={emoji} onClick={() => sendReaction(emoji)} className="text-xl hover:scale-125 transition-transform">{emoji}</button>
                ))}
              </div>
            </div>

            <button onClick={() => setIsChatOpen(!isChatOpen)} className={`p-3 rounded-full ${isChatOpen ? 'bg-teams-purple text-white' : 'bg-[#2D2D32] text-white hover:bg-teams-hover'}`} title="Chat">
              <MessageSquare className="w-5 h-5" />
            </button>

            <div className="w-px h-8 bg-teams-border mx-2" />

            {isCaller ? (
              <button onClick={handleEndCallForAll} className="px-6 py-3 bg-rose-600 hover:bg-rose-700 text-white rounded-full font-bold flex items-center gap-2">
                <PhoneOff className="w-5 h-5" /> <span className="hidden sm:inline">{isGroupCall ? 'End Meet for All' : 'End Call'}</span>
              </button>
            ) : (
              <button onClick={handleLeaveCall} className="px-6 py-3 bg-orange-600 hover:bg-orange-700 text-white rounded-full font-bold flex items-center gap-2">
                <PhoneOff className="w-5 h-5" /> <span className="hidden sm:inline">{isGroupCall ? 'Leave Meet' : 'End Call'}</span>
              </button>
            )}
          </div>
        )}
      </div>

      <style>{`
        @keyframes float-up {
          0% { transform: translateY(0) scale(1); opacity: 1; }
          100% { transform: translateY(-200px) scale(1.5); opacity: 0; }
        }
        .animate-float-up {
          animation: float-up 3s ease-out forwards;
        }
      `}</style>
    </div>
  );
};
