import { useEffect, useRef, useState, useCallback } from 'react';

/**
 * useWebSocket – WebSocket connection hook.
 * Placeholder – connect to real WebSocket server later.
 */
export function useWebSocket(url) {
  const wsRef = useRef(null);
  const [isConnected, setIsConnected] = useState(false);
  const [lastMessage, setLastMessage] = useState(null);

  const connect = useCallback(() => {
    // Placeholder: In production, connect to the actual WebSocket URL
    console.log(`[WebSocket] Would connect to: ${url}`);
    setIsConnected(false);
  }, [url]);

  const sendMessage = useCallback((message) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify(message));
    }
  }, []);

  const disconnect = useCallback(() => {
    wsRef.current?.close();
    setIsConnected(false);
  }, []);

  useEffect(() => {
    return () => disconnect();
  }, [disconnect]);

  return { isConnected, lastMessage, sendMessage, connect, disconnect };
}
