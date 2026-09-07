import { getTargetHostUrl, getStoredToken } from '../api/client';

export type WebSocketListener = (data: any) => void;

class WebSocketService {
  private socket: WebSocket | null = null;
  private listeners: Set<WebSocketListener> = new Set();
  private isConnecting = false;
  private reconnectTimer: any = null;
  private pingInterval: any = null;
  private activeChannelId: string | null = null;

  async connect(channelId?: string) {
    if (channelId) {
      this.activeChannelId = channelId;
    }

    if (this.socket && (this.socket.readyState === WebSocket.OPEN || this.socket.readyState === WebSocket.CONNECTING)) {
      if (channelId && this.socket.readyState === WebSocket.OPEN) {
        this.send({ type: 'join_channel', channel_id: channelId });
      }
      return;
    }

    const token = await getStoredToken();
    if (!token) return;

    this.isConnecting = true;
    const targetHost = getTargetHostUrl();
    const wsBase = targetHost.replace(/^http/, 'ws');
    let url = `${wsBase}/api/v1/ws?token=${encodeURIComponent(token)}`;
    if (this.activeChannelId) {
      url += `&channel_id=${encodeURIComponent(this.activeChannelId)}`;
    }

    try {
      this.socket = new WebSocket(url);

      this.socket.onopen = () => {
        this.isConnecting = false;
        if (this.reconnectTimer) {
          clearTimeout(this.reconnectTimer);
          this.reconnectTimer = null;
        }
        if (this.activeChannelId) {
          this.send({ type: 'join_channel', channel_id: this.activeChannelId });
        }

        // Send ping every 20 seconds
        this.pingInterval = setInterval(() => {
          this.send({ type: 'ping' });
        }, 20000);
      };

      this.socket.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          this.listeners.forEach((listener) => {
            try {
              listener(data);
            } catch (err) {
              console.error('Mobile WS listener error:', err);
            }
          });
        } catch (err) {
          console.error('Mobile WS JSON parse error:', err);
        }
      };

      this.socket.onclose = () => {
        this.socket = null;
        this.isConnecting = false;
        if (this.pingInterval) {
          clearInterval(this.pingInterval);
          this.pingInterval = null;
        }
        if (!this.reconnectTimer) {
          this.reconnectTimer = setTimeout(() => {
            this.reconnectTimer = null;
            this.connect(this.activeChannelId || undefined);
          }, 3000);
        }
      };

      this.socket.onerror = (err) => {
        console.warn('Mobile WS error:', err);
        this.isConnecting = false;
      };
    } catch (err) {
      console.warn('Failed to start WebSocket:', err);
      this.isConnecting = false;
      this.socket = null;
    }
  }

  joinChannel(channelId: string) {
    if (!channelId) return;
    this.activeChannelId = channelId;
    if (this.socket && this.socket.readyState === WebSocket.OPEN) {
      this.send({ type: 'join_channel', channel_id: channelId });
    } else {
      this.connect(channelId);
    }
  }

  leaveChannel(channelId: string) {
    if (!channelId) return;
    if (this.socket && this.socket.readyState === WebSocket.OPEN) {
      this.send({ type: 'leave_channel', channel_id: channelId });
    }
    if (this.activeChannelId === channelId) {
      this.activeChannelId = null;
    }
  }

  send(data: any) {
    if (this.socket && this.socket.readyState === WebSocket.OPEN) {
      this.socket.send(JSON.stringify(data));
    }
  }

  on(callback: WebSocketListener) {
    this.listeners.add(callback);
    return () => {
      this.listeners.delete(callback);
    };
  }

  disconnect() {
    if (this.socket) {
      this.socket.close();
      this.socket = null;
    }
    if (this.pingInterval) {
      clearInterval(this.pingInterval);
      this.pingInterval = null;
    }
    this.activeChannelId = null;
    this.isConnecting = false;
  }
}

export const wsService = new WebSocketService();
