"use client";

import { useEffect, useRef } from "react";
import { format, isSameDay } from "date-fns";
import { SmilePlus, Trash2, CheckCheck, Lock, Bookmark, Shield } from "lucide-react";
import { useAppStore } from "@/store/useAppStore";
import type { Message } from "@/lib/types";

function DateDivider({ date }: { date: Date }) {
  const safeDate = isNaN(date.getTime()) ? new Date() : date;
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        margin: "16px 0 10px",
      }}
    >
      <span
        style={{
          fontSize: 11.5,
          color: "#8696a0",
          backgroundColor: "#182229",
          padding: "4px 12px",
          borderRadius: 8,
          boxShadow: "0 1px 2px rgba(0,0,0,0.2)",
          fontWeight: 500,
        }}
      >
        {format(safeDate, "MMMM d, yyyy")}
      </span>
    </div>
  );
}

const EMPTY_ARRAY: Message[] = [];

export default function MessageList() {
  const activeChannelId = useAppStore((s) => s.activeChannelId);
  const channels = useAppStore((s) => s.channels);
  const messages = useAppStore((s) =>
    activeChannelId ? (s.messagesByChannel[activeChannelId] ?? EMPTY_ARRAY) : EMPTY_ARRAY,
  );
  const usersById = useAppStore((s) => s.usersById);
  const currentUser = useAppStore((s) => s.user);
  const loading = useAppStore((s) => s.loadingMessages);

  const bottomRef = useRef<HTMLDivElement>(null);

  const activeChannel = channels.find((c) => c.id === activeChannelId);
  const isDM = activeChannel && (activeChannel.type === "dm" || activeChannel.type === "group_dm");
  const isSelf =
    activeChannel &&
    (activeChannel.name === "personal-space" ||
      (activeChannel.type === "dm" &&
        activeChannel.member_ids?.length === 1 &&
        activeChannel.member_ids[0] === currentUser?.id));

  // Stick to the newest message as the conversation grows
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages.length, activeChannelId]);

  if (loading) {
    return (
      <div
        className="message-list"
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          height: "100%",
          backgroundColor: "#0b141a",
        }}
      >
        <p style={{ color: "#8696a0", fontSize: 13 }}>Loading conversation…</p>
      </div>
    );
  }

  if (messages.length === 0) {
    const targetUserId = activeChannel?.member_ids?.find((id) => id !== currentUser?.id);
    const targetUser = targetUserId ? usersById[targetUserId] : null;
    const targetName = targetUser?.display_name || activeChannel?.name || "Member";

    return (
      <div
        className="message-list"
        style={{
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          height: "100%",
          backgroundColor: "#0b141a",
          padding: 24,
        }}
      >
        <div
          style={{
            textAlign: "center",
            maxWidth: 380,
            backgroundColor: "#182229",
            borderRadius: 12,
            padding: "24px 20px",
            border: "1px solid #222e35",
            boxShadow: "0 4px 16px rgba(0,0,0,0.3)",
          }}
        >
          <div
            style={{
              width: 48,
              height: 48,
              borderRadius: "50%",
              backgroundColor: isSelf ? "rgba(0, 168, 132, 0.15)" : "rgba(99, 102, 241, 0.15)",
              color: isSelf ? "#00a884" : "#818cf8",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              margin: "0 auto 12px",
            }}
          >
            {isSelf ? <Bookmark size={24} /> : <Lock size={22} />}
          </div>

          <h3 style={{ fontSize: 16, fontWeight: 600, color: "#e9edef", marginBottom: 6 }}>
            {isSelf ? "Personal Space (You)" : `Chat with ${targetName}`}
          </h3>

          <p style={{ fontSize: 12.5, color: "#8696a0", lineHeight: 1.5, margin: "0 0 12px" }}>
            {isSelf
              ? "Send messages and notes to yourself. Drafts and personal files stay private in this chat."
              : `This is a private direct message. Messages exchanged here are only visible to you and ${targetName}.`}
          </p>

          <div
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 6,
              fontSize: 11,
              color: "#ffd279",
              backgroundColor: "rgba(255, 210, 121, 0.08)",
              padding: "4px 10px",
              borderRadius: 12,
            }}
          >
            <Shield size={12} />
            <span>Private & Restricted Access</span>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div
      className="message-list"
      style={{
        backgroundColor: "#0b141a",
        flex: 1,
        overflowY: "auto",
        padding: "12px 20px",
        display: "flex",
        flexDirection: "column",
        gap: 4,
      }}
    >
      {/* Privacy Header Badge in Chat */}
      <div style={{ textAlign: "center", margin: "4px 0 10px" }}>
        <span
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 6,
            fontSize: 11,
            color: "#ffd279",
            backgroundColor: "#182229",
            padding: "4px 12px",
            borderRadius: 8,
            boxShadow: "0 1px 2px rgba(0,0,0,0.2)",
          }}
        >
          <Lock size={11} />
          Messages in this chat are private and accessible only to participants.
        </span>
      </div>

      {messages.map((message: Message, i: number) => {
        const prev = i > 0 ? messages[i - 1] : null;
        const createdRaw = message?.created_at ? new Date(message.created_at) : new Date();
        const created = isNaN(createdRaw.getTime()) ? new Date() : createdRaw;

        const prevCreatedRaw = prev?.created_at ? new Date(prev.created_at) : null;
        const prevCreated = prevCreatedRaw && !isNaN(prevCreatedRaw.getTime()) ? prevCreatedRaw : null;

        const showDivider = !prevCreated || !isSameDay(created, prevCreated);
        const author = usersById[message.author_id];
        const authorName = author?.display_name ?? "Member";
        const isMine = message.author_id === currentUser?.id;

        return (
          <div key={message.id} style={{ display: "flex", flexDirection: "column" }}>
            {showDivider && <DateDivider date={created} />}

            {/* WhatsApp Speech Bubble */}
            <div
              style={{
                display: "flex",
                justifyContent: isMine ? "flex-end" : "flex-start",
                margin: "2px 0",
                position: "relative",
              }}
              className="whatsapp-message-row"
            >
              <div
                style={{
                  maxWidth: "70%",
                  minWidth: 80,
                  backgroundColor: isMine ? "#005c4b" : "#202c33",
                  color: "#e9edef",
                  padding: "6px 9px 6px 10px",
                  borderRadius: isMine ? "8px 8px 2px 8px" : "8px 8px 8px 2px",
                  boxShadow: "0 1px 1.5px rgba(0,0,0,0.3)",
                  position: "relative",
                  wordBreak: "break-word",
                  fontSize: 13.5,
                  lineHeight: 1.45,
                }}
              >
                {/* Author Name for Group Messages if not mine */}
                {!isMine && activeChannel?.type === "group_dm" && (
                  <div
                    style={{
                      fontSize: 11.5,
                      fontWeight: 600,
                      color: "#53bdeb",
                      marginBottom: 2,
                    }}
                  >
                    {authorName}
                  </div>
                )}

                {/* Message Content */}
                <div style={{ paddingRight: 45, whiteSpace: "pre-wrap" }}>
                  {message.content}
                </div>

                {/* Timestamp & Delivery Status on bottom right */}
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 3,
                    position: "absolute",
                    bottom: 4,
                    right: 7,
                    fontSize: 10.5,
                    color: isMine ? "#8696a0" : "#8696a0",
                  }}
                >
                  <span>{format(created, "h:mm a")}</span>
                  {isMine && <CheckCheck size={14} color="#53bdeb" />}
                </div>
              </div>
            </div>
          </div>
        );
      })}
      <div ref={bottomRef} />
    </div>
  );
}
