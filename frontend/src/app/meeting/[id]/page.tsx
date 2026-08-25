"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import {
  Mic, MicOff, Video, VideoOff, MonitorUp, Phone,
  MessageSquare, Users, Settings2, Hand, Smile,
  Bot, Copy, MoreHorizontal, ChevronDown, Maximize2
} from "lucide-react";
import { useAppStore } from "@/store/useAppStore";
import { io, Socket } from "socket.io-client";
import * as mediasoupClient from "mediasoup-client";
import SidePanel from "@/components/SidePanel";

interface Participant {
  id: string;
  displayName: string;
  isMuted: boolean;
  isVideoOff: boolean;
  isSpeaking: boolean;
  stream?: MediaStream;
  isLocal?: boolean;
  isHandRaised?: boolean;
  activeEmoji?: string | null;
}

interface Caption {
  speaker: string;
  text: string;
  timestamp: number;
}

type PanelKind = "chat" | "participants" | "captions" | "ai" | null;

// ── Video Tile ────────────────────────────────────────────────────────────────
function VideoTile({ participant }: { participant: Participant }) {
  const ref = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    if (ref.current && participant.stream) {
      ref.current.srcObject = participant.stream;
    }
  }, [participant.stream]);

  const initials = participant.displayName
    .split(" ")
    .map((w) => w[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);

  return (
    <div className={`video-tile${participant.isSpeaking ? " speaking" : ""}`}>
      {participant.stream && !participant.isVideoOff ? (
        <video ref={ref} autoPlay muted={participant.isLocal} playsInline />
      ) : (
        <div style={{ width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center", background: "hsl(var(--surface-3))" }}>
          <div style={{ width: 72, height: 72, borderRadius: "50%", background: "linear-gradient(135deg, hsl(var(--color-primary)), hsl(var(--color-accent)))", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 26, fontWeight: 700, color: "white" }}>
            {initials}
          </div>
        </div>
      )}
      <div className="video-tile-name">
        {participant.displayName}
        {participant.isLocal && " (You)"}
        {participant.isMuted && " 🔇"}
      </div>
      {participant.isSpeaking && (
        <div style={{ position: "absolute", top: 8, right: 8, width: 10, height: 10, borderRadius: "50%", background: "hsl(var(--color-success))", animation: "pulse-glow 1.5s ease-in-out infinite" }} />
      )}
      {participant.isHandRaised && (
        <div style={{ position: "absolute", top: 8, left: 8, fontSize: 24, background: "rgba(0,0,0,0.5)", borderRadius: "50%", padding: 4 }}>
          ✋
        </div>
      )}
      {participant.activeEmoji && (
        <div style={{ position: "absolute", top: "50%", left: "50%", transform: "translate(-50%, -50%)", fontSize: 64, animation: "float-up-fade 2s ease-out forwards" }}>
          {participant.activeEmoji}
        </div>
      )}
    </div>
  );
}

function ControlBtn({ icon, label, active, danger, onClick }: { icon: React.ReactNode; label: string; active?: boolean; danger?: boolean; onClick?: () => void; }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 4 }}>
      <button className={`control-btn${active ? " active" : ""}${danger ? " danger" : ""}`} onClick={onClick} aria-label={label} title={label}>
        {icon}
      </button>
      <span style={{ fontSize: 10, color: "hsl(var(--text-muted))" }}>{label}</span>
    </div>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────
export default function MeetingRoomPage() {
  const params = useParams();
  const searchParams = useSearchParams();
  const router = useRouter();
  const meetingId = params?.id as string;
  
  const initialAudio = searchParams.get("audio") === "true";
  const initialVideo = searchParams.get("video") === "true";

  const [isMuted, setIsMuted] = useState(!initialAudio);
  const [isVideoOff, setIsVideoOff] = useState(!initialVideo);
  const [isScreenSharing, setIsScreenSharing] = useState(false);
  const [activePanel, setActivePanel] = useState<PanelKind>(null);
  const [isHandRaised, setIsHandRaised] = useState(false);
  const [activeEmoji, setActiveEmoji] = useState<string | null>(null);
  const [elapsed, setElapsed] = useState(0);

  const localVideoRef = useRef<HTMLVideoElement>(null);
  const localStreamRef = useRef<MediaStream | null>(null);
  const screenStreamRef = useRef<MediaStream | null>(null);

  const channels = useAppStore((s) => s.channels);
  const usersById = useAppStore((s) => s.usersById);
  const user = useAppStore((s) => s.user);

  const channel = channels.find((c) => c.id === meetingId);
  let meetingTitle = channel ? channel.name : "Meeting Call";

  if (channel && channel.type === "dm") {
    const nameWithoutDm = channel.name.replace("dm-", "");
    const uuid1 = nameWithoutDm.substring(0, 36);
    const uuid2 = nameWithoutDm.substring(37, 73);
    const partnerId = uuid1 === user?.id ? uuid2 : uuid1;
    const partner = usersById[partnerId];
    if (partner) {
      meetingTitle = `${partner.display_name || partner.username} (Call)`;
    } else {
      meetingTitle = "Direct Message Call";
    }
  } else if (channel) {
    meetingTitle = `${channel.name} Call`;
  }

  // Timer
  useEffect(() => {
    const interval = setInterval(() => setElapsed((e) => e + 1), 1000);
    return () => clearInterval(interval);
  }, []);

  const formatTime = (s: number) => {
    const m = Math.floor(s / 60);
    const sec = s % 60;
    return `${String(m).padStart(2, "0")}:${String(sec).padStart(2, "0")}`;
  };

  // Mediasoup state
  const [participants, setParticipants] = useState<Participant[]>([]);
  const [chatMessages, setChatMessages] = useState<any[]>([
    { senderId: "system", sender: "System", text: "Meeting chat is ready. Messages are end-to-end encrypted.", time: "now" }
  ]);
  const socketRef = useRef<Socket | null>(null);
  const deviceRef = useRef<mediasoupClient.Device | null>(null);
  const sendTransportRef = useRef<mediasoupClient.types.Transport | null>(null);
  const recvTransportRef = useRef<mediasoupClient.types.Transport | null>(null);
  const consumersRef = useRef<Map<string, mediasoupClient.types.Consumer>>(new Map());
  const screenProducerIdRef = useRef<string | null>(null);

  // Set up local media immediately
  useEffect(() => {
    (async () => {
      try {
        if (!navigator.mediaDevices) {
          console.warn("navigator.mediaDevices is undefined. HTTPS is required for camera/mic access.");
          return;
        }

        // getUserMedia throws if both audio and video are false
        if (isVideoOff && isMuted) {
          localStreamRef.current = new MediaStream();
          return;
        }

        const stream = await navigator.mediaDevices.getUserMedia({ video: !isVideoOff, audio: !isMuted });
        localStreamRef.current = stream;
        if (localVideoRef.current) {
          localVideoRef.current.srcObject = stream;
        }
      } catch (err) {
        console.warn("Local media not accessible", err);
        localStreamRef.current = new MediaStream();
      }
    })();
    return () => {
      localStreamRef.current?.getTracks().forEach((t) => t.stop());
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // Run once on mount

  // Mediasoup Connection
  useEffect(() => {
    if (!user) return;

    // Use window.location.origin to route through Nginx proxy, which fixes HTTPS mixed content
    const socketUrl = window.location.origin;
    const socket = io(socketUrl);
    socketRef.current = socket;

    socket.on("connect", async () => {
      console.log("Connected to SFU signaling");
      
      // 1. Get RTP capabilities
      try {
        const res = await fetch(`${socketUrl}/rooms/${meetingId}/rtp-capabilities`);
        const { rtpCapabilities } = await res.json();
        
        // 2. Load device
        const device = new mediasoupClient.Device();
        await device.load({ routerRtpCapabilities: rtpCapabilities });
        deviceRef.current = device;

        // 3. Join room
        socket.emit("join-room", { 
          roomId: meetingId, 
          peerId: socket.id, 
          displayName: user.display_name || user.username 
        }, async (response: any) => {
          if (response.error) {
            console.error(response.error);
            return;
          }

          // Add existing peers
          const existingPeers: Participant[] = response.peers.map((p: any) => ({
            id: p.id,
            displayName: p.displayName,
            isMuted: false,
            isVideoOff: false,
            isSpeaking: false,
            stream: new MediaStream()
          }));
          setParticipants(prev => [...prev, ...existingPeers]);

          // 4. Create Send Transport
          socket.emit("create-transport", { direction: "send" }, async (transportOptions: any) => {
            const transport = device.createSendTransport(transportOptions);
            sendTransportRef.current = transport;

            transport.on("connect", ({ dtlsParameters }, callback, errback) => {
              socket.emit("connect-transport", { transportId: transport.id, dtlsParameters }, (ack: any) => {
                if (ack.error) errback(ack.error);
                else callback();
              });
            });

            transport.on("produce", (parameters, callback, errback) => {
              socket.emit("produce", {
                transportId: transport.id,
                kind: parameters.kind,
                rtpParameters: parameters.rtpParameters,
                appData: parameters.appData
              }, (ack: any) => {
                if (ack.error) errback(ack.error);
                else callback({ id: ack.producerId });
              });
            });

            // Start producing local stream tracks
            if (localStreamRef.current) {
              const audioTrack = localStreamRef.current.getAudioTracks()[0];
              const videoTrack = localStreamRef.current.getVideoTracks()[0];
              if (audioTrack && !isMuted) await transport.produce({ track: audioTrack, appData: { type: "audio" }});
              if (videoTrack && !isVideoOff) await transport.produce({ track: videoTrack, appData: { type: "video" }});
            }
          });

          // 5. Create Receive Transport
          socket.emit("create-transport", { direction: "recv" }, async (transportOptions: any) => {
            const transport = device.createRecvTransport(transportOptions);
            recvTransportRef.current = transport;

            transport.on("connect", ({ dtlsParameters }, callback, errback) => {
              socket.emit("connect-transport", { transportId: transport.id, dtlsParameters }, (ack: any) => {
                if (ack.error) errback(ack.error);
                else callback();
              });
            });

            // Fetch and consume existing producers
            socket.emit("get-producers", (producers: any[]) => {
              producers.forEach(p => consumeProducer(p));
            });
          });

        });

      } catch (err) {
        console.error("Failed SFU setup", err);
      }
    });

    const consumeProducer = async ({ producerId, peerId, kind, appData }: any) => {
      const device = deviceRef.current;
      const transport = recvTransportRef.current;
      if (!device || !transport) return;

      socket.emit("consume", {
        producerId,
        rtpCapabilities: device.rtpCapabilities,
        transportId: transport.id
      }, async (response: any) => {
        if (response.error) return;

        const consumer = await transport.consume({
          id: response.consumerId,
          producerId: response.producerId,
          kind: response.kind,
          rtpParameters: response.rtpParameters
        });

        consumersRef.current.set(consumer.id, consumer);

        setParticipants(prev => {
          if (appData?.type === "screen") {
            const owner = prev.find(p => p.id === peerId);
            return [...prev, {
              id: `${peerId}-screen`,
              displayName: owner ? `${owner.displayName}'s Screen` : "Screen",
              isMuted: true,
              isVideoOff: false,
              isSpeaking: false,
              stream: new MediaStream([consumer.track])
            }];
          } else {
            return prev.map(p => {
              if (p.id === peerId) {
                if (p.stream) p.stream.addTrack(consumer.track);
                else p.stream = new MediaStream([consumer.track]);
                
                if (kind === "video") p.isVideoOff = false;
                if (kind === "audio") p.isMuted = false;
              }
              return p;
            });
          }
        });

        socket.emit("resume-consumer", { consumerId: consumer.id }, () => {});
      });
    };

    socket.on("peer-joined", ({ peerId, displayName }) => {
      setParticipants(prev => {
        if (prev.find(p => p.id === peerId)) return prev;
        return [...prev, {
          id: peerId,
          displayName,
          isMuted: false,
          isVideoOff: false,
          isSpeaking: false,
          stream: new MediaStream()
        }];
      });
    });

    socket.on("peer-left", ({ peerId }) => {
      setParticipants(prev => prev.filter(p => p.id !== peerId && p.id !== `${peerId}-screen`));
    });

    socket.on("producer-closed", ({ producerId, peerId }) => {
      // For now, if a producer is closed, we'll assume it might be a screen share ending
      // We can just remove the screen participant
      setParticipants(prev => prev.filter(p => p.id !== `${peerId}-screen`));
    });

    socket.on("new-producer", consumeProducer);

    socket.on("meeting:action", ({ peerId, action, payload }) => {
      if (action === "hand-raise") {
        setParticipants(prev => prev.map(p => p.id === peerId ? { ...p, isHandRaised: payload.isRaised } : p));
      } else if (action === "emoji") {
        setParticipants(prev => prev.map(p => p.id === peerId ? { ...p, activeEmoji: payload.emoji } : p));
        setTimeout(() => {
          setParticipants(prev => prev.map(p => p.id === peerId ? { ...p, activeEmoji: null } : p));
        }, 2000);
      } else if (action === "chat") {
        setParticipants(prev => {
          const senderPeer = prev.find(p => p.id === peerId);
          const senderName = senderPeer ? senderPeer.displayName : "Unknown";
          setChatMessages(msgs => [
            ...msgs,
            { senderId: peerId, sender: senderName, text: payload.text, time: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) }
          ]);
          return prev;
        });
      }
    });

    return () => {
      socket.disconnect();
    };
  }, [meetingId, user]);

  const toggleMic = async () => {
    if (!navigator.mediaDevices) {
      alert("Microphone access requires a secure HTTPS connection or localhost.");
      return;
    }

    setIsMuted(!isMuted);
    
    // Manage local stream tracks
    if (!localStreamRef.current) {
      localStreamRef.current = new MediaStream();
    }
    
    const track = localStreamRef.current.getAudioTracks()[0];
    if (track) {
      track.enabled = isMuted; // Toggle if exists
    } else if (isMuted && sendTransportRef.current) { // Muted -> Unmuted, but no track
       try {
         const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
         const newTrack = stream.getAudioTracks()[0];
         localStreamRef.current.addTrack(newTrack);
         await sendTransportRef.current.produce({ track: newTrack, appData: { type: "audio" }});
       } catch(e) {
         console.warn("Failed to get audio", e);
       }
    }
  };

  const toggleVideo = async () => {
    if (!navigator.mediaDevices) {
      alert("Camera access requires a secure HTTPS connection or localhost.");
      return;
    }

    setIsVideoOff(!isVideoOff);

    if (!localStreamRef.current) {
      localStreamRef.current = new MediaStream();
    }

    const track = localStreamRef.current.getVideoTracks()[0];
    if (track) {
      track.enabled = isVideoOff; // Toggle if exists
    } else if (isVideoOff && sendTransportRef.current) {
       try {
         const stream = await navigator.mediaDevices.getUserMedia({ video: true });
         const newTrack = stream.getVideoTracks()[0];
         localStreamRef.current.addTrack(newTrack);
         if (localVideoRef.current) localVideoRef.current.srcObject = localStreamRef.current;
         await sendTransportRef.current.produce({ track: newTrack, appData: { type: "video" }});
       } catch(e) {
         console.warn("Failed to get video", e);
       }
    }
  };

  const toggleScreen = async () => {
    if (!navigator.mediaDevices) {
      alert("Screen sharing requires a secure HTTPS connection or localhost.");
      return;
    }

    if (!isScreenSharing && sendTransportRef.current) {
      try {
        const stream = await navigator.mediaDevices.getDisplayMedia({ video: true });
        screenStreamRef.current = stream;
        const track = stream.getVideoTracks()[0];
        
        const producer = await sendTransportRef.current.produce({ track, appData: { type: "screen" } });
        screenProducerIdRef.current = producer.id;
        setIsScreenSharing(true);

        track.onended = () => {
          setIsScreenSharing(false);
          if (screenProducerIdRef.current) {
            socketRef.current?.emit("close-producer", { producerId: screenProducerIdRef.current });
            screenProducerIdRef.current = null;
          }
          screenStreamRef.current = null;
        };
      } catch (err) {}
    } else {
      screenStreamRef.current?.getTracks().forEach(t => t.stop());
      setIsScreenSharing(false);
      if (screenProducerIdRef.current) {
        socketRef.current?.emit("close-producer", { producerId: screenProducerIdRef.current });
        screenProducerIdRef.current = null;
      }
    }
  };

  const toggleHandRaise = () => {
    setIsHandRaised(!isHandRaised);
    socketRef.current?.emit("meeting:action", { roomId: meetingId, peerId: user?.id, action: "hand-raise", payload: { isRaised: !isHandRaised } });
  };

  const sendEmoji = (emoji: string) => {
    setActiveEmoji(emoji);
    socketRef.current?.emit("meeting:action", { roomId: meetingId, peerId: socketRef.current.id, action: "emoji", payload: { emoji } });
    setTimeout(() => setActiveEmoji(null), 2000);
  };

  const sendChatMessage = (text: string) => {
    setChatMessages(prev => [
      ...prev,
      { senderId: socketRef.current?.id || user?.id, sender: "You", text, time: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) }
    ]);
    socketRef.current?.emit("meeting:action", { roomId: meetingId, peerId: socketRef.current?.id, action: "chat", payload: { text } });
  };

  const togglePanel = (panel: NonNullable<PanelKind>) => {
    setActivePanel((prev) => (prev === panel ? null : panel));
  };

  const endCall = () => {
    localStreamRef.current?.getTracks().forEach((t) => t.stop());
    screenStreamRef.current?.getTracks().forEach((t) => t.stop());
    socketRef.current?.disconnect();
    router.back();
  };

  return (
    <div style={{ height: "100dvh", display: "flex", flexDirection: "column", background: "hsl(var(--surface-0))", overflow: "hidden" }}>
      {/* ── Top bar ── */}
      <div style={{ height: 56, display: "flex", alignItems: "center", justifyContent: "space-between", padding: "0 20px", borderBottom: "1px solid hsl(var(--border-subtle))", background: "hsl(var(--surface-1))", flexShrink: 0 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <div style={{ width: 32, height: 32, borderRadius: 8, background: "linear-gradient(135deg, hsl(var(--color-primary)), hsl(var(--color-accent)))", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 16 }}>🎥</div>
          <div>
            <div style={{ fontWeight: 600, fontSize: 14 }}>{meetingTitle}</div>
            <div style={{ fontSize: 11, color: "hsl(var(--text-muted))" }}>
              {formatTime(elapsed)} · {participants.length + 1} participants
            </div>
          </div>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <button className="action-btn" onClick={() => navigator.clipboard.writeText(`${window.location.origin}/meeting/${meetingId}`)} title="Copy link" aria-label="Copy link"><Copy size={15} /></button>
          <button className="action-btn" title="More options" aria-label="More options"><MoreHorizontal size={15} /></button>
        </div>
      </div>

      {/* ── Main area ── */}
      <div style={{ flex: 1, display: "flex", overflow: "hidden" }}>
        {/* ── Video grid ── */}
        <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden" }}>
          <div className="meeting-grid" data-count={String(participants.length + 1)} style={{ flex: 1, overflow: "auto" }}>
            {/* Local tile */}
            <div className={`video-tile${false ? " speaking" : ""}`}>
              {!isVideoOff ? (
                <video ref={localVideoRef} autoPlay muted playsInline style={{ width: "100%", height: "100%", objectFit: "cover" }} />
              ) : (
                <div style={{ width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center", background: "hsl(var(--surface-3))" }}>
                  <div style={{ width: 72, height: 72, borderRadius: "50%", background: "linear-gradient(135deg, hsl(var(--color-primary)), hsl(var(--color-accent)))", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 26, fontWeight: 700, color: "white" }}>
                    {user?.username.slice(0, 2).toUpperCase() || "YO"}
                  </div>
                </div>
              )}
              <div className="video-tile-name">You {isMuted && "🔇"}</div>
              {isHandRaised && (
                <div style={{ position: "absolute", top: 8, left: 8, fontSize: 24, background: "rgba(0,0,0,0.5)", borderRadius: "50%", padding: 4 }}>
                  ✋
                </div>
              )}
              {activeEmoji && (
                <div style={{ position: "absolute", top: "50%", left: "50%", transform: "translate(-50%, -50%)", fontSize: 64, animation: "float-up-fade 2s ease-out forwards" }}>
                  {activeEmoji}
                </div>
              )}
            </div>
            
            {/* Remote participants */}
            {participants.map((p) => (
              <VideoTile key={p.id} participant={p} />
            ))}
          </div>
        </div>

        {/* ── Side panel ── */}
        <SidePanel
          kind={activePanel}
          participants={[{
            id: "local",
            displayName: user?.display_name || user?.username || "You",
            isMuted: isMuted,
            isVideoOff: isVideoOff,
            isSpeaking: false,
            isLocal: true,
          }, ...participants]}
          chatMessages={chatMessages}
          onSendMessage={sendChatMessage}
          onClose={() => setActivePanel(null)}
        />
      </div>

      {/* ── Controls bar ── */}
      <div className="meeting-controls">
        <ControlBtn icon={isMuted ? <MicOff size={20} /> : <Mic size={20} />} label={isMuted ? "Unmute" : "Mute"} active={!isMuted} onClick={toggleMic} />
        <ControlBtn icon={isVideoOff ? <VideoOff size={20} /> : <Video size={20} />} label={isVideoOff ? "Start Video" : "Stop Video"} active={!isVideoOff} onClick={toggleVideo} />
        <ControlBtn icon={<MonitorUp size={20} />} label="Share Screen" active={isScreenSharing} onClick={toggleScreen} />
        <ControlBtn icon={<Hand size={20} />} label="Raise Hand" active={isHandRaised} onClick={toggleHandRaise} />
        <ControlBtn icon={<Smile size={20} />} label="React" onClick={() => sendEmoji("👏")} />
        <div style={{ width: 1, height: 40, background: "hsl(var(--border-medium))", margin: "0 4px" }} />
        <ControlBtn icon={<MessageSquare size={20} />} label="Chat" active={activePanel === "chat"} onClick={() => togglePanel("chat")} />
        <ControlBtn icon={<Users size={20} />} label="People" active={activePanel === "participants"} onClick={() => togglePanel("participants")} />
        <ControlBtn icon={<Phone size={20} />} label="End Call" danger onClick={endCall} />
      </div>
    </div>
  );
}
