import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { io } from 'socket.io-client';
import { useAuth } from './AuthContext';
import { SOCKET_URL } from '../lib/api';

const SocketContext = createContext(null);

export const SocketProvider = ({ children }) => {
  const { user } = useAuth();
  const [socket, setSocket] = useState(null);
  const [connected, setConnected] = useState(false);
  const [onlineUsers, setOnlineUsers] = useState(() => new Set());
  const [lastSeen, setLastSeen] = useState({});

  useEffect(() => {
    if (!user?.token) return;

    const s = io(SOCKET_URL, {
      auth: { token: user.token },
      transports: ['websocket', 'polling'],
      reconnection: true,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 8000
    });

    s.on('connect', () => setConnected(true));
    s.on('disconnect', () => setConnected(false));
    s.on('presence:list', (ids) => setOnlineUsers(new Set(ids.map(String))));
    s.on('presence', ({ userId, online, lastSeen: seenAt }) => {
      setOnlineUsers(prev => {
        const next = new Set(prev);
        if (online) next.add(String(userId));
        else next.delete(String(userId));
        return next;
      });
      // null = hidden by their privacy settings (or a block): don't show a stale value.
      setLastSeen(prev => ({ ...prev, [userId]: seenAt ?? null }));
    });

    // Phones suspend background tabs; reconnect as soon as the app is visible again.
    const onVisible = () => {
      if (document.visibilityState === 'visible' && !s.connected) s.connect();
    };
    document.addEventListener('visibilitychange', onVisible);
    window.addEventListener('online', onVisible);

    setSocket(s);
    return () => {
      document.removeEventListener('visibilitychange', onVisible);
      window.removeEventListener('online', onVisible);
      s.close();
      setSocket(null);
      setConnected(false);
      setOnlineUsers(new Set());
    };
  }, [user?.token]);

  const isOnline = useCallback((id) => !!id && onlineUsers.has(String(id)), [onlineUsers]);

  const value = useMemo(
    () => ({ socket, connected, onlineUsers, isOnline, lastSeen }),
    [socket, connected, onlineUsers, isOnline, lastSeen]
  );

  return <SocketContext.Provider value={value}>{children}</SocketContext.Provider>;
};

export const useSocket = () => useContext(SocketContext);

// Subscribe to a socket event for the lifetime of a component. Uses the specific
// handler for cleanup so several components can listen to the same event.
export const useSocketEvent = (event, handler) => {
  const { socket } = useSocket();
  useEffect(() => {
    if (!socket) return;
    socket.on(event, handler);
    return () => socket.off(event, handler);
  }, [socket, event, handler]);
};
