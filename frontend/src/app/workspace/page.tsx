"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Search, Video, Edit3, MoreHorizontal, Users } from "lucide-react";

import AppRail from "@/components/AppRail";
import TopHeader from "@/components/TopHeader";
import Sidebar from "@/components/Sidebar";
import MessageList from "@/components/MessageList";
import Composer from "@/components/Composer";
import TypingIndicator from "@/components/TypingIndicator";
import CreateModal from "@/components/CreateModal";
import NewChatModal from "@/components/NewChatModal";
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
  const [authed, setAuthed] = useState(false);
  const [modal, setModal] = useState<ModalKind>(null);

  const bootstrap = useAppStore((s) => s.bootstrap);
  const bootstrapped = useAppStore((s) => s.bootstrapped);
  const workspace = useAppStore((s) => s.workspace);
  const channels = useAppStore((s) => s.channels);
  const activeChannelId = useAppStore((s) => s.activeChannelId);
  const user = useAppStore((s) => s.user);
  const usersById = useAppStore((s) => s.usersById);
  const error = useAppStore((s) => s.error);
  const setError = useAppStore((s) => s.setError);
  const createChannel = useAppStore((s) => s.createChannel);
  const createWorkspace = useAppStore((s) => s.createWorkspace);

  // Auth guard — this route is client-rendered and token-gated
  useEffect(() => {
    if (!tokens.access) {
      router.replace("/login");
      return;
    }
    setAuthed(true);
  }, [router]);

  useEffect(() => {
    if (authed && !bootstrapped) bootstrap();
  }, [authed, bootstrapped, bootstrap]);

  useRealtime(authed && bootstrapped);

  const activeChannel = channels.find((c) => c.id === activeChannelId) ?? null;
  const userName = user?.display_name || user?.username || "User";
  const userInitials = userName.slice(0, 2).toUpperCase();

  // Compute display name, avatar, and subtitle for the active channel header
  const isDMChannel = activeChannel && (activeChannel.type === "dm" || activeChannel.type === "group_dm");
  const isGroupDM = activeChannel?.type === "group_dm";
  const isSelfChat =
    (activeChannel &&
      (activeChannel.name === "personal-space" ||
        (activeChannel.type === "dm" &&
          activeChannel.member_ids?.length === 1 &&
          activeChannel.member_ids[0] === user?.id))) ||
    !activeChannel;

  let headerTitle = `${userName} (You)`;
  let headerInitials = userInitials;
  let headerSubtitle = "Personal space (Message yourself)";

  if (activeChannel) {
    if (isDMChannel && activeChannel.member_ids && user) {
      const otherIds = activeChannel.member_ids.filter((id) => id !== user.id);
      if (isSelfChat) {
        headerTitle = `${userName} (You)`;
        headerInitials = userInitials;
        headerSubtitle = "Personal space (Message yourself)";
      } else if (otherIds.length === 1) {
        const other = usersById[otherIds[0]];
        headerTitle = other?.display_name || activeChannel.name;
        headerInitials = (other?.display_name || "??").slice(0, 2).toUpperCase();
        const presence = other?.presence_status || "online";
        headerSubtitle = presence === "online" ? "online" : other?.email || "offline";
      } else {
        const names = otherIds.map((id) => usersById[id]?.display_name).filter(Boolean);
        headerTitle = names.length > 0 ? names.join(", ") : activeChannel.name;
        headerInitials = `${activeChannel.member_ids.length}`;
        headerSubtitle = `${activeChannel.member_ids.length} members`;
      }
    } else {
      headerTitle = activeChannel.name;
      headerSubtitle = `${activeChannel.type} channel`;
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
      <AppRail activeTab="chat" />

      {/* Main Workspace Layout */}
      <div className="teams-main-wrapper">
        {/* Top Header Bar with Search & Profile Dropdown */}
        <TopHeader />

        {/* Content Split: Sidebar + Active Chat View */}
        <div className="teams-body-layout">
          {/* Chat & Contacts Navigation Sidebar */}
          <Sidebar />

          {/* Main Active Chat Area */}
          <main className="teams-chat-main" style={{ backgroundColor: "#0b141a" }}>
            {/* Header of Active Chat */}
            <header
              className="teams-chat-header"
              style={{
                height: 60,
                backgroundColor: "#202c33",
                borderBottom: "1px solid #222e35",
                padding: "10px 20px",
              }}
            >
              <div className="chat-header-title-box" style={{ gap: 12 }}>
                <div
                  className="header-avatar-box"
                  style={{
                    width: 38,
                    height: 38,
                    borderRadius: "50%",
                    background: isSelfChat
                      ? "linear-gradient(135deg, #25d366, #128c7e)"
                      : isGroupDM
                        ? "linear-gradient(135deg, #00a884, #008069)"
                        : "linear-gradient(135deg, #6366f1, #8b5cf6)",
                    color: "#fff",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    fontSize: 14,
                    fontWeight: 700,
                  }}
                >
                  {isGroupDM ? <Users size={18} /> : <span>{headerInitials}</span>}
                  {!isGroupDM && !isSelfChat && <span className="presence-green-dot" />}
                </div>
                <div className="header-title-text">
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <span className="title-main" style={{ fontSize: 15, fontWeight: 600, color: "#e9edef" }}>
                      {headerTitle}
                    </span>
                  </div>
                  <span style={{ fontSize: 11.5, color: headerSubtitle === "online" ? "#00a884" : "#8696a0" }}>
                    {headerSubtitle}
                  </span>
                </div>
              </div>

              <div className="chat-header-actions" style={{ gap: 8 }}>
                <button
                  className="teams-header-btn"
                  title="Start video call"
                  onClick={() => router.push(`/meeting/${Date.now()}`)}
                  style={{ color: "#aebac1" }}
                >
                  <Video size={18} />
                </button>
              </div>
            </header>

            {/* Chat Body & Input */}
            <div className="teams-chat-body" style={{ backgroundColor: "#0b141a" }}>
              <MessageList />
              <TypingIndicator />
              <Composer />
            </div>
          </main>
        </div>
      </div>

      {modal === "channel" && (
        <NewChatModal onClose={() => setModal(null)} />
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
