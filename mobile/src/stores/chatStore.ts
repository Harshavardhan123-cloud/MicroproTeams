import { apiClient, getMediaUrl } from '../api/client';
import { wsService } from '../services/websocketService';
import { authStore } from './authStore';

export interface MessageReaction {
  id: string;
  emoji: string;
  user_id: string;
  user_name?: string;
}

// Metadata describing a file that has already been uploaded via
// fileUploadService.pickAndUploadFile() / POST /files/upload.
export interface UploadedAttachment {
  id?: string;
  name: string;
  url: string;
  mime_type?: string;
  size?: number;
}

export interface ChatMessage {
  id: string;
  conversation_id?: string;
  channel_id?: string;
  sender_id: string;
  sender_name: string;
  sender_avatar?: string;
  content: string;
  created_at: string;
  is_outgoing?: boolean;
  // Thread / reply support
  parent_message_id?: string;
  reply_count?: number;
  // Reactions, edit & delete state
  reactions?: MessageReaction[];
  is_edited?: boolean;
  is_deleted?: boolean;
}

export interface DirectConversationItem {
  id: string;
  title?: string;
  is_group?: boolean;
  recipient?: {
    id: string;
    display_name: string;
    username: string;
    avatar_url?: string;
    presence?: string;
  };
  lastMessage?: string;
  lastMessageTime?: string;
  unreadCount?: number;
  updated_at?: string;
}

interface ChatStoreState {
  conversations: DirectConversationItem[];
  activeConversation: DirectConversationItem | null;
  messages: ChatMessage[];
  isLoading: boolean;
  isSending: boolean;

  // Channel chat state
  activeChannelId: string | null;
  channelMessages: ChatMessage[];
  isChannelLoading: boolean;
}

type Listener = () => void;

// Builds the exact `[Attachment: name](url)` tag convention (byte-for-byte
// compatible with the web frontend) used to embed uploaded files into a
// message's plain-text content, so either client can parse the other's
// messages identically.
function buildContentWithAttachments(text: string, attachments?: UploadedAttachment[]): string {
  const clean = (text || '').trim();
  if (!attachments || attachments.length === 0) return clean;

  const attachmentText = attachments
    .map((a) => `[Attachment: ${a.name}](${getMediaUrl(a.url)})`)
    .join('\n');

  return clean ? `${clean}\n\n${attachmentText}` : attachmentText;
}

function mapReactions(raw: any): MessageReaction[] {
  if (!Array.isArray(raw)) return [];
  return raw.map((r: any) => ({
    id: r.id || `${r.emoji}-${r.user_id}`,
    emoji: r.emoji,
    user_id: r.user_id || r.sender_id,
    user_name: r.user_name,
  }));
}

class ChatStore {
  private state: ChatStoreState = {
    conversations: [],
    activeConversation: null,
    messages: [],
    isLoading: false,
    isSending: false,
    activeChannelId: null,
    channelMessages: [],
    isChannelLoading: false,
  };

  private listeners: Set<Listener> = new Set();

  constructor() {
    this.setupWebSocketListeners();
  }

  getState(): ChatStoreState {
    return { ...this.state };
  }

