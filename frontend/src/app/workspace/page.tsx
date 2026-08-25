"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Search, Video, Edit3, MoreHorizontal, Phone, ExternalLink, Trash2 } from "lucide-react";

import AppRail from "@/components/AppRail";
import TopHeader from "@/components/TopHeader";
import Sidebar from "@/components/Sidebar";
import MessageList from "@/components/MessageList";
import Composer from "@/components/Composer";
import TypingIndicator from "@/components/TypingIndicator";
import CreateModal from "@/components/CreateModal";
import { useAppStore } from "@/store/useAppStore";
import { useRealtime } from "@/hooks/useRealtime";
import { tokens } from "@/lib/api";

type ModalKind = "channel" | "workspace" | null;

function CenteredNotice({
  emoji,
  title,
  body,
  action,
}: {
  emoji: string;
  title: string;
  body: string;
  action?: React.ReactNode;
}) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        height: "100dvh",
        padding: 24,
        background: "#1f1f1f",
        color: "#fff",
      }}
    >
      <div style={{ textAlign: "center", maxWidth: 380 }}>
        <div style={{ fontSize: 44, marginBottom: 14 }}>{emoji}</div>
        <h2 style={{ fontSize: 18, fontWeight: 700, marginBottom: 8 }}>{title}</h2>
        <p
          style={{
            fontSize: 13.5,
            color: "#a1a1a1",
            lineHeight: 1.65,
            marginBottom: action ? 22 : 0,
          }}
        >
          {body}
        </p>
        {action}
      </div>
    </div>
  );
}

export default function WorkspacePage() {
  const router = useRouter();
  const authed = Boolean(tokens.access);
  const [modal, setModal] = useState<ModalKind>(null);

  const bootstrap = useAppStore((s) => s.bootstrap);
  const bootstrapped = useAppStore((s) => s.bootstrapped);
  const workspace = useAppStore((s) => s.workspace);
  const channels = useAppStore((s) => s.channels);
  const activeChannelId = useAppStore((s) => s.activeChannelId);
  const user = useAppStore((s) => s.user);
  const error = useAppStore((s) => s.error);
  const setError = useAppStore((s) => s.setError);
  const createWorkspace = useAppStore((s) => s.createWorkspace);
  const usersById = useAppStore((s) => s.usersById);
  const clearMessages = useAppStore((s) => s.clearMessages);

  const isPopout = typeof window !== "undefined" && window.location.search.includes("popout=true");

  // Auth guard — this route is client-rendered and token-gated
  useEffect(() => {
    if (!tokens.access) {
      router.replace("/login");
    }
  }, [router]);

  useEffect(() => {
    if (authed && !bootstrapped) bootstrap();
  }, [authed, bootstrapped, bootstrap]);

  useRealtime(authed && bootstrapped);

  const activeChannel = channels.find((c) => c.id === activeChannelId) ?? null;
  const userName = user?.display_name || user?.username || "Harshavardhan Chatte";
  const userInitials = userName.slice(0, 2).toUpperCase();

  let chatTitle = activeChannel ? activeChannel.name : `${userName} (You)`;
  let chatInitials = userInitials;
  
  if (activeChannel && activeChannel.type === "dm") {
    // Exact format: 'dm-UUID1-UUID2' (76 chars total after dm-)
    const nameWithoutDm = activeChannel.name.replace("dm-", "");
    const uuid1 = nameWithoutDm.substring(0, 36);
    const uuid2 = nameWithoutDm.substring(37, 73);
    const partnerId = uuid1 === user?.id ? uuid2 : uuid1;
    
    const partner = usersById[partnerId];
    if (partner) {
      chatTitle = partner.display_name || partner.username;
      chatInitials = chatTitle.slice(0, 2).toUpperCase();
    } else {
      chatTitle = "Direct Message";
      chatInitials = "DM";
    }
  }

  if (!authed || !bootstrapped) {
    return (
      <CenteredNotice
        emoji="⚡"
        title="Loading MicroproTeams"
        body="Fetching conversations and channels…"
      />
    );
  }

  if (!workspace) {
    return (
      <>
        <CenteredNotice
          emoji="🏢"
          title="No workspace yet"
          body="Create a workspace to start organising your team's channels and conversations."
          action={
            <button className="btn btn-primary" onClick={() => setModal("workspace")}>
              Create a workspace
            </button>
          }
        />
        {modal === "workspace" && (
          <CreateModal
            title="Create a workspace"
            label="Workspace name"
            placeholder="Acme Inc."
            submitLabel="Create workspace"
            description="This is the home for your team's channels, files and meetings."
            onSubmit={(name) => createWorkspace(name)}
            onClose={() => setModal(null)}
          />
        )}
      </>
    );
  }

  return (
    <div className="teams-app-shell">
      {/* Leftmost Vertical Icon Rail */}
      {!isPopout && <AppRail activeTab="chat" />}

      {/* Main Workspace Layout */}
      <div className="teams-main-wrapper">
        {/* Top Header Bar with Search & Profile Dropdown */}
        {!isPopout && <TopHeader />}

        {/* Content Split: Sidebar + Active Chat View */}
        <div className="teams-body-layout">
          {/* Chat Navigation Sidebar */}
          {!isPopout && <Sidebar />}

          {/* Main Active Chat Area */}
          <main className="teams-chat-main">
            {/* Header of Active Chat */}
            <header className="teams-chat-header">
              <div className="chat-header-title-box">
                <div className="header-avatar-box">
                  <span>{chatInitials}</span>
                  <span className="presence-green-dot" />
                </div>
                <div className="header-title-text">
                  <span className="title-main">{chatTitle}</span>
                </div>
              </div>

              <div className="chat-header-actions">
                <button className="teams-header-btn" title="Search in chat">
                  <Search size={16} />
                </button>
                <button
                  className="teams-header-btn"
                  title="Start audio call"
                  onClick={() => router.push(`/meeting/${activeChannel?.id || Date.now()}?audio=true`)}
                >
                  <Phone size={16} />
                </button>
                <button
                  className="teams-header-btn"
                  title="Start video call"
                  onClick={() => router.push(`/meeting/${activeChannel?.id || Date.now()}`)}
                >
                  <Video size={16} />
                </button>
                <button
                  className="teams-header-btn"
                  title="Pop out chat"
                  onClick={() => window.open(`/workspace?popout=true`, "_blank", "width=800,height=600")}
                >
                  <ExternalLink size={16} />
                </button>
                <button
                  className="teams-header-btn"
                  title="Clear chat"
                  onClick={() => {
                    if (activeChannel?.id && confirm("Are you sure you want to clear this chat for everyone?")) {
                      clearMessages(activeChannel.id);
                    }
                  }}
                >
                  <Trash2 size={16} />
                </button>
              </div>
            </header>

            {/* Chat Body & Input */}
            <div className="teams-chat-body">
              <MessageList />
              <TypingIndicator />
              <Composer />
            </div>
          </main>
        </div>
      </div>



      {error && (
        <div
          role="alert"
          className="card"
          style={{
            position: "fixed",
            bottom: 20,
            right: 20,
            maxWidth: 360,
            borderColor: "hsl(var(--color-danger) / 0.5)",
            zIndex: 200,
          }}
        >
          <div style={{ display: "flex", alignItems: "flex-start", gap: 10 }}>
            <span style={{ fontSize: 16 }}>⚠</span>
            <p style={{ fontSize: 13, flex: 1, lineHeight: 1.55 }}>{error}</p>
            <button
              className="action-btn"
              style={{ width: 22, height: 22 }}
              onClick={() => setError(null)}
              aria-label="Dismiss error"
            >
              ✕
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
