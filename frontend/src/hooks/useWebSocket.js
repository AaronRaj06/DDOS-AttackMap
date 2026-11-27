import { useEffect, useReducer, useState } from 'react';
import { feedReducer, initialFeed } from '../utils/feed.js';

const MAX_RETRY_MS = 30_000;

export function useWebSocket(path) {
  const [feed, dispatch] = useReducer(feedReducer, initialFeed);
  const [connection, setConnection] = useState('connecting');

  useEffect(() => {
    let socket;
    let timer;
    let attempts = 0;
    let disposed = false;

    function connect() {
      const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      socket = new WebSocket(`${protocol}//${window.location.host}${path}`);
      socket.onopen = () => {
        attempts = 0;
        setConnection('connected');
      };
      socket.onmessage = ({ data }) => {
        try {
          dispatch(JSON.parse(data));
        } catch (error) {
          console.error('Invalid message from the server', error);
        }
      };
      socket.onclose = () => {
        if (disposed) return;
        setConnection('reconnecting');
        // Jitter keeps every open tab from reconnecting at the same instant after a deploy
        const delay = Math.min(1000 * 2 ** attempts++, MAX_RETRY_MS);
        timer = setTimeout(connect, delay * (0.5 + Math.random() / 2));
      };
    }

    // Deferred, so StrictMode's throwaway mount never opens a socket
    timer = setTimeout(connect, 0);

    return () => {
      disposed = true;
      clearTimeout(timer);
      socket?.close();
    };
  }, [path]);

  return { ...feed, connection };
}
