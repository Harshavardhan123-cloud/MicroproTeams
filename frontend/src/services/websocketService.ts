type EventListener = (data: any) => void;

class WebSocketService {
  private socket: WebSocket | null = null;
  private listeners: Set<EventListener> = new Set();
  private isConnecting = false;
  private activeChannelId: string | null = null;
  private reconnectTimer: any = null;
  private pingInterval: any = null;

  connect(channelId?: string) {
    if (channelId && channelId !== this.activeChannelId) {
      if (this.socket && this.socket.readyState === WebSocket.OPEN) {
        if (this.activeChannelId) {
          this.send({ type: 'leave_channel', channel_id: this.activeChannelId });
        }
        this.send({ type: 'join_channel', channel_id: channelId });
      }
      this.activeChannelId = channelId;
    }

    if (this.socket && (this.socket.readyState === WebSocket.OPEN || this.socket.readyState === WebSocket.CONNECTING)) {
      return;
    }

    const token = localStorage.getItem('access_token');
    if (!token || token === 'undefined' || token === 'null') return;

    this.isConnecting = true;
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const host = window.location.hostname || 'localhost';
    const port = window.location.port || (protocol === 'wss:' ? '443' : '80');
    let url = `${protocol}//${host}:${port}/api/v1/ws?token=${encodeURIComponent(token)}`;
    if (this.activeChannelId) {
      url += `&channel_id=${encodeURIComponent(this.activeChannelId)}`;
    }

    try {
      this.socket = new WebSocket(url);

      this.socket.onopen = () => {
        console.log('⚡ WebSocket connected');
        this.isConnecting = false;
        if (this.reconnectTimer) {
          clearTimeout(this.reconnectTimer);
          this.reconnectTimer = null;
        }
        if (this.activeChannelId) {
          this.send({ type: 'join_channel', channel_id: this.activeChannelId });
        }

        // Start heartbeat to prevent proxy idle timeout
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
              console.error('Listener callback error:', err);
            }
          });
        } catch (err) {
          console.error('WebSocket parse error:', err);
        }
      };

      this.socket.onclose = () => {
        this.socket = null;
        this.isConnecting = false;
        if (this.pingInterval) {
          clearInterval(this.pingInterval);
          this.pingInterval = null;
        }
        // Auto-reconnect after 2 seconds
        if (!this.reconnectTimer) {
          this.reconnectTimer = setTimeout(() => {
            this.reconnectTimer = null;
            this.connect(this.activeChannelId || undefined);
          }, 2000);
        }
      };

      this.socket.onerror = (err) => {
        console.error('WebSocket error:', err);
      };
    } catch (err) {
      console.error('Failed to initialize WebSocket:', err);
      this.isConnecting = false;
    }
  }

  send(data: any) {
    if (this.socket && this.socket.readyState === WebSocket.OPEN) {
      this.socket.send(JSON.stringify(data));
    }
  }

  on(callback: EventListener) {
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
  }
}

export const wsService = new WebSocketService();