  subscribe(listener: Listener) {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  private notify() {
    this.listeners.forEach((l) => l());
  }

  // Normalizes a raw backend message payload into our local ChatMessage shape.
  // Shared by fetchChannelMessages, selectConversation and fetchThreadReplies.
  private mapRawMessage(m: any, currentUserId?: string): ChatMessage {
    return {
      id: m.id || `msg-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      conversation_id: m.conversation_id || undefined,
      channel_id: m.channel_id || undefined,
      sender_id: m.sender_id || m.user_id,
      sender_name: m.sender?.display_name || m.sender_name || m.username || 'Member',
      sender_avatar: m.sender?.avatar_url || m.sender_avatar || m.avatar_url,
      content: m.content || '',
      created_at: m.created_at || new Date().toISOString(),
      is_outgoing: (m.sender_id || m.user_id) === currentUserId,
      parent_message_id: m.parent_message_id || undefined,
      reply_count: m.replies_count ?? m.reply_count ?? 0,
      reactions: mapReactions(m.reactions),
      is_edited: !!m.is_edited,
    };
  }

  private setupWebSocketListeners() {
    wsService.on((data: any) => {
      const type = data.type;
      const currentUser = authStore.getState().user;

      // Real Direct Message received
      if (
        type === 'direct_message.new' ||
        type === 'chat_message' ||
        type === 'message.new' ||
        type === 'message'
      ) {
        const msg = data.message || data;
        const convId = msg.conversation_id || data.conversation_id;
        const channelId = msg.channel_id || data.channel_id;

        const incoming: ChatMessage = {
          id: msg.id || `msg-${Date.now()}`,
          conversation_id: convId,
          channel_id: channelId,
          sender_id: msg.sender_id || msg.user_id || 'remote',
          sender_name: msg.sender_name || msg.username || 'Colleague',
          sender_avatar: msg.sender_avatar || msg.avatar_url,
          content: msg.content || msg.text || '',
          created_at: msg.created_at || new Date().toISOString(),
          is_outgoing: (msg.sender_id || msg.user_id) === currentUser?.id,
          parent_message_id: msg.parent_message_id || undefined,
          reply_count: msg.replies_count ?? msg.reply_count ?? 0,
          reactions: mapReactions(msg.reactions),
          is_edited: !!msg.is_edited,
        };

        // If it's a DM for active DM conversation
        if (this.state.activeConversation && convId === this.state.activeConversation.id) {
          // Avoid duplicate by ID
          if (!this.state.messages.some((m) => m.id === incoming.id)) {
            this.state.messages = [...this.state.messages, incoming];
            this.notify();
          }
        }

        // If it's a Channel message for active Channel
        if (this.state.activeChannelId && channelId === this.state.activeChannelId) {
          if (!this.state.channelMessages.some((m) => m.id === incoming.id)) {
            this.state.channelMessages = [...this.state.channelMessages, incoming];
            this.notify();
          }
        }

        // Update DM preview list
        if (convId) {
          this.state.conversations = this.state.conversations.map((c) => {
            if (c.id === convId) {
              return {
                ...c,
                lastMessage: incoming.content,
                lastMessageTime: new Date(incoming.created_at).toLocaleTimeString([], {
                  hour: '2-digit',
                  minute: '2-digit',
                }),
                unreadCount:
                  c.id === this.state.activeConversation?.id
                    ? 0
                    : (c.unreadCount || 0) + (incoming.is_outgoing ? 0 : 1),
              };
            }
            return c;
          });
          this.notify();
        }
      }
    });
  }

  // -------------------------------------------------------------
  // Direct Conversations
  // -------------------------------------------------------------

  async fetchConversations() {
    this.state.isLoading = true;
    this.notify();

    try {
      const res = await apiClient.get('/direct-conversations');
      const data = Array.isArray(res.data) ? res.data : res.data.data || [];
      const current = authStore.getState().user;

      const formatted: DirectConversationItem[] = data.map((c: any) => {
        // Find other member
        const other = c.members?.find((m: any) => m.id !== current?.id) || c.members?.[0];
        const lastMsgObj = c.last_message;
        const lastText = typeof lastMsgObj === 'object' ? lastMsgObj?.content : lastMsgObj;

        return {
          id: c.id,
          title: c.title,
          is_group: c.is_group,
          recipient: other
            ? {
                id: other.id,
                display_name: other.display_name || other.username || 'Colleague',
                username: other.username,
                avatar_url: other.avatar_url,
                presence: other.presence || 'offline',
              }
            : undefined,
          lastMessage: lastText || 'No messages yet',
          lastMessageTime: c.updated_at
            ? new Date(c.updated_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
            : '',
          unreadCount: c.unread_count || 0,
          updated_at: c.updated_at,
        };
      });

      this.state.conversations = formatted;
      this.state.isLoading = false;
      this.notify();
    } catch (err: any) {
      console.warn('Fetch direct-conversations error:', err);
      this.state.isLoading = false;
      this.notify();
    }
  }

  async selectConversation(conversation: DirectConversationItem) {
    if (this.state.activeConversation?.id === conversation.id) return;

    if (this.state.activeConversation) {
      wsService.leaveChannel(this.state.activeConversation.id);
    }

    this.state.activeConversation = conversation;
    this.state.messages = [];
    this.state.isLoading = true;
    this.notify();

    wsService.joinChannel(conversation.id);

    try {
      const res = await apiClient.get(`/direct-conversations/${conversation.id}/messages`);
      const msgList = Array.isArray(res.data) ? res.data : res.data.data || [];
      const current = authStore.getState().user;

      const loaded: ChatMessage[] = msgList.map((m: any) => ({
        ...this.mapRawMessage(m, current?.id),
        conversation_id: conversation.id,
      }));

      this.state.messages = loaded;
      this.state.isLoading = false;

      // Clear unread count locally
      this.state.conversations = this.state.conversations.map((c) =>
        c.id === conversation.id ? { ...c, unreadCount: 0 } : c
      );
      this.notify();

      // Notify backend that conversation has been read
      apiClient.post(`/direct-conversations/${conversation.id}/read`).catch(() => {});
    } catch (err: any) {
      console.warn('Failed to load conversation messages:', err);
      this.state.isLoading = false;
      this.notify();
    }
  }

  closeActiveConversation() {
    if (this.state.activeConversation) {
      wsService.leaveChannel(this.state.activeConversation.id);
    }
    this.state.activeConversation = null;
    this.state.messages = [];
    this.notify();
  }

  async startOrOpenDirectChat(userId: string): Promise<DirectConversationItem | null> {
    try {
      const res = await apiClient.post('/direct-conversations', {
        target_user_ids: [userId],
      });
      const convData = res.data.data || res.data;
      const convId = convData?.id;

      if (!convId) return null;

      // Refresh conversations
      await this.fetchConversations();
      const existing = this.state.conversations.find((c) => c.id === convId);

      if (existing) {
        await this.selectConversation(existing);
        return existing;
      }

      // If not yet in list, construct item
      const item: DirectConversationItem = {
        id: convId,
        recipient: {
          id: userId,
          display_name: 'Chat Member',
          username: 'member',
        },
        lastMessage: 'Conversation started',
      };
      await this.selectConversation(item);
      return item;
    } catch (err: any) {
      console.error('Failed to start direct conversation:', err);
      return null;
    }
  }

  async sendDirectMessage(text: string, attachments?: UploadedAttachment[]) {
    const conv = this.state.activeConversation;
    const finalContent = buildContentWithAttachments(text, attachments);
    if (!conv || !finalContent) return;

    const current = authStore.getState().user;

    const optimistic: ChatMessage = {
      id: `local-${Date.now()}`,
      conversation_id: conv.id,
      sender_id: current?.id || 'me',
      sender_name: current?.display_name || current?.username || 'You',
      sender_avatar: current?.avatar_url,
      content: finalContent,
      created_at: new Date().toISOString(),
      is_outgoing: true,
      reactions: [],
      reply_count: 0,
      is_edited: false,
    };

    this.state.messages = [...this.state.messages, optimistic];
    this.notify();

    // 1. Broadcast over WebSocket
    wsService.send({
      type: 'chat_message',
      conversation_id: conv.id,
      target_user_id: conv.recipient?.id,
      content: finalContent,
    });

    // 2. Persist to REST API
    try {
      const res = await apiClient.post(`/direct-conversations/${conv.id}/messages`, {
        content: finalContent,
      });
      const saved = res.data.data || res.data;
      if (saved?.id) {
        this.state.messages = this.state.messages.map((m) =>
          m.id === optimistic.id
            ? {
                ...m,
                id: saved.id,
                reactions: mapReactions(saved.reactions),
                reply_count: saved.replies_count ?? 0,
              }
            : m
        );
        this.notify();
      }
    } catch (err: any) {
      console.warn('Failed to send direct message:', err);
    }
  }

  // -------------------------------------------------------------
  // Channel Chat
  // -------------------------------------------------------------

  async fetchChannelMessages(channelId: string) {
    if (this.state.activeChannelId && this.state.activeChannelId !== channelId) {
      wsService.leaveChannel(this.state.activeChannelId);
    }

    this.state.activeChannelId = channelId;
    this.state.channelMessages = [];
    this.state.isChannelLoading = true;
    this.notify();

    wsService.joinChannel(channelId);

    try {
      const res = await apiClient.get(`/channels/${channelId}/messages`);
      const data = Array.isArray(res.data) ? res.data : res.data.data || [];
      const current = authStore.getState().user;

      const loaded: ChatMessage[] = data.map((m: any) => ({
        ...this.mapRawMessage(m, current?.id),
        channel_id: channelId,
      }));

      this.state.channelMessages = loaded;
      this.state.isChannelLoading = false;
      this.notify();
    } catch (err: any) {
      console.warn('Failed to load channel messages:', err);
      this.state.isChannelLoading = false;
      this.notify();
    }
  }

  async sendChannelMessage(
    channelId: string,
    text: string,
    attachments?: UploadedAttachment[],
    parentMessageId?: string
  ) {
    const finalContent = buildContentWithAttachments(text, attachments);
    if (!finalContent || !channelId) return;

    const current = authStore.getState().user;

    // Optimistic placeholder is only pushed into the flat channel feed for
    // top-level messages; thread replies are managed by the caller (ThreadScreen)
    // via sendThreadReply so they don't leak into the main channel list.
    const isTopLevel = !parentMessageId;
    let optimisticId: string | null = null;

    if (isTopLevel) {
      const optimistic: ChatMessage = {
        id: `local-chan-${Date.now()}`,
        channel_id: channelId,
        sender_id: current?.id || 'me',
        sender_name: current?.display_name || current?.username || 'You',
        sender_avatar: current?.avatar_url,
        content: finalContent,
        created_at: new Date().toISOString(),
        is_outgoing: true,
        reactions: [],
        reply_count: 0,
        is_edited: false,
      };
      optimisticId = optimistic.id;
      this.state.channelMessages = [...this.state.channelMessages, optimistic];
      this.notify();

      // Broadcast over WebSocket
      wsService.send({
        type: 'chat_message',
        channel_id: channelId,
        content: finalContent,
      });
    }

    // Persist to REST API
    try {
      const res = await apiClient.post(`/channels/${channelId}/messages`, {
        content: finalContent,
        parent_message_id: parentMessageId,
      });
      const saved = res.data.data || res.data;
      if (saved?.id && optimisticId) {
        this.state.channelMessages = this.state.channelMessages.map((m) =>
          m.id === optimisticId
            ? {
                ...m,
                id: saved.id,
                reactions: mapReactions(saved.reactions),
                reply_count: saved.replies_count ?? 0,
              }
            : m
        );
        this.notify();
      }
    } catch (err: any) {
      console.warn('Failed to send channel message:', err);
    }
  }

  // -------------------------------------------------------------
  // Threads
  // -------------------------------------------------------------

  async fetchThreadReplies(messageId: string): Promise<ChatMessage[]> {
    try {
      const res = await apiClient.get(`/messages/${messageId}/replies`);
      const data = Array.isArray(res.data) ? res.data : res.data?.data || [];
      const current = authStore.getState().user;
      return data.map((m: any) => this.mapRawMessage(m, current?.id));
    } catch (err: any) {
      console.warn('Failed to fetch thread replies:', err);
      return [];
    }
  }

  async sendThreadReply(
    channelId: string,
    parentMessageId: string,
    text: string,
    attachments?: UploadedAttachment[]
  ): Promise<ChatMessage | null> {
    const finalContent = buildContentWithAttachments(text, attachments);
    if (!finalContent || !channelId || !parentMessageId) return null;

    try {
      const res = await apiClient.post(`/channels/${channelId}/messages`, {
        content: finalContent,
        parent_message_id: parentMessageId,
      });
      const saved = res.data.data || res.data;
      const current = authStore.getState().user;
      const mapped = this.mapRawMessage(saved, current?.id);

      // Bump the reply_count badge on the parent message wherever it's loaded.
      const bump = (m: ChatMessage) =>
        m.id === parentMessageId ? { ...m, reply_count: (m.reply_count || 0) + 1 } : m;
      this.state.channelMessages = this.state.channelMessages.map(bump);
      this.state.messages = this.state.messages.map(bump);
      this.notify();

      return mapped;
    } catch (err: any) {
      console.warn('Failed to send thread reply:', err);
      return null;
    }
  }

  // -------------------------------------------------------------
  // Edit / Delete / Reactions (shared by channel & DM messages)
  // -------------------------------------------------------------

  async editMessage(
    messageId: string,
    newContent: string,
    scope: 'channel' | 'dm'
  ): Promise<ChatMessage | null> {
    const clean = newContent.trim();
    if (!clean || !messageId) return null;

    try {
      const res = await apiClient.patch(`/messages/${messageId}`, { content: clean });
      const saved = res.data?.data || res.data;
      const current = authStore.getState().user;
      const mapped = this.mapRawMessage(saved, current?.id);

      const updateFn = (m: ChatMessage) => (m.id === messageId ? { ...m, ...mapped, id: m.id } : m);
      if (scope === 'channel') {
        this.state.channelMessages = this.state.channelMessages.map(updateFn);
      } else {
        this.state.messages = this.state.messages.map(updateFn);
      }
      this.notify();

      return mapped;
    } catch (err: any) {
      console.warn('Failed to edit message:', err);
      return null;
    }
  }

  async deleteMessage(
    messageId: string,
    mode: 'me' | 'everyone',
    scope: 'channel' | 'dm'
  ): Promise<{ success: boolean; error?: string }> {
    try {
      await apiClient.delete(`/messages/${messageId}?mode=${mode}`);

      if (scope === 'channel') {
        this.state.channelMessages = this.state.channelMessages.filter((m) => m.id !== messageId);
      } else {
        this.state.messages = this.state.messages.filter((m) => m.id !== messageId);
      }
      this.notify();

      return { success: true };
    } catch (err: any) {
      const status = err?.response?.status;
      const serverMessage = err?.response?.data?.message || err?.response?.data?.error?.message;
      const message =
        status === 403
          ? serverMessage || 'Only administrators can delete messages for everyone.'
          : serverMessage || err?.message || 'Failed to delete message.';
      return { success: false, error: message };
    }
  }

  async toggleReaction(
    messageId: string,
    emoji: string,
    scope: 'channel' | 'dm'
  ): Promise<ChatMessage | null> {
    try {
      const res = await apiClient.post(`/messages/${messageId}/reactions`, { emoji });
      const saved = res.data?.data || res.data;
      const current = authStore.getState().user;
      const mapped = this.mapRawMessage(saved, current?.id);

      const updateFn = (m: ChatMessage) => (m.id === messageId ? { ...m, ...mapped, id: m.id } : m);
      if (scope === 'channel') {
        this.state.channelMessages = this.state.channelMessages.map(updateFn);
      } else {
        this.state.messages = this.state.messages.map(updateFn);
      }
      this.notify();

      return mapped;
    } catch (err: any) {
      console.warn('Failed to toggle reaction:', err);
      return null;
    }
  }
}

export const chatStore = new ChatStore();
