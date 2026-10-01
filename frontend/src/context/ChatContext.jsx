import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import axios from 'axios';
import toast from 'react-hot-toast';
import { useAuth } from './AuthContext';
import { useSocket, useSocketEvent } from './SocketContext';
import { messagePreview } from '../lib/format';
import { playMessageSound } from '../lib/sounds';
import { showNotification } from '../lib/notify';
import { errorMessage, mediaUrl } from '../lib/api';
import useLatest from '../hooks/useLatest';
import { dequeueMessage, inFlight, isRetryable, markRejected, readOutbox } from '../lib/outbox';

const ChatContext = createContext(null);

const TYPING_TTL_MS = 6000;

const sortConversations = (list) =>
  [...list].sort((a, b) => {
    if (!!a.pinned !== !!b.pinned) return a.pinned ? -1 : 1;
    return new Date(b.lastMessage?.createdAt || b.updatedAt) - new Date(a.lastMessage?.createdAt || a.updatedAt);
  });

const addId = (list = [], id) => (list.some(x => String(x) === String(id)) ? list : [...list, id]);

export const ChatProvider = ({ children }) => {
  const { user } = useAuth();
  const { socket } = useSocket();
  const [conversations, setConversations] = useState([]);
  const [loaded, setLoaded] = useState(false);
  // conversationId -> { userId: 'typing' | 'recording' }
  const [typing, setTyping] = useState({});
  const [removal, setRemoval] = useState(null); // last group we lost access to
  const activeIdRef = useRef(null);
  const typingTimers = useRef({});
  const conversationsRef = useLatest(conversations);
  const myId = String(user?._id);

  const otherParticipant = useCallback(
    (conversation) => (conversation?.isGroup ? null : conversation?.participants?.find(p => String(p._id) !== myId) || null),
    [myId]
  );

  // Name/avatar to show for any conversation (group or direct).
  const conversationInfo = useCallback((conversation) => {
    if (!conversation) return { title: '', avatarUser: null, isGroup: false };
    if (conversation.isGroup) {
      return { title: conversation.name, avatarUser: { _id: conversation._id, name: conversation.name, avatar: conversation.avatar }, isGroup: true };
    }
    const other = otherParticipant(conversation);
    return { title: other?.name || 'Unknown', avatarUser: other, isGroup: false, other };
  }, [otherParticipant]);

  const loadedOkRef = useRef(false); // has the chat list ever loaded successfully?
  const refresh = useCallback(async () => {
    try {
      const { data } = await axios.get('/api/messages/conversations');
      if (!Array.isArray(data)) return;
      setConversations(sortConversations(data.map(c =>
        String(c._id) === activeIdRef.current ? { ...c, unreadCount: 0 } : c
      )));
      loadedOkRef.current = true;
    } catch (error) {
      if (error.response?.status !== 401) console.error('Failed to load chats', error);
    } finally {
      setLoaded(true);
    }
  }, []);

  useEffect(() => { refresh(); }, [refresh]);

  // Catch up on anything missed while the socket was disconnected.
  useEffect(() => {
    if (!socket) return;
    let first = true;
    const onConnect = () => {
      // The first connect needs no catch-up — unless the app started offline and the
      // initial load failed, in which case this is the moment to load the chat list.
      if (first) {
        first = false;
        if (loadedOkRef.current) return;
      }
      refresh();
    };
    socket.on('connect', onConnect);
    return () => socket.off('connect', onConnect);
  }, [socket, refresh]);

  const setActiveConversation = useCallback((id) => {
    activeIdRef.current = id ? String(id) : null;
  }, []);

  const patchConversation = useCallback((id, patch) => {
    setConversations(prev => sortConversations(prev.map(c =>
      String(c._id) === String(id) ? { ...c, ...(typeof patch === 'function' ? patch(c) : patch) } : c
    )));
  }, []);

  const upsertConversation = useCallback((conversation) => {
    setConversations(prev => sortConversations([
      ...prev.filter(c => String(c._id) !== String(conversation._id)),
      { unreadCount: 0, ...conversation }
    ]));
  }, []);

  // Send messages left in the outbox (written offline, possibly in an earlier session)
  // for chats that aren't open — the open chat resends its own. One at a time, in order;
  // stops at the first network failure and tries again on the next reconnect.
  const flushOutbox = useCallback(async () => {
    if (!navigator.onLine) return;
    for (const entry of readOutbox(myId)) {
      if (entry.rejected || inFlight.has(entry.clientId)) continue;
      if (entry.conversationId && entry.conversationId === activeIdRef.current) continue;
      inFlight.add(entry.clientId);
      try {
        const target = entry.conversationId ? { conversationId: entry.conversationId } : { receiverId: entry.receiverId };
        const { data } = await axios.post('/api/messages/send', { ...entry.body, ...target, clientId: entry.clientId });
        dequeueMessage(myId, entry.clientId);
        if (data?.conversation) upsertConversation(data.conversation);
      } catch (error) {
        if (!isRetryable(error)) {
          markRejected(myId, entry.clientId);
          continue;
        }
        break; // offline / server down — try again later
      } finally {
        inFlight.delete(entry.clientId);
      }
    }
  }, [myId, upsertConversation]);

  useEffect(() => {
    if (!socket) return undefined;
    const run = () => { flushOutbox(); };
    const initial = setTimeout(run, 1500); // after the open chat (if any) has claimed its own
    socket.on('connect', run);
    window.addEventListener('online', run);
    return () => {
      clearTimeout(initial);
      socket.off('connect', run);
      window.removeEventListener('online', run);
    };
  }, [socket, flushOutbox]);

  const clearTyping = useCallback((conversationId, userId) => {
    const ids = userId ? [String(userId)] : Object.keys(typingTimers.current)
      .filter(k => k.startsWith(`${conversationId}:`)).map(k => k.split(':')[1]);
    ids.forEach(id => clearTimeout(typingTimers.current[`${conversationId}:${id}`]));
    setTyping(prev => {
      const current = prev[conversationId];
      if (!current) return prev;
      const nextEntry = { ...current };
      ids.forEach(id => delete nextEntry[id]);
      const next = { ...prev };
      if (Object.keys(nextEntry).length) next[conversationId] = nextEntry;
      else delete next[conversationId];
      return next;
    });
  }, []);

  const markRead = useCallback((conversationId) => {
    if (!conversationId || String(conversationId).startsWith('temp')) return;
    patchConversation(conversationId, { unreadCount: 0 });
    axios.post(`/api/messages/${conversationId}/read`).catch(() => {});
  }, [patchConversation]);

  // ── Realtime: messages ───────────────────────────────────────────
  const onNewMessage = useCallback(({ message, conversationId }) => {
    const incoming = String(message.sender?._id || message.sender) !== myId;
    const known = conversationsRef.current.find(c => String(c._id) === String(conversationId));
    const isActive = activeIdRef.current === String(conversationId);
    const appVisible = document.visibilityState === 'visible';
    const isSystem = message.messageType === 'system';

    if (!known) {
      refresh();
    } else {
      patchConversation(conversationId, c => ({
        lastMessage: message,
        updatedAt: message.createdAt,
        unreadCount: incoming && !isSystem && !(isActive && appVisible) ? (c.unreadCount || 0) + 1 : c.unreadCount
      }));
    }

    if (!incoming || isSystem) return;
    clearTyping(String(conversationId), message.sender?._id);
    if (known?.muted || (isActive && appVisible)) return;

    playMessageSound();
    if (!appVisible) {
      const info = known ? conversationInfo(known) : { title: message.sender?.name };
      const avatar = info.avatarUser?.avatar;
      showNotification(info.title || message.sender?.name || 'New message', {
        body: messagePreview(message, myId, { group: !!known?.isGroup }),
        tag: `conv-${conversationId}`,
        conversationId: String(conversationId),
        icon: avatar && !avatar.startsWith('data:') ? mediaUrl(avatar) : undefined
      });
    }
  }, [myId, refresh, patchConversation, clearTyping, conversationInfo, conversationsRef]);

  const onMessageUpdated = useCallback(({ message, conversationId }) => {
    patchConversation(conversationId, c =>
      c.lastMessage && String(c.lastMessage._id) === String(message._id) ? { lastMessage: message } : {}
    );
  }, [patchConversation]);

  const onMessageRemoved = useCallback(({ messageId, conversationId }) => {
    const conversation = conversationsRef.current.find(c => String(c._id) === String(conversationId));
    if (conversation?.lastMessage && String(conversation.lastMessage._id) === String(messageId)) refresh();
  }, [refresh, conversationsRef]);

  const onReceipts = useCallback((field) => ({ conversationId, messageIds, userId }) => {
    patchConversation(conversationId, c => {
      if (!c.lastMessage || !messageIds.includes(String(c.lastMessage._id))) return {};
      const lastMessage = { ...c.lastMessage, deliveredTo: addId(c.lastMessage.deliveredTo, userId) };
      if (field === 'seen') lastMessage.seen = addId(c.lastMessage.seen, userId);
      return { lastMessage };
    });
  }, [patchConversation]);
  const onSeen = useMemo(() => onReceipts('seen'), [onReceipts]);
  const onDelivered = useMemo(() => onReceipts('delivered'), [onReceipts]);

  const onConversationRead = useCallback(({ conversationId }) => {
    patchConversation(conversationId, { unreadCount: 0 });
  }, [patchConversation]);

  const onConversationCleared = useCallback(({ conversationId }) => {
    patchConversation(conversationId, { lastMessage: null, unreadCount: 0 });
  }, [patchConversation]);

  // ── Realtime: typing (per person, so groups can show several) ────
  const onTyping = useCallback(({ conversationId, userId, type }) => {
    const key = `${conversationId}:${userId}`;
    clearTimeout(typingTimers.current[key]);
    setTyping(prev => (prev[conversationId]?.[userId] === type
      ? prev
      : { ...prev, [conversationId]: { ...prev[conversationId], [userId]: type } }));
    typingTimers.current[key] = setTimeout(() => clearTyping(conversationId, userId), TYPING_TTL_MS);
  }, [clearTyping]);

  const onTypingStop = useCallback(({ conversationId, userId }) => clearTyping(conversationId, userId), [clearTyping]);

  const onUserUpdated = useCallback((updated) => {
    setConversations(prev => prev.map(c => ({
      ...c,
      participants: c.participants.map(p => (String(p._id) === String(updated._id) ? { ...p, ...updated } : p))
    })));
  }, []);

  // ── Realtime: groups ─────────────────────────────────────────────
  const onGroupUpdated = useCallback(({ conversationId, group }) => {
    const known = conversationsRef.current.some(c => String(c._id) === String(conversationId));
    if (!known) {
      refresh(); // we were just added / created
      return;
    }
    // Merge shared fields; keep per-user fields (unread, pinned, muted, archived).
    patchConversation(conversationId, c => {
      const { participantIds, ...shared } = group;
      const myRole = group.members?.find(m => String(m.user) === myId)?.role || null;
      const next = { ...shared, myRole };
      if (myRole !== 'admin') next.inviteCode = undefined;
      else if (c.inviteCode) next.inviteCode = c.inviteCode;
      // Keep participants in sync with membership; profiles come from the refetch below.
      if (participantIds) next.participants = (c.participants || []).filter(p => participantIds.includes(String(p._id)));
      return next;
    });
    // Member profiles are privacy-masked per viewer, so fetch my own view of them.
    axios.get(`/api/groups/${conversationId}`)
      .then(({ data }) => {
        const fresh = { ...data }; // keep my live unread count and last message
        delete fresh.unreadCount;
        delete fresh.lastMessage;
        patchConversation(conversationId, fresh);
      })
      .catch(() => {});
  }, [conversationsRef, refresh, patchConversation, myId]);

  // Pin / mute / archive changed in another tab or device of mine.
  const onConversationUpdated = useCallback(({ conversationId, ...flags }) => {
    patchConversation(conversationId, flags);
  }, [patchConversation]);

  // I blocked/unblocked someone (possibly in another tab).
  const onBlockUpdated = useCallback(({ userId, blocked }) => {
    setConversations(prev => prev.map(c => (!c.isGroup && c.participants?.some(p => String(p._id) === String(userId))
      ? { ...c, blockedByMe: blocked }
      : c)));
  }, []);

  const onGroupRemoved = useCallback(({ conversationId, reason }) => {
    setConversations(prev => prev.filter(c => String(c._id) !== String(conversationId)));
    clearTyping(String(conversationId));
    setRemoval({ conversationId: String(conversationId), reason, at: Date.now() });
  }, [clearTyping]);

  useSocketEvent('message:new', onNewMessage);
  useSocketEvent('message:updated', onMessageUpdated);
  useSocketEvent('message:removed', onMessageRemoved);
  useSocketEvent('messages:seen', onSeen);
  useSocketEvent('messages:delivered', onDelivered);
  useSocketEvent('conversation:read', onConversationRead);
  useSocketEvent('conversation:cleared', onConversationCleared);
  useSocketEvent('typing', onTyping);
  useSocketEvent('typing:stop', onTypingStop);
  useSocketEvent('user:updated', onUserUpdated);
  useSocketEvent('group:updated', onGroupUpdated);
  useSocketEvent('group:removed', onGroupRemoved);
  useSocketEvent('conversation:updated', onConversationUpdated);
  useSocketEvent('block:updated', onBlockUpdated);

  useEffect(() => () => Object.values(typingTimers.current).forEach(clearTimeout), []);

  // ── Conversation settings ────────────────────────────────────────
  const setFlag = useCallback(async (conversationId, flag, value) => {
    patchConversation(conversationId, { [flag]: value });
    try {
      await axios.post(`/api/messages/conversation/${conversationId}/${{ pinned: 'pin', muted: 'mute', archived: 'archive' }[flag]}`, { value });
    } catch (error) {
      patchConversation(conversationId, { [flag]: !value });
      toast.error(errorMessage(error));
    }
  }, [patchConversation]);

  const togglePin = useCallback((conversation) => setFlag(conversation._id, 'pinned', !conversation.pinned), [setFlag]);
  const toggleMute = useCallback((conversation) => setFlag(conversation._id, 'muted', !conversation.muted), [setFlag]);
  // Archived chats stay archived when new messages arrive (WhatsApp's default);
  // their unread count keeps growing and shows on the "Archived" row instead.
  const toggleArchive = useCallback((conversation) => setFlag(conversation._id, 'archived', !conversation.archived), [setFlag]);

  const setBlocked = useCallback(async (userId, blocked) => {
    try {
      if (blocked) await axios.post(`/api/users/${userId}/block`);
      else await axios.delete(`/api/users/${userId}/block`);
      onBlockUpdated({ userId, blocked });
      return true;
    } catch (error) {
      toast.error(errorMessage(error));
      return false;
    }
  }, [onBlockUpdated]);

  const clearChat = useCallback(async (conversationId) => {
    try {
      await axios.post(`/api/messages/conversation/${conversationId}/clear`);
      patchConversation(conversationId, { lastMessage: null, unreadCount: 0 });
      return true;
    } catch (error) {
      toast.error(errorMessage(error));
      return false;
    }
  }, [patchConversation]);

  const totalUnread = useMemo(
    () => conversations.reduce((sum, c) => sum + (c.muted || c.archived ? 0 : c.unreadCount || 0), 0),
    [conversations]
  );

  // Unread count in the tab title and on the installed app's icon.
  useEffect(() => {
    document.title = totalUnread ? `(${totalUnread}) ChatApp` : 'ChatApp';
    try {
      if (totalUnread) navigator.setAppBadge?.(totalUnread)?.catch?.(() => {});
      else navigator.clearAppBadge?.()?.catch?.(() => {});
    } catch {
      // badging not supported
    }
  }, [totalUnread]);

  const archivedUnread = useMemo(
    () => conversations.reduce((sum, c) => sum + (c.archived && !c.muted ? c.unreadCount || 0 : 0), 0),
    [conversations]
  );

  const value = useMemo(() => ({
    conversations,
    loaded,
    typing,
    removal,
    totalUnread,
    refresh,
    otherParticipant,
    conversationInfo,
    upsertConversation,
    patchConversation,
    setActiveConversation,
    markRead,
    togglePin,
    toggleMute,
    toggleArchive,
    setBlocked,
    archivedUnread,
    clearChat
  }), [conversations, loaded, typing, removal, totalUnread, refresh, otherParticipant, conversationInfo,
    upsertConversation, patchConversation, setActiveConversation, markRead, togglePin, toggleMute, toggleArchive, setBlocked, archivedUnread, clearChat]);

  return <ChatContext.Provider value={value}>{children}</ChatContext.Provider>;
};

export const useChat = () => useContext(ChatContext);
