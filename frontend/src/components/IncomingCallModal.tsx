"use client";

import { useAppStore } from "@/store/useAppStore";
import { getSocket } from "@/lib/socket";
import { Phone, PhoneOff, Video } from "lucide-react";
import { useRouter } from "next/navigation";

export default function IncomingCallModal() {
  const incomingCall = useAppStore((s) => s.incomingCall);
  const setIncomingCall = useAppStore((s) => s.setIncomingCall);
  const usersById = useAppStore((s) => s.usersById);
  const router = useRouter();

  if (!incomingCall) return null;

  const caller = usersById[incomingCall.caller_id];
  const callerName = caller?.display_name || caller?.username || "Someone";
  const isVideo = incomingCall.type === "video";

  const handleAccept = () => {
    // Navigate to meeting room
    router.push(`/meeting/${incomingCall.meeting_id}?audio=true${isVideo ? "&video=true" : ""}`);
    setIncomingCall(null);
  };

  const handleDecline = () => {
    const socket = getSocket();
    if (socket) {
      socket.emit("call:decline", {
        caller_id: incomingCall.caller_id,
        meeting_id: incomingCall.meeting_id,
      });
    }
    setIncomingCall(null);
  };

  return (
    <div className="modal-backdrop">
      <div className="modal-content" style={{ width: 320, padding: 24, textAlign: "center" }}>
        <div
          style={{
            width: 64,
            height: 64,
            borderRadius: "50%",
            background: "linear-gradient(135deg, hsl(var(--color-primary)), hsl(var(--color-accent)))",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontSize: 24,
            color: "white",
            margin: "0 auto 16px",
          }}
        >
          {callerName.slice(0, 2).toUpperCase()}
        </div>
        <h2 style={{ fontSize: 18, fontWeight: 600, marginBottom: 8 }}>{callerName}</h2>
        <p style={{ color: "hsl(var(--text-muted))", fontSize: 14, marginBottom: 24 }}>
          Incoming {isVideo ? "video" : "audio"} call...
        </p>

        <div style={{ display: "flex", gap: 16, justifyContent: "center" }}>
          <button
            onClick={handleDecline}
            style={{
              width: 48,
              height: 48,
              borderRadius: "50%",
              background: "hsl(var(--color-danger))",
              color: "white",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              border: "none",
              cursor: "pointer",
            }}
            title="Decline"
          >
            <PhoneOff size={24} />
          </button>
          <button
            onClick={handleAccept}
            style={{
              width: 48,
              height: 48,
              borderRadius: "50%",
              background: "hsl(var(--color-success))",
              color: "white",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              border: "none",
              cursor: "pointer",
            }}
            title="Accept"
          >
            {isVideo ? <Video size={24} /> : <Phone size={24} />}
          </button>
        </div>
      </div>
    </div>
  );
}
