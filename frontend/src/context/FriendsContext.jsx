import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import axios from 'axios';
import toast from 'react-hot-toast';
import { useSocket, useSocketEvent } from './SocketContext';
import { errorMessage } from '../lib/api';
import { showNotification } from '../lib/notify';

const FriendsContext = createContext(null);

// Facebook-style friends: requests you received / sent and your friends list.
// The server is the source of truth; socket events just trigger a refresh.
export const FriendsProvider = ({ children }) => {
  const { connected } = useSocket();
  const [friends, setFriends] = useState([]);
  const [incoming, setIncoming] = useState([]);
  const [outgoing, setOutgoing] = useState([]);
  const [loaded, setLoaded] = useState(false);

  const refresh = useCallback(async () => {
    try {
      const [f, r] = await Promise.all([axios.get('/api/friends'), axios.get('/api/friends/requests')]);
      setFriends(f.data);
      setIncoming(r.data.incoming);
      setOutgoing(r.data.outgoing);
    } catch {
      // offline — the next reconnect refreshes
    } finally {
      setLoaded(true);
    }
  }, []);

  // First load, and again after every reconnect (catch up on anything missed).
  useEffect(() => { if (connected) refresh(); }, [connected, refresh]);

  useSocketEvent('friend:request', useCallback((payload) => {
    refresh();
    if (payload && document.visibilityState !== 'visible') {
      axios.get(`/api/users/${payload.requester}`)
        .then(({ data }) => { if (data.friendship?.state === 'incoming') showNotification('New friend request', { body: `${data.name} wants to be friends`, tag: `friend-${payload.requester}` }); })
        .catch(() => {});
    }
  }, [refresh]));
  useSocketEvent('friend:updated', refresh);
  useSocketEvent('block:updated', refresh);

  // Every action returns the new state ('none' | 'outgoing' | 'friends') or null on error.
  const act = useCallback(async (request, success) => {
    try {
      const { data } = await request();
      if (success) toast.success(success);
      await refresh();
      return data;
    } catch (error) {
      toast.error(errorMessage(error));
      await refresh();
      return null;
    }
  }, [refresh]);

  const sendRequest = useCallback((user) => act(() => axios.post('/api/friends/requests', { userId: user._id }), `Friend request sent to ${user.name.split(' ')[0]}`), [act]);
  const accept = useCallback((requestId, name) => act(() => axios.post(`/api/friends/requests/${requestId}/accept`), name ? `You and ${name.split(' ')[0]} are now friends` : null), [act]);
  const decline = useCallback((requestId) => act(() => axios.post(`/api/friends/requests/${requestId}/decline`)), [act]);
  const cancel = useCallback((requestId) => act(() => axios.delete(`/api/friends/requests/${requestId}`)), [act]);
  const unfriend = useCallback((user) => act(() => axios.delete(`/api/friends/${user._id}`), `Removed ${user.name.split(' ')[0]} from friends`), [act]);

  // Local view of the relationship with someone (kept in sync by the lists above).
  const relationOf = useCallback((userId) => {
    const id = String(userId);
    const friend = friends.find(f => String(f._id) === id);
    if (friend) return { state: 'friends', requestId: friend.friendship?.requestId };
    const inc = incoming.find(r => String(r.user._id) === id);
    if (inc) return { state: 'incoming', requestId: inc.requestId };
    const out = outgoing.find(r => String(r.user._id) === id);
    if (out) return { state: 'outgoing', requestId: out.requestId };
    return { state: 'none' };
  }, [friends, incoming, outgoing]);

  const value = useMemo(() => ({
    friends, incoming, outgoing, loaded, refresh, relationOf, sendRequest, accept, decline, cancel, unfriend
  }), [friends, incoming, outgoing, loaded, refresh, relationOf, sendRequest, accept, decline, cancel, unfriend]);

  return <FriendsContext.Provider value={value}>{children}</FriendsContext.Provider>;
};

export const useFriends = () => useContext(FriendsContext);
