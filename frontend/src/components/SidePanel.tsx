"use client";

import { useState } from "react";
import { Mic, MicOff, Video, VideoOff } from "lucide-react";

type PanelKind = "chat" | "participants" | "captions" | "ai" | null;

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

export interface ChatMessage {
  senderId: string;
  sender: string;
  text: string;
  time: string;
}

export default function SidePanel({
  kind,
  participants,
  captions = [],
  chatMessages = [],
  onSendMessage,
  onClose,
}: {
  kind: PanelKind;
  participants: Participant[];
  captions?: Caption[];
  chatMessages?: ChatMessage[];
  onSendMessage?: (text: string) => void;
  onClose: () => void;
}) {
  const [chatInput, setChatInput] = useState("");

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
                  if (chatInput.trim() && onSendMessage) {
                    onSendMessage(chatInput.trim());
                    setChatInput("");
                  }
                }
              }}
              style={{ minHeight: 36, maxHeight: 120, width: "100%", background: "transparent", border: "none", outline: "none", resize: "none", color: "hsl(var(--text-primary))" }}
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
