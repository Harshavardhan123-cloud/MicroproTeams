"use client";

import { useEffect } from "react";
import { useAppStore } from "@/store/useAppStore";
import { disconnectSocket, getSocket } from "@/lib/socket";
import type {
  MessageBroadcast,
  PresenceChange,
  TypingUpdate,
} from "@/lib/types";

/**
 * Connects the Socket.io client and funnels server events into the store.
 * Also joins/leaves the active channel room as the selection changes.
 */
export function useRealtime(enabled: boolean) {
  const activeChannelId = useAppStore((s) => s.activeChannelId);

  // Connect once and subscribe to the global event stream
  useEffect(() => {
    if (!enabled) return;
    const socket = getSocket();
    if (!socket) return;

    const { receiveMessage, setTyping, setPresence } = useAppStore.getState();

    const onMessage = (payload: MessageBroadcast) => receiveMessage(payload);
    const onTyping = (p: TypingUpdate) =>
      setTyping(p.channel_id, p.user_id, p.is_typing);
    const onPresence = (p: PresenceChange) => setPresence(p.user_id, p.status);
    const onError = (err: Error) => {
      if (
        err.message?.includes("rejected") ||
        err.message?.includes("Unauthorized") ||
        err.message?.includes("authenticated")
      ) {
        import("@/lib/api").then(({ tokens }) => {
          tokens.clear();
          if (typeof window !== "undefined") {
            window.location.href = "/login";
          }
        });
      }
    };

    socket.on("message:new", onMessage);
    socket.on("typing:update", onTyping);
    socket.on("presence:change", onPresence);
    socket.on("connect_error", onError);

    return () => {
      socket.off("message:new", onMessage);
      socket.off("typing:update", onTyping);
      socket.off("presence:change", onPresence);
      socket.off("connect_error", onError);
    };
  }, [enabled]);

  // Tear the connection down when the app unmounts (e.g. sign-out)
  useEffect(() => {
    return () => disconnectSocket();
  }, []);

  // Follow the active channel's room membership
  useEffect(() => {
    if (!enabled || !activeChannelId) return;
    const socket = getSocket();
    if (!socket) return;

    socket.emit("channel:join", { channel_id: activeChannelId });
    return () => {
      socket.emit("channel:leave", { channel_id: activeChannelId });
    };
  }, [enabled, activeChannelId]);
}
