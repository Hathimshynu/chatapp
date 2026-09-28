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
  const [typing, setTyping] = useState({}); // conversationId -> 'typing' | 'recording'
  const activeIdRef = useRef(null);
  const typingTimers = useRef({});
  const conversationsRef = useLatest(conversations);
  const myId = String(user?._id);

  const otherParticipant = useCallback(
    (conversation) => conversation?.participants?.find(p => String(p._id) !== myId) || null,
    [myId]
  );

  const refresh = useCallback(async () => {
    try {
      const { data } = await axios.get('/api/messages/conversations');
      setConversations(sortConversations(data.map(c =>
        String(c._id) === activeIdRef.current ? { ...c, unreadCount: 0 } : c
      )));
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
      if (first) { first = false; return; }
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

  const clearTyping = useCallback((conversationId) => {
    clearTimeout(typingTimers.current[conversationId]);
    setTyping(prev => {
      if (!prev[conversationId]) return prev;
      const next = { ...prev };
      delete next[conversationId];
      return next;
    });
  }, []);

  const markRead = useCallback((conversationId) => {
    if (!conversationId || String(conversationId).startsWith('temp')) return;
    patchConversation(conversationId, { unreadCount: 0 });
    axios.post(`/api/messages/${conversationId}/read`).catch(() => {});
  }, [patchConversation]);

  // ── Realtime ─────────────────────────────────────────────────────
  const onNewMessage = useCallback(({ message, conversationId }) => {
    const incoming = String(message.sender?._id || message.sender) !== myId;
    const known = conversationsRef.current.find(c => String(c._id) === String(conversationId));
    const isActive = activeIdRef.current === String(conversationId);
    const appVisible = document.visibilityState === 'visible';

    if (!known) {
      refresh();
    } else {
      patchConversation(conversationId, c => ({
        lastMessage: message,
        updatedAt: message.createdAt,
        unreadCount: incoming && !(isActive && appVisible) ? (c.unreadCount || 0) + 1 : c.unreadCount
      }));
    }

    if (!incoming) return;
    clearTyping(String(conversationId));
    if (known?.muted || (isActive && appVisible)) return;

    playMessageSound();
    if (!appVisible || !isActive) {
      const sender = known ? otherParticipant(known) : null;
      const name = message.sender?.name || sender?.name || 'New message';
      if (!appVisible) {
        showNotification(name, {
          body: messagePreview(message, myId),
          tag: `conv-${conversationId}`,
          conversationId: String(conversationId),
          icon: sender?.avatar && !sender.avatar.startsWith('data:') ? mediaUrl(sender.avatar) : undefined
        });
      }
    }
  }, [myId, refresh, patchConversation, clearTyping, otherParticipant, conversationsRef]);

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

  const onTyping = useCallback(({ conversationId, type }) => {
    clearTimeout(typingTimers.current[conversationId]);
    setTyping(prev => (prev[conversationId] === type ? prev : { ...prev, [conversationId]: type }));
    typingTimers.current[conversationId] = setTimeout(() => clearTyping(conversationId), TYPING_TTL_MS);
  }, [clearTyping]);

  const onTypingStop = useCallback(({ conversationId }) => clearTyping(conversationId), [clearTyping]);

  const onUserUpdated = useCallback((updated) => {
    setConversations(prev => prev.map(c => ({
      ...c,
      participants: c.participants.map(p => (String(p._id) === String(updated._id) ? { ...p, ...updated } : p))
    })));
  }, []);

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

  useEffect(() => () => Object.values(typingTimers.current).forEach(clearTimeout), []);

  // ── Conversation settings ────────────────────────────────────────
  const setFlag = useCallback(async (conversationId, flag, value) => {
    patchConversation(conversationId, { [flag]: value });
    try {
      await axios.post(`/api/messages/conversation/${conversationId}/${flag === 'pinned' ? 'pin' : 'mute'}`, { value });
    } catch (error) {
      patchConversation(conversationId, { [flag]: !value });
      toast.error(errorMessage(error));
    }
  }, [patchConversation]);

  const togglePin = useCallback((conversation) => setFlag(conversation._id, 'pinned', !conversation.pinned), [setFlag]);
  const toggleMute = useCallback((conversation) => setFlag(conversation._id, 'muted', !conversation.muted), [setFlag]);

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
    () => conversations.reduce((sum, c) => sum + (c.muted ? 0 : c.unreadCount || 0), 0),
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

  const value = useMemo(() => ({
    conversations,
    loaded,
    typing,
    totalUnread,
    refresh,
    otherParticipant,
    upsertConversation,
    patchConversation,
    setActiveConversation,
    markRead,
    togglePin,
    toggleMute,
    clearChat
  }), [conversations, loaded, typing, totalUnread, refresh, otherParticipant, upsertConversation,
    patchConversation, setActiveConversation, markRead, togglePin, toggleMute, clearChat]);

  return <ChatContext.Provider value={value}>{children}</ChatContext.Provider>;
};

export const useChat = () => useContext(ChatContext);
