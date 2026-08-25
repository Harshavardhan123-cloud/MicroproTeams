/**
 * Socket.io client singleton.
 *
 * The backend mounts the Socket.io ASGI app at /ws with socketio_path
 * "socket.io", so the handshake URL is <host>/ws/socket.io.
 */
import { io, type Socket } from "socket.io-client";
import { tokens } from "./api";

const WS_URL = process.env.NEXT_PUBLIC_WS_URL || "http://localhost:8001";

let socket: Socket | null = null;

export function getSocket(): Socket | null {
  const token = tokens.access;
  if (!token) {
    if (socket) {
      socket.disconnect();
      socket = null;
    }
    return null;
  }

  if (!socket) {
    socket = io(WS_URL, {
      path: "/socket.io",
      transports: ["websocket", "polling"],
      auth: { token },
      reconnection: true,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 5000,
    });
  } else {
    const currentAuthToken =
      typeof socket.auth === "object" && socket.auth !== null
        ? (socket.auth as { token?: string }).token
        : null;

    if (currentAuthToken !== token) {
      socket.auth = { token };
      if (socket.connected) {
        socket.disconnect();
      }
      socket.connect();
    }
  }
  return socket;
}

/** Re-auth with the current token — call after a token refresh. */
export function refreshSocketAuth() {
  if (!socket) return;
  const token = tokens.access;
  if (!token) return;
  socket.auth = { token };
  if (socket.connected) socket.disconnect();
  socket.connect();
}

export function disconnectSocket() {
  if (socket) {
    socket.disconnect();
    socket = null;
  }
}
