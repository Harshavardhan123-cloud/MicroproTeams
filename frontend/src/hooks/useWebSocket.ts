import { useEffect } from 'react';
import { wsService } from '../services/websocketService';

export const useWebSocket = (channelId?: string, onEvent?: (data: any) => void) => {
  useEffect(() => {
    wsService.connect(channelId);

    let cleanup: (() => void) | undefined;
    if (onEvent) {
      cleanup = wsService.on(onEvent);
    }

    return () => {
      if (cleanup) cleanup();
    };
  }, [channelId, onEvent]);

  return {
    send: (data: any) => wsService.send(data),
  };
};
