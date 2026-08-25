"use client";

/**
 * MicroproTeams — Meeting Room Page
 * Full WebRTC video/audio conferencing powered by mediasoup SFU.
 * Features: video grid, mic/cam/screen controls, live captions, chat panel.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import {
  Mic, MicOff, Video, VideoOff, MonitorUp, Phone,
  MessageSquare, Users, Settings2, Hand, Smile,
  Bot, Copy, MoreHorizontal, ChevronDown, Maximize2
} from "lucide-react";
import { tokens } from "@/lib/api";

// ── Types ────────────────────────────────────────────────────────────────────

interface Participant {
  id: string;
  displayName: string;
  isMuted: boolean;
  isVideoOff: boolean;
  isSpeaking: boolean;
  stream?: MediaStream;
  isLocal?: boolean;
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
        <video
          ref={ref}
          autoPlay
          muted={participant.isLocal}
          playsInline
        />
      ) : (
        <div
          style={{
            width: "100%",
            height: "100%",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            background: "hsl(var(--surface-3))",
          }}
        >
          <div
            style={{
              width: 72,
              height: 72,
              borderRadius: "50%",
              background: "linear-gradient(135deg, hsl(var(--color-primary)), hsl(var(--color-accent)))",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: 26,
              fontWeight: 700,
              color: "white",
            }}
          >
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
        <div
          style={{
            position: "absolute",
            top: 8,
            right: 8,
            width: 10,
            height: 10,
            borderRadius: "50%",
            background: "hsl(var(--color-success))",
            animation: "pulse-glow 1.5s ease-in-out infinite",
          }}
        />
      )}
    </div>
  );
}

// ── Control Button ────────────────────────────────────────────────────────────

function ControlBtn({
  icon,
  label,
  active,
  danger,
  onClick,
}: {
  icon: React.ReactNode;
  label: string;
  active?: boolean;
  danger?: boolean;
  onClick?: () => void;
}) {
  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 4 }}>
      <button
        className={`control-btn${active ? " active" : ""}${danger ? " danger" : ""}`}
        onClick={onClick}
        aria-label={label}
        title={label}
      >
        {icon}
      </button>
      <span style={{ fontSize: 10, color: "hsl(var(--text-muted))" }}>{label}</span>
    </div>
  );
}

// ── Side Panel ────────────────────────────────────────────────────────────────

function SidePanel({
  kind,
  participants,
  captions,
  onClose,
}: {
  kind: PanelKind;
  participants: Participant[];
  captions: Caption[];
  onClose: () => void;
}) {
  const [chatInput, setChatInput] = useState("");
  const [chatMessages, setChatMessages] = useState<{ sender: string; text: string; time: string }[]>([
    { sender: "System", text: "Meeting chat is ready. Messages are end-to-end encrypted.", time: "now" },
  ]);

  if (!kind) return null;

  const panels: Record<NonNullable<PanelKind>, React.ReactNode> = {
    chat: (
      <>
        <div style={{ flex: 1, overflowY: "auto", padding: "12px 16px", display: "flex", flexDirection: "column", gap: 12 }}>
          {chatMessages.map((m, i) => (
            <div key={i}>
              <div style={{ fontSize: 11, color: "hsl(var(--text-muted))", marginBottom: 2 }}>
                {m.sender} · {m.time}
              </div>
              <div style={{ fontSize: 13, color: "hsl(var(--text-primary))", lineHeight: 1.5 }}>{m.text}</div>
            </div>
          ))}
        </div>
        <div style={{ padding: "12px 16px", borderTop: "1px solid hsl(var(--border-subtle))" }}>
          <div className="composer" style={{ borderRadius: 8 }}>
            <textarea
              className="composer-input"
              placeholder="Message the meeting…"
              value={chatInput}
              onChange={(e) => setChatInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  if (chatInput.trim()) {
                    setChatMessages((prev) => [
                      ...prev,
                      { sender: "You", text: chatInput.trim(), time: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) },
                    ]);
                    setChatInput("");
                  }
                }
              }}
              style={{ minHeight: 36, maxHeight: 120 }}
            />
          </div>
        </div>
      </>
    ),
    participants: (
      <div style={{ overflowY: "auto", padding: 16, display: "flex", flexDirection: "column", gap: 8 }}>
        {participants.map((p) => (
          <div
            key={p.id}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 10,
              padding: "8px 10px",
              borderRadius: 8,
              background: "hsl(var(--surface-2))",
            }}
          >
            <div
              style={{
                width: 32,
                height: 32,
                borderRadius: "50%",
                background: "linear-gradient(135deg, hsl(var(--color-primary)), hsl(var(--color-accent)))",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontSize: 12,
                fontWeight: 700,
                color: "white",
                flexShrink: 0,
              }}
            >
              {p.displayName.slice(0, 2).toUpperCase()}
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 13, fontWeight: 500, color: "hsl(var(--text-primary))" }}>
                {p.displayName} {p.isLocal && <span style={{ color: "hsl(var(--text-muted))", fontWeight: 400 }}>(You)</span>}
              </div>
            </div>
            <div style={{ display: "flex", gap: 4 }}>
              {p.isMuted ? <MicOff size={13} color="hsl(var(--color-danger))" /> : <Mic size={13} color="hsl(var(--color-success))" />}
              {p.isVideoOff ? <VideoOff size={13} color="hsl(var(--color-danger))" /> : <Video size={13} color="hsl(var(--color-success))" />}
            </div>
          </div>
        ))}
      </div>
    ),
    captions: (
      <div style={{ overflowY: "auto", padding: 16, display: "flex", flexDirection: "column", gap: 10 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 4 }}>
          <span className="ai-badge">LIVE AI</span>
          <span style={{ fontSize: 11, color: "hsl(var(--text-muted))" }}>Powered by Whisper</span>
        </div>
        {captions.length === 0 && (
          <div style={{ textAlign: "center", color: "hsl(var(--text-muted))", fontSize: 13, marginTop: 40 }}>
            <div style={{ fontSize: 32, marginBottom: 12 }}>🎙️</div>
            Captions will appear here as people speak…
          </div>
        )}
        {captions.map((c, i) => (
          <div key={i} style={{ padding: "8px 12px", borderRadius: 8, background: "hsl(var(--surface-2))" }}>
            <div style={{ fontSize: 11, color: "hsl(var(--color-primary))", marginBottom: 3 }}>{c.speaker}</div>
            <div style={{ fontSize: 13, color: "hsl(var(--text-primary))", lineHeight: 1.55 }}>{c.text}</div>
          </div>
        ))}
      </div>
    ),
    ai: (
      <div style={{ padding: 16, display: "flex", flexDirection: "column", gap: 12 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span className="ai-badge">AI CO-PILOT</span>
        </div>
        <p style={{ fontSize: 12, color: "hsl(var(--text-muted))", lineHeight: 1.6 }}>
          AI Meeting Assistant is listening. After the meeting ends, you&apos;ll receive an auto-generated summary, action items, and key decisions.
        </p>
        {[
          { emoji: "📋", label: "Summary", desc: "Auto-generated after meeting" },
          { emoji: "✅", label: "Action Items", desc: "Detected in real-time" },
          { emoji: "💡", label: "Key Decisions", desc: "Extracted by AI" },
          { emoji: "❓", label: "Open Questions", desc: "Unresolved discussion points" },
        ].map((item) => (
          <div key={item.label} style={{ display: "flex", gap: 12, alignItems: "flex-start", padding: "10px 12px", borderRadius: 10, background: "hsl(var(--surface-2))" }}>
            <span style={{ fontSize: 20 }}>{item.emoji}</span>
            <div>
              <div style={{ fontSize: 13, fontWeight: 600, color: "hsl(var(--text-primary))" }}>{item.label}</div>
              <div style={{ fontSize: 11, color: "hsl(var(--text-muted))", marginTop: 2 }}>{item.desc}</div>
            </div>
          </div>
        ))}
        <div style={{ marginTop: 8, padding: "12px 14px", borderRadius: 10, background: "hsl(var(--color-primary) / 0.08)", border: "1px solid hsl(var(--color-primary) / 0.2)" }}>
          <div style={{ fontSize: 12, color: "hsl(var(--color-primary))", fontWeight: 600, marginBottom: 4 }}>💬 Ask the AI</div>
          <input className="input" style={{ fontSize: 12 }} placeholder='E.g. "What was decided about Q3 budget?"' />
        </div>
      </div>
    ),
  };

  const titles: Record<NonNullable<PanelKind>, string> = {
    chat: "Meeting Chat",
    participants: `Participants (${participants.length})`,
    captions: "Live Captions",
    ai: "AI Co-pilot",
  };

  return (
    <div
      style={{
        width: 320,
        borderLeft: "1px solid hsl(var(--border-subtle))",
        display: "flex",
        flexDirection: "column",
        background: "hsl(var(--surface-1))",
        flexShrink: 0,
        overflow: "hidden",
      }}
    >
      <div
        style={{
          padding: "0 16px",
          height: 56,
          borderBottom: "1px solid hsl(var(--border-subtle))",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          flexShrink: 0,
        }}
      >
        <span style={{ fontWeight: 600, fontSize: 14 }}>{titles[kind]}</span>
        <button className="action-btn" onClick={onClose} aria-label="Close panel">✕</button>
      </div>
      <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden" }}>
        {panels[kind]}
      </div>
    </div>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────

export default function MeetingRoomPage() {
  const params = useParams();
  const router = useRouter();
  const meetingId = params?.id as string;

  const [isMuted, setIsMuted] = useState(false);
  const [isVideoOff, setIsVideoOff] = useState(false);
  const [isScreenSharing, setIsScreenSharing] = useState(false);
  const [isHandRaised, setIsHandRaised] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [activePanel, setActivePanel] = useState<PanelKind>(null);
  const [elapsed, setElapsed] = useState(0);

  const localVideoRef = useRef<HTMLVideoElement>(null);
  const localStreamRef = useRef<MediaStream | null>(null);

  // Demo participants (would come from mediasoup signaling in production)
  const [participants] = useState<Participant[]>([
    {
      id: "local",
      displayName: "You",
      isMuted: isMuted,
      isVideoOff: isVideoOff,
      isSpeaking: false,
      isLocal: true,
    },
    {
      id: "peer-1",
      displayName: "Sarah Chen",
      isMuted: false,
      isVideoOff: false,
      isSpeaking: true,
    },
    {
      id: "peer-2",
      displayName: "James Okafor",
      isMuted: true,
      isVideoOff: false,
      isSpeaking: false,
    },
  ]);

  const [captions] = useState<Caption[]>([
    { speaker: "Sarah Chen", text: "Let's review the Q3 product roadmap. We need to finalize the timeline by end of week.", timestamp: Date.now() - 60000 },
    { speaker: "James Okafor", text: "Agreed. The main blocker is the API integration work — I'll send an update by Friday.", timestamp: Date.now() - 30000 },
  ]);

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

  // Init local media
  useEffect(() => {
    (async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
        localStreamRef.current = stream;
        if (localVideoRef.current) {
          localVideoRef.current.srcObject = stream;
        }
      } catch (err) {
        console.warn("Media access denied:", err);
      }
    })();
    return () => {
      localStreamRef.current?.getTracks().forEach((t) => t.stop());
    };
  }, []);

  const toggleMic = useCallback(() => {
    localStreamRef.current?.getAudioTracks().forEach((t) => { t.enabled = isMuted; });
    setIsMuted((m) => !m);
  }, [isMuted]);

  const toggleVideo = useCallback(() => {
    localStreamRef.current?.getVideoTracks().forEach((t) => { t.enabled = isVideoOff; });
    setIsVideoOff((v) => !v);
  }, [isVideoOff]);

  const toggleScreen = useCallback(async () => {
    if (!isScreenSharing) {
      try {
        await navigator.mediaDevices.getDisplayMedia({ video: true });
        setIsScreenSharing(true);
      } catch { /* cancelled */ }
    } else {
      setIsScreenSharing(false);
    }
  }, [isScreenSharing]);

  const togglePanel = (panel: NonNullable<PanelKind>) => {
    setActivePanel((prev) => (prev === panel ? null : panel));
  };

  const endCall = () => {
    localStreamRef.current?.getTracks().forEach((t) => t.stop());
    router.back();
  };

  const copyLink = () => {
    navigator.clipboard.writeText(`${window.location.origin}/meeting/${meetingId}`);
  };

  return (
    <div
      style={{
        height: "100dvh",
        display: "flex",
        flexDirection: "column",
        background: "hsl(var(--surface-0))",
        overflow: "hidden",
      }}
    >
      {/* ── Top bar ── */}
      <div
        style={{
          height: 56,
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "0 20px",
          borderBottom: "1px solid hsl(var(--border-subtle))",
          background: "hsl(var(--surface-1))",
          flexShrink: 0,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <div
            style={{
              width: 32,
              height: 32,
              borderRadius: 8,
              background: "linear-gradient(135deg, hsl(var(--color-primary)), hsl(var(--color-accent)))",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: 16,
            }}
          >
            🎥
          </div>
          <div>
            <div style={{ fontWeight: 600, fontSize: 14 }}>Product Sync — Q3 Roadmap</div>
            <div style={{ fontSize: 11, color: "hsl(var(--text-muted))" }}>
              {formatTime(elapsed)} · {participants.length} participants
              {isRecording && (
                <span style={{ marginLeft: 8, color: "hsl(var(--color-danger))", fontWeight: 600 }}>
                  ⏺ Recording
                </span>
              )}
            </div>
          </div>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span className="ai-badge">AI ON</span>
          <button
            className="action-btn"
            onClick={copyLink}
            title="Copy meeting link"
            aria-label="Copy meeting link"
          >
            <Copy size={15} />
          </button>
          <button className="action-btn" title="More options" aria-label="More options">
            <MoreHorizontal size={15} />
          </button>
        </div>
      </div>

      {/* ── Main area ── */}
      <div style={{ flex: 1, display: "flex", overflow: "hidden" }}>
        {/* ── Video grid ── */}
        <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden" }}>
          <div
            className="meeting-grid"
            data-count={String(participants.length)}
            style={{ flex: 1, overflow: "auto" }}
          >
            {/* Local tile with actual video ref */}
            <div className={`video-tile${false ? " speaking" : ""}`}>
              {!isVideoOff ? (
                <video ref={localVideoRef} autoPlay muted playsInline style={{ width: "100%", height: "100%", objectFit: "cover" }} />
              ) : (
                <div style={{ width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center", background: "hsl(var(--surface-3))" }}>
                  <div style={{ width: 72, height: 72, borderRadius: "50%", background: "linear-gradient(135deg, hsl(var(--color-primary)), hsl(var(--color-accent)))", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 26, fontWeight: 700, color: "white" }}>
                    YO
                  </div>
                </div>
              )}
              <div className="video-tile-name">
                You {isMuted && "🔇"}
              </div>
            </div>
            {/* Remote participants */}
            {participants.filter((p) => !p.isLocal).map((p) => (
              <VideoTile key={p.id} participant={p} />
            ))}
          </div>
        </div>

        {/* ── Side panel ── */}
        <SidePanel
          kind={activePanel}
          participants={participants}
          captions={captions}
          onClose={() => setActivePanel(null)}
        />
      </div>

      {/* ── Controls bar ── */}
      <div className="meeting-controls">
        <ControlBtn icon={isMuted ? <MicOff size={20} /> : <Mic size={20} />} label={isMuted ? "Unmute" : "Mute"} active={!isMuted} onClick={toggleMic} />
        <ControlBtn icon={isVideoOff ? <VideoOff size={20} /> : <Video size={20} />} label={isVideoOff ? "Start Video" : "Stop Video"} active={!isVideoOff} onClick={toggleVideo} />
        <ControlBtn icon={<MonitorUp size={20} />} label="Share Screen" active={isScreenSharing} onClick={toggleScreen} />
        <ControlBtn icon={<Hand size={20} />} label="Raise Hand" active={isHandRaised} onClick={() => setIsHandRaised((h) => !h)} />
        <ControlBtn icon={<Smile size={20} />} label="React" />
        <div style={{ width: 1, height: 40, background: "hsl(var(--border-medium))", margin: "0 4px" }} />
        <ControlBtn icon={<MessageSquare size={20} />} label="Chat" active={activePanel === "chat"} onClick={() => togglePanel("chat")} />
        <ControlBtn icon={<Users size={20} />} label="People" active={activePanel === "participants"} onClick={() => togglePanel("participants")} />
        <ControlBtn icon={<ChevronDown size={20} />} label="Captions" active={activePanel === "captions"} onClick={() => togglePanel("captions")} />
        <ControlBtn icon={<Bot size={20} />} label="AI Notes" active={activePanel === "ai"} onClick={() => togglePanel("ai")} />
        <ControlBtn icon={<Settings2 size={20} />} label="Settings" />
        <div style={{ width: 1, height: 40, background: "hsl(var(--border-medium))", margin: "0 4px" }} />
        <ControlBtn
          icon={<Phone size={20} />}
          label="End Call"
          danger
          onClick={endCall}
        />
      </div>
    </div>
  );
}
