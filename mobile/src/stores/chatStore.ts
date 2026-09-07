import { apiClient } from '../api/client';
import { wsService } from '../services/websocketService';
import { authStore } from './authStore';

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
}

export interface Conversation {
  id: string;
  name: string;
  type: 'channel' | 'direct';
  description?: string;
  lastMessage?: string;
  lastMessageTime?: string;
  unreadCount?: number;
  avatar?: string;
  recipientId?: string;
}

interface ChatStoreState {
  conversations: Conversation[];
  activeConversation: Conversation | null;
  messages: ChatMessage[];
  isLoading: boolean;
}

type Listener = () => void;

class ChatStore {
  private state: ChatStoreState = {
    conversations: [],
    activeConversation: null,
    messages: [],
    isLoading: false,
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

  private setupWebSocketListeners() {
    wsService.on((data: any) => {
      if (data.type === 'message' || data.type === 'new_message' || data.type === 'chat_message') {
        const currentUser = authStore.getState().user;
        const msg = data.message || data;

        const newMsg: ChatMessage = {
          id: msg.id || `msg-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
          conversation_id: msg.conversation_id || msg.channel_id,
          channel_id: msg.channel_id,
          sender_id: msg.sender_id || msg.user_id,
          sender_name: msg.sender_name || msg.username || 'Colleague',
          sender_avatar: msg.sender_avatar || msg.avatar_url,
          content: msg.content || msg.text || '',
          created_at: msg.created_at || new Date().toISOString(),
          is_outgoing: (msg.sender_id || msg.user_id) === currentUser?.id,
        };

        // If message belongs to active conversation
        if (
          this.state.activeConversation &&
          (newMsg.conversation_id === this.state.activeConversation.id ||
            newMsg.channel_id === this.state.activeConversation.id)
        ) {
          this.state = {
            ...this.state,
            messages: [...this.state.messages, newMsg],
          };
          this.notify();
        }

        // Update conversation preview
        this.updateConversationPreview(newMsg);
      }
    });
  }

  private updateConversationPreview(msg: ChatMessage) {
    const convId = msg.conversation_id || msg.channel_id;
    if (!convId) return;

    this.state = {
      ...this.state,
      conversations: this.state.conversations.map((c) => {
        if (c.id === convId) {
          return {
            ...c,
            lastMessage: msg.content,
            lastMessageTime: new Date(msg.created_at).toLocaleTimeString([], {
              hour: '2-digit',
              minute: '2-digit',
            }),
          };
        }
        return c;
      }),
    };
    this.notify();
  }

  async fetchConversations() {
    this.state.isLoading = true;
    this.notify();

    try {
      // 1. Fetch channels
      const channelsRes = await apiClient.get('/channels');
      const channelsData = channelsRes.data.data || channelsRes.data || [];

      // 2. Fetch users for direct messages
      const usersRes = await apiClient.get('/users');
      const usersData = usersRes.data.data || usersRes.data || [];
      const current = authStore.getState().user;

      const directConversations: Conversation[] = usersData
        .filter((u: any) => u.id !== current?.id)
        .map((u: any) => ({
          id: `dm-${u.id}`,
          name: u.display_name || u.username || u.email,
          type: 'direct' as const,
          recipientId: u.id,
          avatar: u.avatar_url,
          lastMessage: 'Tap to start discussion',
          lastMessageTime: '',
          unreadCount: 0,
        }));

      const channelConversations: Conversation[] = channelsData.map((c: any) => ({
        id: c.id,
        name: `# ${c.name}`,
        type: 'channel' as const,
        description: c.description,
        lastMessage: c.last_message || 'Welcome to the channel',
        lastMessageTime: '',
        unreadCount: 0,
      }));

      const all = [...channelConversations, ...directConversations];
      this.state = {
        ...this.state,
        conversations: all,
        isLoading: false,
      };
      this.notify();
    } catch (err) {
      console.warn('Fetch conversations error:', err);
      // Fallback default channels
      this.state = {
        ...this.state,
        conversations: [
          {
            id: 'channel-general',
            name: '# general',
            type: 'channel',
            description: 'Company-wide team channel',
            lastMessage: 'Welcome to Micropro Commute!',
            lastMessageTime: 'Now',
          },
          {
            id: 'channel-dev',
            name: '# engineering',
            type: 'channel',
            description: 'Engineering and architecture',
            lastMessage: 'Mobile app deployment ready',
            lastMessageTime: '10:45 AM',
          },
        ],
        isLoading: false,
      };
      this.notify();
    }
  }

  async selectConversation(conversation: Conversation) {
    if (this.state.activeConversation?.id === conversation.id) return;

    if (this.state.activeConversation) {
      wsService.leaveChannel(this.state.activeConversation.id);
    }

    this.state = {
      ...this.state,
      activeConversation: conversation,
      messages: [],
      isLoading: true,
    };
    this.notify();

    wsService.joinChannel(conversation.id);

    try {
      const endpoint =
        conversation.type === 'channel'
          ? `/channels/${conversation.id}/messages`
          : `/messages?recipient_id=${conversation.recipientId}`;

      const res = await apiClient.get(endpoint);
      const data = res.data.data || res.data || [];
      const current = authStore.getState().user;

      const loadedMessages: ChatMessage[] = data.map((m: any) => ({
        id: m.id || `msg-${Date.now()}`,
        conversation_id: conversation.id,
        channel_id: conversation.id,
        sender_id: m.sender_id || m.user_id,
        sender_name: m.sender_name || m.username || 'Member',
        sender_avatar: m.sender_avatar || m.avatar_url,
        content: m.content || m.text || '',
        created_at: m.created_at || new Date().toISOString(),
        is_outgoing: (m.sender_id || m.user_id) === current?.id,
      }));

      this.state = {
        ...this.state,
        messages: loadedMessages,
        isLoading: false,
      };
      this.notify();
    } catch (err) {
      console.warn('Fetch messages warning:', err);
      this.state = {
        ...this.state,
        messages: [
          {
            id: 'welcome-msg',
            conversation_id: conversation.id,
            sender_id: 'system',
            sender_name: 'Micropro Commute Bot',
            content: `Connected to ${conversation.name}. Send your first message!`,
            created_at: new Date().toISOString(),
            is_outgoing: false,
          },
        ],
        isLoading: false,
      };
      this.notify();
    }
  }

  closeActiveConversation() {
    if (this.state.activeConversation) {
      wsService.leaveChannel(this.state.activeConversation.id);
    }
    this.state = {
      ...this.state,
      activeConversation: null,
      messages: [],
    };
    this.notify();
  }

  async sendMessage(text: string) {
    const conv = this.state.activeConversation;
    if (!conv || !text.trim()) return;

    const current = authStore.getState().user;
    const cleanText = text.trim();

    const optimisticMsg: ChatMessage = {
      id: `local-${Date.now()}`,
      conversation_id: conv.id,
      channel_id: conv.type === 'channel' ? conv.id : undefined,
      sender_id: current?.id || 'me',
      sender_name: current?.display_name || current?.username || 'You',
      sender_avatar: current?.avatar_url,
      content: cleanText,
      created_at: new Date().toISOString(),
      is_outgoing: true,
    };

    this.state = {
      ...this.state,
      messages: [...this.state.messages, optimisticMsg],
    };
    this.notify();

    // 1. Send via WebSocket for instant delivery
    wsService.send({
      type: 'chat_message',
      channel_id: conv.id,
      conversation_id: conv.id,
      target_user_id: conv.recipientId,
      content: cleanText,
    });

    // 2. Persist via REST API
    try {
      const endpoint =
        conv.type === 'channel'
          ? `/channels/${conv.id}/messages`
          : `/messages`;

      const payload =
        conv.type === 'channel'
          ? { content: cleanText }
          : { recipient_id: conv.recipientId, content: cleanText };

      await apiClient.post(endpoint, payload);
    } catch (err) {
      console.warn('Failed to persist message via REST:', err);
    }
  }
}

export const chatStore = new ChatStore();
