"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Search, Video, Edit3, MoreHorizontal } from "lucide-react";

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
  const createChannel = useAppStore((s) => s.createChannel);
  const createWorkspace = useAppStore((s) => s.createWorkspace);

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
      <AppRail activeTab="chat" />

      {/* Main Workspace Layout */}
      <div className="teams-main-wrapper">
        {/* Top Header Bar with Search & Profile Dropdown */}
        <TopHeader />

        {/* Content Split: Sidebar + Active Chat View */}
        <div className="teams-body-layout">
          {/* Chat & Channels Navigation Sidebar */}
          <Sidebar onCreateChannel={() => setModal("channel")} />

          {/* Main Active Chat Area */}
          <main className="teams-chat-main">
            {/* Header of Active Chat */}
            <header className="teams-chat-header">
              <div className="chat-header-title-box">
                <div className="header-avatar-box">
                  <span>{userInitials}</span>
                  <span className="presence-green-dot" />
                </div>
                <div className="header-title-text">
                  <span className="title-main">{activeChannel ? activeChannel.name : `${userName} (You)`}</span>
                </div>
              </div>

              <div className="chat-header-actions">
                <button className="teams-header-btn" title="Search in chat">
                  <Search size={16} />
                </button>
                <button
                  className="teams-header-btn"
                  title="Start video call"
                  onClick={() => router.push(`/meeting/${Date.now()}`)}
                >
                  <Video size={16} />
                </button>
                <button className="teams-header-btn" title="Pop out chat">
                  <Edit3 size={16} />
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

      {modal === "channel" && (
        <CreateModal
          title="Create a channel"
          label="Channel name"
          placeholder="engineering"
          submitLabel="Create channel"
          description="Channels are where your team communicates. They work best organised around a topic."
          onSubmit={(name) => createChannel(name)}
          onClose={() => setModal(null)}
        />
      )}

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
