import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import axios from 'axios';
import { useSocket, useSocketEvent } from './SocketContext';

const StatusContext = createContext(null);

// Status feed (mine + contacts' updates). Expiry and visibility are enforced by
// the server; the feed is refetched whenever a status appears or disappears.
export const StatusProvider = ({ children }) => {
  const { socket } = useSocket();
  const [feed, setFeed] = useState(null);
  const refreshTimer = useRef(null);

  const refresh = useCallback(async () => {
    try {
      const { data } = await axios.get('/api/status/feed');
      setFeed(data);
    } catch {
      setFeed(prev => prev || { mine: [], updates: [] });
    }
  }, []);

  const refreshSoon = useCallback(() => {
    clearTimeout(refreshTimer.current);
    refreshTimer.current = setTimeout(refresh, 250);
  }, [refresh]);

  useEffect(() => {
    refresh();
    // Statuses expire on the server; refetch periodically so the list stays accurate.
    const timer = setInterval(refresh, 5 * 60 * 1000);
    return () => { clearInterval(timer); clearTimeout(refreshTimer.current); };
  }, [refresh]);

  useEffect(() => {
    if (!socket) return;
    socket.on('connect', refreshSoon);
    return () => socket.off('connect', refreshSoon);
  }, [socket, refreshSoon]);

  const onViewed = useCallback(({ statusId }) => {
    setFeed(prev => prev && ({
      ...prev,
      mine: prev.mine.map(s => (String(s._id) === String(statusId) ? { ...s, viewCount: (s.viewCount || 0) + 1 } : s))
    }));
  }, []);

  useSocketEvent('status:created', refreshSoon);
  useSocketEvent('status:deleted', refreshSoon);
  useSocketEvent('status:viewed', onViewed);

  const markViewed = useCallback((status) => {
    setFeed(prev => prev && ({
      ...prev,
      updates: prev.updates.map(u => {
        if (String(u.user._id) !== String(status.user)) return u;
        const statuses = u.statuses.map(s => (String(s._id) === String(status._id) ? { ...s, viewed: true } : s));
        return { ...u, statuses, allViewed: statuses.every(s => s.viewed) };
      })
    }));
    axios.post(`/api/status/${status._id}/view`).catch(() => {});
  }, []);

  const removeMine = useCallback((statusId) => {
    setFeed(prev => prev && ({ ...prev, mine: prev.mine.filter(s => String(s._id) !== String(statusId)) }));
  }, []);

  const unseenCount = useMemo(() => (feed?.updates || []).filter(u => !u.allViewed).length, [feed]);

  const value = useMemo(() => ({ feed, refresh, markViewed, removeMine, unseenCount }), [feed, refresh, markViewed, removeMine, unseenCount]);
  return <StatusContext.Provider value={value}>{children}</StatusContext.Provider>;
};

export const useStatus = () => useContext(StatusContext);
