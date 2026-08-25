/**
 * Global app state (zustand).
 *
 * Holds the bootstrapped session: current user, workspace, channel list,
 * per-channel message cache, presence map and typing indicators.
 */
import { create } from "zustand";
import { api, tokens } from "@/lib/api";
import type {
  Channel,
  Message,
  MessageBroadcast,
  PresenceStatus,
  User,
  Workspace,
} from "@/lib/types";

interface AppState {
  // Session
  user: User | null;
  workspace: Workspace | null;
  workspaces: Workspace[];

  // Channels
  channels: Channel[];
  activeChannelId: string | null;
  users: User[];

  // Data caches
  messagesByChannel: Record<string, Message[]>;
  usersById: Record<string, User>;
  presence: Record<string, PresenceStatus>;
  typingByChannel: Record<string, string[]>;

  // UI
  bootstrapped: boolean;
  loadingMessages: boolean;
  error: string | null;

  // Actions
  bootstrap: () => Promise<void>;
  selectChannel: (channelId: string) => Promise<void>;
  selectSelfChat: () => Promise<void>;
  sendMessage: (content: string) => Promise<Message | null>;
  createWorkspace: (name: string) => Promise<Workspace | null>;
  createChannel: (name: string, description?: string) => Promise<Channel | null>;
  openDM: (targetUserId: string) => Promise<void>;
  receiveMessage: (payload: MessageBroadcast) => void;
  setPresence: (userId: string, status: PresenceStatus) => void;
  updateUserPresence: (status: PresenceStatus) => void;
  updateCustomStatus: (statusMessage: string) => void;
  setTyping: (channelId: string, userId: string, isTyping: boolean) => void;
  setError: (error: string | null) => void;
  reset: () => void;
}

const slugify = (name: string) =>
  name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 50) || "workspace";

const LAST_CHANNEL_KEY = "last_channel_id";

export const useAppStore = create<AppState>((set, get) => ({
  user: null,
  workspace: null,
  workspaces: [],
  channels: [],
  activeChannelId: null,
  users: [],
  messagesByChannel: {},
  usersById: {},
  presence: {},
  typingByChannel: {},
  bootstrapped: false,
  loadingMessages: false,
  error: null,

  async bootstrap() {
    try {
      const user = await api.auth.me();
      const usersList = await api.users.search();
      
      set({ 
        user, 
        users: usersList.filter(u => u.id !== user.id),
        usersById: Object.fromEntries(usersList.map(u => [u.id, u])) 
      });

      const workspaces = await api.workspaces.list();
      set({ workspaces });

      const workspace = workspaces[0] ?? null;
      set({ workspace });

      if (workspace) {
        const channels = await api.channels.list(workspace.id);
        set({ channels });

        // Restore the last-viewed channel when it still exists
        const remembered =
          typeof window !== "undefined"
            ? localStorage.getItem(LAST_CHANNEL_KEY)
            : null;
        const target =
          channels.find((c) => c.id === remembered) ?? channels[0] ?? null;
        if (target) await get().selectChannel(target.id);
      }

      set({ bootstrapped: true });
    } catch (err) {
      set({
        bootstrapped: true,
        error: err instanceof Error ? err.message : "Failed to load workspace",
      });
    }
  },

  async selectChannel(channelId) {
    set({ activeChannelId: channelId, loadingMessages: true });
    if (typeof window !== "undefined") {
      localStorage.setItem(LAST_CHANNEL_KEY, channelId);
    }

    try {
      const [messages, members] = await Promise.all([
        api.messages.list(channelId),
        api.channels.members(channelId),
      ]);

      set((state) => ({
        messagesByChannel: { ...state.messagesByChannel, [channelId]: messages },
        usersById: {
          ...state.usersById,
          ...Object.fromEntries(members.map((m) => [m.id, m])),
        },
        loadingMessages: false,
      }));
    } catch (err) {
      set({
        loadingMessages: false,
        error: err instanceof Error ? err.message : "Failed to load messages",
      });
    }
  },

  async sendMessage(content) {
    const { activeChannelId } = get();
    if (!activeChannelId || !content.trim()) return null;

    try {
      const message = await api.messages.send({
        channel_id: activeChannelId,
        content: content.trim(),
      });
      set((state) => ({
        messagesByChannel: {
          ...state.messagesByChannel,
          [activeChannelId]: [
            ...(state.messagesByChannel[activeChannelId] ?? []),
            message,
          ],
        },
      }));
      const { getSocket } = await import("@/lib/socket");
      const socket = getSocket();
      if (socket) {
        socket.emit("message:send", message);
      }
      return message;
    } catch (err) {
      set({ error: err instanceof Error ? err.message : "Failed to send message" });
      return null;
    }
  },

  async createWorkspace(name) {
    try {
      const workspace = await api.workspaces.create({
        name,
        slug: `${slugify(name)}-${Math.random().toString(36).slice(2, 7)}`,
      });
      set((state) => ({
        workspaces: [...state.workspaces, workspace],
        workspace,
        channels: [],
      }));
      return workspace;
    } catch (err) {
      set({ error: err instanceof Error ? err.message : "Failed to create workspace" });
      return null;
    }
  },

  async createChannel(name, description) {
    const { workspace } = get();
    if (!workspace) return null;

    try {
      const channel = await api.channels.create({
        workspace_id: workspace.id,
        name: name.trim(),
        description,
      });
      set((state) => ({ channels: [...state.channels, channel] }));
      await get().selectChannel(channel.id);
      return channel;
    } catch (err) {
      set({ error: err instanceof Error ? err.message : "Failed to create channel" });
      return null;
    }
  },

  async openDM(targetUserId) {
    const { workspace } = get();
    if (!workspace) return;

    try {
      const channel = await api.channels.createDM({
        workspace_id: workspace.id,
        target_user_id: targetUserId,
      });
      // Ensure the channel is in the list
      const channels = get().channels;
      if (!channels.find((c) => c.id === channel.id)) {
        set({ channels: [...channels, channel] });
      }
      await get().selectChannel(channel.id);
    } catch (err) {
      set({ error: err instanceof Error ? err.message : "Failed to open chat" });
    }
  },

  receiveMessage(payload) {
    const channel_id = payload.channel_id;
    set((state) => {
      const existing = state.messagesByChannel[channel_id] ?? [];
      // The sender already appended optimistically from the POST response
      if (existing.some((m) => m.id === payload.id)) return state;

      return {
        messagesByChannel: {
          ...state.messagesByChannel,
          [channel_id]: [...existing, payload],
        },
      };
    });
  },

  setPresence(userId, status) {
    set((state) => ({ presence: { ...state.presence, [userId]: status } }));
  },

  updateUserPresence(status) {
    const { user } = get();
    if (user) {
      set((state) => ({
        user: { ...user, presence_status: status },
        presence: { ...state.presence, [user.id]: status },
      }));
    }
  },

  updateCustomStatus(statusMessage) {
    const { user } = get();
    if (user) {
      set({
        user: { ...user, custom_status: statusMessage },
      });
    }
  },

  async selectSelfChat() {
    const { channels, createChannel, selectChannel } = get();
    let selfChannel = channels.find(
      (c) => c.name === "personal-space" || c.name === "notes-to-self"
    );
    if (!selfChannel) {
      const created = await createChannel("personal-space", "Personal space for drafts and notes");
      if (created) selfChannel = created;
    }
    if (selfChannel) {
      await selectChannel(selfChannel.id);
    }
  },

  setTyping(channelId, userId, isTyping) {
    set((state) => {
      const current = state.typingByChannel[channelId] ?? [];
      const next = isTyping
        ? current.includes(userId)
          ? current
          : [...current, userId]
        : current.filter((id) => id !== userId);
      if (next === current) return state;
      return {
        typingByChannel: { ...state.typingByChannel, [channelId]: next },
      };
    });
  },

  setError(error) {
    set({ error });
  },

  reset() {
    tokens.clear();
    set({
      user: null,
      workspace: null,
      workspaces: [],
      channels: [],
      activeChannelId: null,
      messagesByChannel: {},
      usersById: {},
      presence: {},
      typingByChannel: {},
      bootstrapped: false,
      error: null,
    });
  },
}));
