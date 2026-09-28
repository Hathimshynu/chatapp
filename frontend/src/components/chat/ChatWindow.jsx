import { Fragment, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import axios from 'axios';
import toast from 'react-hot-toast';
import {
  ArrowDown, ArrowLeft, Bell, BellOff, Eraser, EllipsisVertical, Info, Phone, Pin, PinOff, Upload, Video
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { useChat } from '../../context/ChatContext';
import { useSocket, useSocketEvent } from '../../context/SocketContext';
import { useCall } from '../../context/CallContext';
import Avatar from '../common/Avatar';
import Menu from '../common/Menu';
import Dialog from '../common/Dialog';
import MessageBubble from './MessageBubble';
import MessageMenu from './MessageMenu';
import Composer from './Composer';
import MediaViewer from './MediaViewer';
import ForwardDialog from './ForwardDialog';
import ContactPanel from './ContactPanel';
import { errorMessage, uploadMedia } from '../../lib/api';
import { formatDayLabel, formatLastSeen, isSameDay } from '../../lib/format';
import { attachmentKind, compressImage, readVideoMeta } from '../../lib/media';
import { playSentSound } from '../../lib/sounds';

const PAGE_SIZE = 40;
const GROUP_WINDOW_MS = 3 * 60 * 1000;

const newClientId = () => `c_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
const byTime = (a, b) => new Date(a.createdAt) - new Date(b.createdAt);
const addId = (list = [], id) => (list.some(x => String(x) === String(id)) ? list : [...list, id]);

// Insert/replace a server message, matching optimistic copies by clientId.
const reconcile = (list, incoming) => {
  const matches = (m) => m._id === incoming._id || (incoming.clientId && m.clientId === incoming.clientId);
  const existing = list.find(matches);
  if (!existing) return [...list, incoming].sort(byTime);
  const merged = { ...incoming, localUrl: existing.localUrl };
  return list.filter(m => m === existing || !matches(m)).map(m => (m === existing ? merged : m));
};

const mergeLists = (current, fresh) => fresh.reduce(reconcile, current).sort(byTime);

const replyShape = (message) => message && ({
  _id: message._id,
  text: message.text,
  messageType: message.messageType,
  sender: message.sender,
  media: message.media ? { url: message.media.url, mimeType: message.media.mimeType, name: message.media.name, duration: message.media.duration } : undefined,
  call: message.call
});

export default function ChatWindow({ conversation, onBack, onConversationCreated }) {
  const { user } = useAuth();
  const chat = useChat();
  const { socket, isOnline, lastSeen } = useSocket();
  const { startCall } = useCall();
  const myId = String(user._id);
  const other = chat.otherParticipant(conversation);
  const convId = String(conversation._id);
  const isTemp = convId.startsWith('temp');

  const [messages, setMessages] = useState([]);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(!isTemp);
  const [loadingOlder, setLoadingOlder] = useState(false);
  const [replyTo, setReplyTo] = useState(null);
  const [editing, setEditing] = useState(null);
  const [menu, setMenu] = useState(null);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [forwarding, setForwarding] = useState(null);
  const [viewer, setViewer] = useState(null);
  const [showInfo, setShowInfo] = useState(false);
  const [confirmClear, setConfirmClear] = useState(false);
  const [showJump, setShowJump] = useState(false);
  const [newBelow, setNewBelow] = useState(0);
  const [highlightId, setHighlightId] = useState(null);
  const [dragging, setDragging] = useState(false);

  const listRef = useRef(null);
  const composerRef = useRef(null);
  const nearBottomRef = useRef(true);
  const scrollModeRef = useRef('bottom'); // 'bottom' | 'smooth' | 'prepend' | null
  const prependRef = useRef(null);
  const convIdRef = useRef(convId);
  const isTempRef = useRef(isTemp);
  const creatingRef = useRef(null);
  const retryBodies = useRef(new Map());
  const readTimer = useRef(null);

  // Refs only move forward from temp → real (a stale render must not undo it).
  // Declared first so it runs before the other effects below.
  useLayoutEffect(() => {
    if (!isTemp) {
      isTempRef.current = false;
      convIdRef.current = convId;
    }
  }, [isTemp, convId]);

  const typingState = chat.typing[convId];
  const online = isOnline(other?._id);

  // ── Tell ChatContext which chat is open (for unread counters) ────
  useEffect(() => {
    chat.setActiveConversation(isTemp ? null : convId);
    return () => chat.setActiveConversation(null);
  }, [convId, isTemp, chat.setActiveConversation]); // eslint-disable-line react-hooks/exhaustive-deps

  const markReadSoon = useCallback(() => {
    clearTimeout(readTimer.current);
    readTimer.current = setTimeout(() => {
      if (document.visibilityState === 'visible' && !isTempRef.current) chat.markRead(convIdRef.current);
    }, 250);
  }, [chat.markRead]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Load latest page ─────────────────────────────────────────────
  const fetchLatest = useCallback(async ({ merge = false } = {}) => {
    if (isTempRef.current) return;
    const { data } = await axios.get(`/api/messages/${convIdRef.current}`, { params: { limit: PAGE_SIZE } });
    setMessages(prev => (merge ? mergeLists(prev, data.messages) : mergeLists(prev.filter(m => m.status), data.messages)));
    if (!merge) setHasMore(data.hasMore);
  }, []);

  useEffect(() => {
    if (isTemp) {
      setLoading(false);
      return;
    }
    let cancelled = false;
    // After the first message creates the chat we already have it on screen — no skeleton.
    if (!creatingRef.current) setLoading(true);
    scrollModeRef.current = 'bottom';
    fetchLatest()
      .catch(error => { if (!cancelled) toast.error(errorMessage(error, 'Could not load messages')); })
      .finally(() => { if (!cancelled) setLoading(false); });
    markReadSoon();
    return () => { cancelled = true; };
  }, [convId, isTemp, fetchLatest, markReadSoon]);

  // Back online after a drop → fetch what we missed (replaces the old 1.5s polling).
  useEffect(() => {
    if (!socket) return;
    let first = true;
    const onConnect = () => {
      if (first) { first = false; return; }
      fetchLatest({ merge: true }).catch(() => {});
      markReadSoon();
    };
    socket.on('connect', onConnect);
    return () => socket.off('connect', onConnect);
  }, [socket, fetchLatest, markReadSoon]);

  useEffect(() => {
    const onVisible = () => { if (document.visibilityState === 'visible') markReadSoon(); };
    document.addEventListener('visibilitychange', onVisible);
    window.addEventListener('focus', onVisible);
    return () => {
      document.removeEventListener('visibilitychange', onVisible);
      window.removeEventListener('focus', onVisible);
      clearTimeout(readTimer.current);
    };
  }, [markReadSoon]);

  const loadOlder = useCallback(async () => {
    if (loadingOlder || !hasMore || !messages.length) return;
    const oldest = messages.find(m => !m.status);
    if (!oldest) return;
    setLoadingOlder(true);
    try {
      const { data } = await axios.get(`/api/messages/${convIdRef.current}`, {
        params: { limit: PAGE_SIZE, before: oldest.createdAt }
      });
      const el = listRef.current;
      prependRef.current = el ? { height: el.scrollHeight, top: el.scrollTop } : null;
      scrollModeRef.current = 'prepend';
      setMessages(prev => mergeLists(prev, data.messages));
      setHasMore(data.hasMore);
    } catch {
      toast.error('Could not load older messages');
    } finally {
      setLoadingOlder(false);
    }
  }, [loadingOlder, hasMore, messages]);

  // ── Realtime ─────────────────────────────────────────────────────
  const inThisChat = (conversationId) => !isTempRef.current && String(conversationId) === convIdRef.current;

  const onNew = useCallback(({ message, conversationId }) => {
    if (!inThisChat(conversationId)) return;
    const incoming = String(message.sender?._id || message.sender) !== myId;
    scrollModeRef.current = incoming ? (nearBottomRef.current ? 'smooth' : null) : 'smooth';
    setMessages(prev => reconcile(prev, message));
    if (incoming) {
      markReadSoon();
      if (!nearBottomRef.current) setNewBelow(n => n + 1);
    }
  }, [myId, markReadSoon]);

  const onUpdated = useCallback(({ message, conversationId }) => {
    if (!inThisChat(conversationId)) return;
    scrollModeRef.current = null;
    setMessages(prev => prev.map(m => (m._id === message._id ? { ...message, localUrl: m.localUrl } : m)));
  }, []);

  const onRemoved = useCallback(({ messageId, conversationId }) => {
    if (!inThisChat(conversationId)) return;
    setMessages(prev => prev.filter(m => m._id !== messageId));
  }, []);

  const onReceipt = useCallback((field) => ({ conversationId, messageIds, userId }) => {
    if (!inThisChat(conversationId)) return;
    const ids = new Set(messageIds);
    scrollModeRef.current = null;
    setMessages(prev => prev.map(m => {
      if (!ids.has(m._id)) return m;
      const next = { ...m, deliveredTo: addId(m.deliveredTo, userId) };
      if (field === 'seen') next.seen = addId(m.seen, userId);
      return next;
    }));
  }, []);
  const onSeen = useMemo(() => onReceipt('seen'), [onReceipt]);
  const onDelivered = useMemo(() => onReceipt('delivered'), [onReceipt]);

  const onCleared = useCallback(({ conversationId }) => {
    if (inThisChat(conversationId)) setMessages([]);
  }, []);

  useSocketEvent('message:new', onNew);
  useSocketEvent('message:updated', onUpdated);
  useSocketEvent('message:removed', onRemoved);
  useSocketEvent('messages:seen', onSeen);
  useSocketEvent('messages:delivered', onDelivered);
  useSocketEvent('conversation:cleared', onCleared);

  // ── Scrolling ────────────────────────────────────────────────────
  useLayoutEffect(() => {
    const el = listRef.current;
    if (!el || loading) return;
    const mode = scrollModeRef.current;
    scrollModeRef.current = null;
    if (mode === 'prepend' && prependRef.current) {
      el.scrollTop = el.scrollHeight - prependRef.current.height + prependRef.current.top;
      prependRef.current = null;
    } else if (mode === 'bottom') {
      el.scrollTop = el.scrollHeight;
    } else if (mode === 'smooth') {
      el.scrollTo({ top: el.scrollHeight, behavior: 'smooth' });
    }
  }, [messages, loading]);

  // Typing bubble appearing at the bottom shouldn't hide the last message.
  useEffect(() => {
    if (typingState && nearBottomRef.current && listRef.current) {
      listRef.current.scrollTo({ top: listRef.current.scrollHeight, behavior: 'smooth' });
    }
  }, [typingState]);

  const onScroll = () => {
    const el = listRef.current;
    if (!el) return;
    const distance = el.scrollHeight - el.scrollTop - el.clientHeight;
    nearBottomRef.current = distance < 140;
    setShowJump(distance > 400);
    if (nearBottomRef.current && newBelow) setNewBelow(0);
    if (el.scrollTop < 240 && hasMore && !loadingOlder) loadOlder();
  };

  const scrollToBottom = () => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight, behavior: 'smooth' });
    setNewBelow(0);
  };

  const onMediaLoad = useCallback(() => {
    if (nearBottomRef.current && listRef.current) listRef.current.scrollTop = listRef.current.scrollHeight;
  }, []);

  const jumpTo = useCallback((messageId) => {
    const el = document.getElementById(`msg-${messageId}`);
    if (!el) {
      toast('That message is further up — scroll to load it');
      return;
    }
    el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    setHighlightId(messageId);
    setTimeout(() => setHighlightId(id => (id === messageId ? null : id)), 1600);
  }, []);

  // ── Sending ──────────────────────────────────────────────────────
  const postMessage = useCallback(async (body) => {
    if (isTempRef.current && creatingRef.current) {
      await creatingRef.current.catch(() => {});
    }
    if (isTempRef.current) {
      const request = axios.post('/api/messages/send', { ...body, receiverId: other._id });
      creatingRef.current = request;
      const { data } = await request;
      if (data.conversation) {
        isTempRef.current = false;
        convIdRef.current = String(data.conversation._id);
        chat.upsertConversation(data.conversation);
        onConversationCreated(data.conversation);
      }
      return data;
    }
    const { data } = await axios.post('/api/messages/send', { ...body, conversationId: convIdRef.current });
    return data;
  }, [other?._id, chat.upsertConversation, onConversationCreated]); // eslint-disable-line react-hooks/exhaustive-deps

  const addOptimistic = (message) => {
    scrollModeRef.current = 'smooth';
    setMessages(prev => [...prev, message]);
  };

  const patchLocal = (clientId, patch) => {
    setMessages(prev => prev.map(m => (m.clientId === clientId && m.status ? { ...m, ...patch } : m)));
  };

  const deliver = useCallback(async (clientId, body) => {
    retryBodies.current.set(clientId, body);
    try {
      const data = await postMessage({ ...body, clientId });
      retryBodies.current.delete(clientId);
      scrollModeRef.current = null;
      setMessages(prev => reconcile(prev, data.message));
      playSentSound();
    } catch (error) {
      patchLocal(clientId, { status: 'failed' });
      toast.error(errorMessage(error, 'Message not sent'));
    }
  }, [postMessage]);

  const optimisticBase = (extra) => {
    const clientId = newClientId();
    return {
      _id: clientId,
      clientId,
      status: 'pending',
      conversationId: convId,
      sender: { _id: myId, name: user.name },
      createdAt: new Date().toISOString(),
      seen: [myId],
      deliveredTo: [],
      reactions: [],
      replyTo: replyShape(replyTo),
      ...extra
    };
  };

  const sendText = (text) => {
    const message = optimisticBase({ text, messageType: 'text' });
    addOptimistic(message);
    setReplyTo(null);
    deliver(message.clientId, { text, messageType: 'text', replyTo: replyTo?._id });
  };

  const sendFile = async (file, caption, replyId) => {
    const kind = attachmentKind(file);
    const messageType = kind === 'audio' ? 'file' : kind;
    let blob = file;
    let meta = {};
    if (kind === 'image') {
      const compressed = await compressImage(file);
      blob = compressed.blob;
      meta = { width: compressed.width, height: compressed.height };
    } else if (kind === 'video') {
      meta = await readVideoMeta(file);
    }
    const localUrl = URL.createObjectURL(blob);
    const message = optimisticBase({
      text: caption,
      messageType,
      localUrl,
      uploadProgress: 0,
      media: { url: localUrl, mimeType: blob.type, name: file.name, size: blob.size, ...meta },
      replyTo: null
    });
    addOptimistic(message);
    try {
      let lastReported = 0;
      const uploaded = await uploadMedia(blob, {
        name: file.name,
        onProgress: (p) => {
          if (p - lastReported >= 0.04 || p === 1) {
            lastReported = p;
            patchLocal(message.clientId, { uploadProgress: p });
          }
        }
      });
      await deliver(message.clientId, {
        text: caption,
        messageType,
        replyTo: replyId,
        media: { ...uploaded, name: file.name, ...meta }
      });
    } catch (error) {
      patchLocal(message.clientId, { status: 'failed' });
      toast.error(errorMessage(error, 'Upload failed'));
    }
  };

  const sendFiles = async (files, caption) => {
    const replyId = replyTo?._id;
    setReplyTo(null);
    for (const [i, file] of files.entries()) {
      await sendFile(file, i === 0 ? caption : '', i === 0 ? replyId : undefined);
    }
  };

  const sendSticker = ({ url, width, height }) => {
    if (!url) return;
    const media = { url, mimeType: 'image/gif', width, height };
    const message = optimisticBase({ messageType: 'sticker', media });
    addOptimistic(message);
    setReplyTo(null);
    deliver(message.clientId, { messageType: 'sticker', media, replyTo: replyTo?._id });
  };

  const sendVoice = (blob, duration) => {
    const file = new File([blob], `voice-${Date.now()}.${blob.type.includes('mp4') ? 'm4a' : 'webm'}`, { type: blob.type });
    const localUrl = URL.createObjectURL(file);
    const message = optimisticBase({
      messageType: 'audio',
      localUrl,
      media: { url: localUrl, mimeType: file.type, duration, size: file.size }
    });
    const replyId = replyTo?._id;
    setReplyTo(null);
    addOptimistic(message);
    uploadMedia(file, { name: file.name })
      .then(uploaded => deliver(message.clientId, {
        messageType: 'audio',
        replyTo: replyId,
        media: { ...uploaded, duration: Math.round(duration * 10) / 10 }
      }))
      .catch(error => {
        patchLocal(message.clientId, { status: 'failed' });
        toast.error(errorMessage(error, 'Voice message not sent'));
      });
  };

  const retry = useCallback((message) => {
    const body = retryBodies.current.get(message.clientId);
    if (!body) {
      toast.error('Please send this again');
      setMessages(prev => prev.filter(m => m !== message));
      return;
    }
    patchLocal(message.clientId, { status: 'pending' });
    deliver(message.clientId, body);
  }, [deliver]);

  // ── Message actions ──────────────────────────────────────────────
  const submitEdit = async (text) => {
    const target = editing;
    setEditing(null);
    try {
      const { data } = await axios.patch(`/api/messages/${target._id}`, { text });
      onUpdated({ message: data, conversationId: convIdRef.current });
    } catch (error) {
      toast.error(errorMessage(error, 'Could not edit message'));
    }
  };

  const toggleReaction = useCallback(async (message, emoji) => {
    scrollModeRef.current = null;
    setMessages(prev => prev.map(m => {
      if (m._id !== message._id) return m;
      const mineBefore = m.reactions?.find(r => String(r.user) === myId);
      const rest = (m.reactions || []).filter(r => String(r.user) !== myId);
      return { ...m, reactions: mineBefore?.emoji === emoji ? rest : [...rest, { user: myId, emoji }] };
    }));
    try {
      await axios.post(`/api/messages/${message._id}/react`, { emoji });
    } catch (error) {
      toast.error(errorMessage(error, 'Could not react'));
    }
  }, [myId]);

  const deleteMessage = async (message, scope) => {
    setDeleteTarget(null);
    try {
      const { data } = await axios.delete(`/api/messages/${message._id}`, { params: { for: scope } });
      if (scope === 'me') setMessages(prev => prev.filter(m => m._id !== message._id));
      else onUpdated({ message: data, conversationId: convIdRef.current });
    } catch (error) {
      toast.error(errorMessage(error, 'Could not delete message'));
    }
  };

  const copyMessage = async (message) => {
    try {
      await navigator.clipboard.writeText(message.text);
      toast.success('Copied');
    } catch {
      toast.error('Could not copy');
    }
  };

  const openMenu = useCallback((message, point) => setMenu({ message, ...point }), []);
  const startReply = useCallback((message) => { setEditing(null); setReplyTo(message); }, []);
  const callBack = useCallback((type) => startCall(other, type), [startCall, other]);

  const onTyping = useCallback((type) => {
    if (!isTempRef.current) socket?.emit('typing', { conversationId: convIdRef.current, receiverId: other._id, type });
  }, [socket, other?._id]);
  const onStopTyping = useCallback(() => {
    if (!isTempRef.current) socket?.emit('typing:stop', { conversationId: convIdRef.current, receiverId: other._id });
  }, [socket, other?._id]);

  // ── Drag & drop files onto the chat (desktop) ────────────────────
  const onDragOver = (event) => {
    if (!event.dataTransfer?.types?.includes('Files')) return;
    event.preventDefault();
    setDragging(true);
  };
  const onDrop = (event) => {
    event.preventDefault();
    setDragging(false);
    composerRef.current?.openFiles(event.dataTransfer.files);
  };

  // ── Render helpers ───────────────────────────────────────────────
  const rows = useMemo(() => {
    const result = [];
    messages.forEach((message, i) => {
      const prev = messages[i - 1];
      if (!prev || !isSameDay(prev.createdAt, message.createdAt)) {
        result.push({ type: 'day', key: `day-${message.createdAt}`, label: formatDayLabel(message.createdAt) });
      }
      const sameSender = prev && String(prev.sender?._id || prev.sender) === String(message.sender?._id || message.sender);
      const grouped = !!(sameSender && isSameDay(prev.createdAt, message.createdAt)
        && new Date(message.createdAt) - new Date(prev.createdAt) < GROUP_WINDOW_MS
        && prev.messageType !== 'call' && message.messageType !== 'call');
      result.push({ type: 'msg', key: message.clientId || message._id, message, grouped });
    });
    return result;
  }, [messages]);

  if (!other) {
    return (
      <div className="chat-empty">
        <p>This conversation could not be loaded.</p>
        <button type="button" className="btn btn-primary" onClick={onBack}>Go back</button>
      </div>
    );
  }

  let statusLine;
  if (typingState) statusLine = <span className="is-typing">{typingState === 'recording' ? 'recording audio…' : 'typing…'}</span>;
  else if (online) statusLine = 'online';
  else statusLine = formatLastSeen(lastSeen[other._id] || other.lastSeen);

  return (
    <div
      className={`chat${showInfo ? ' has-info' : ''}`}
      onDragOver={onDragOver}
      onDragLeave={(e) => { if (e.currentTarget === e.target) setDragging(false); }}
      onDrop={onDrop}
    >
      <div className="chat-main">
        <header className="chat-header">
          <button type="button" className="icon-btn chat-back" onClick={onBack} aria-label="Back">
            <ArrowLeft size={22} />
          </button>
          <button type="button" className="chat-peer" onClick={() => setShowInfo(true)}>
            <Avatar user={other} size={42} online={online} />
            <span className="chat-peer-text">
              <strong>{other.name}</strong>
              <span className="chat-peer-status">{statusLine}</span>
            </span>
          </button>
          <div className="chat-header-actions">
            <button type="button" className="icon-btn" onClick={() => startCall(other, 'video')} aria-label="Video call" title="Video call">
              <Video size={22} />
            </button>
            <button type="button" className="icon-btn" onClick={() => startCall(other, 'audio')} aria-label="Voice call" title="Voice call">
              <Phone size={20} />
            </button>
            <Menu
              trigger={<EllipsisVertical size={20} />}
              items={[
                { icon: Info, label: 'Contact info', onClick: () => setShowInfo(true) },
                !isTemp && { icon: conversation.muted ? Bell : BellOff, label: conversation.muted ? 'Unmute notifications' : 'Mute notifications', onClick: () => chat.toggleMute(conversation) },
                !isTemp && { icon: conversation.pinned ? PinOff : Pin, label: conversation.pinned ? 'Unpin chat' : 'Pin chat', onClick: () => chat.togglePin(conversation) },
                !isTemp && { icon: Eraser, label: 'Clear chat', onClick: () => setConfirmClear(true), danger: true }
              ]}
            />
          </div>
        </header>

        <div className="chat-scroll" ref={listRef} onScroll={onScroll}>
          <div className="chat-thread">
            {loadingOlder && <div className="thread-loader"><span className="spinner spinner-sm" /></div>}
            {!loading && !hasMore && (
              <div className="thread-intro">
                <Avatar user={other} size={72} />
                <strong>{other.name}</strong>
                <span>{isTemp || messages.length === 0 ? `Say hi to ${other.name.split(' ')[0]} 👋` : 'This is the start of your conversation'}</span>
              </div>
            )}
            {loading ? (
              <div className="thread-skeleton">
                {[62, 40, 75, 30, 55, 45].map((w, i) => <span key={i} className={i % 2 ? 'is-mine' : ''} style={{ width: `${w}%` }} />)}
              </div>
            ) : rows.map(row => (row.type === 'day' ? (
              <div key={row.key} className="day-divider"><span>{row.label}</span></div>
            ) : (
              <Fragment key={row.key}>
                <MessageBubble
                  message={row.message}
                  mine={String(row.message.sender?._id || row.message.sender) === myId}
                  myId={myId}
                  sender={String(row.message.sender?._id || row.message.sender) === myId ? user : other}
                  grouped={row.grouped}
                  highlighted={highlightId === row.message._id}
                  onOpenMenu={openMenu}
                  onReply={startReply}
                  onJumpTo={jumpTo}
                  onOpenMedia={setViewer}
                  onRetry={retry}
                  onToggleReaction={toggleReaction}
                  onCallBack={callBack}
                  onMediaLoad={onMediaLoad}
                />
              </Fragment>
            )))}
            {typingState && (
              <div className="msg-row is-theirs typing-row">
                <div className="bubble is-theirs has-tail typing-bubble" aria-label={`${other.name} is typing`}>
                  <i /><i /><i />
                </div>
              </div>
            )}
          </div>
        </div>

        {showJump && (
          <button type="button" className="jump-bottom" onClick={scrollToBottom} aria-label="Scroll to latest">
            {newBelow > 0 && <span className="badge">{newBelow}</span>}
            <ArrowDown size={20} />
          </button>
        )}

        <Composer
          ref={composerRef}
          key={other._id}
          draftId={other._id}
          myId={myId}
          recipientName={other.name}
          replyTo={replyTo}
          onCancelReply={() => setReplyTo(null)}
          editing={editing}
          onCancelEdit={() => setEditing(null)}
          onSendText={sendText}
          onSubmitEdit={submitEdit}
          onSendFiles={sendFiles}
          onSendSticker={sendSticker}
          onSendVoice={sendVoice}
          onTyping={onTyping}
          onStopTyping={onStopTyping}
        />

        {dragging && (
          <div className="drop-overlay">
            <Upload size={36} />
            <span>Drop files to send to {other.name}</span>
          </div>
        )}
      </div>

      {showInfo && (
        <ContactPanel
          conversation={conversation}
          other={other}
          onClose={() => setShowInfo(false)}
          onCall={(type) => startCall(other, type)}
          onOpenMedia={setViewer}
          onToggleMute={() => chat.toggleMute(conversation)}
          onTogglePin={() => chat.togglePin(conversation)}
          onClear={() => setConfirmClear(true)}
        />
      )}

      {menu && (
        <MessageMenu
          menu={menu}
          myId={myId}
          onClose={() => setMenu(null)}
          onReact={toggleReaction}
          onReply={startReply}
          onCopy={copyMessage}
          onForward={setForwarding}
          onEdit={(message) => { setReplyTo(null); setEditing(message); }}
          onDelete={setDeleteTarget}
        />
      )}

      {deleteTarget && (
        <Dialog title="Delete message?" onClose={() => setDeleteTarget(null)}>
          <div className="dialog-actions">
            {String(deleteTarget.sender?._id || deleteTarget.sender) === myId && !deleteTarget.deleted && (
              <button type="button" className="btn btn-danger btn-block" onClick={() => deleteMessage(deleteTarget, 'everyone')}>Delete for everyone</button>
            )}
            <button type="button" className="btn btn-soft-danger btn-block" onClick={() => deleteMessage(deleteTarget, 'me')}>Delete for me</button>
            <button type="button" className="btn btn-ghost btn-block" onClick={() => setDeleteTarget(null)}>Cancel</button>
          </div>
        </Dialog>
      )}

      {confirmClear && (
        <Dialog title="Clear this chat?" onClose={() => setConfirmClear(false)}>
          <p className="dialog-text">Messages will be removed from this device for you. {other.name} will still see them.</p>
          <div className="dialog-actions">
            <button
              type="button"
              className="btn btn-danger btn-block"
              onClick={async () => {
                setConfirmClear(false);
                if (await chat.clearChat(convId)) setMessages([]);
              }}
            >
              Clear chat
            </button>
            <button type="button" className="btn btn-ghost btn-block" onClick={() => setConfirmClear(false)}>Cancel</button>
          </div>
        </Dialog>
      )}

      {forwarding && <ForwardDialog message={forwarding} onClose={() => setForwarding(null)} />}
      {viewer && (
        <MediaViewer
          message={viewer}
          senderName={String(viewer.sender?._id || viewer.sender) === myId ? 'You' : other.name}
          onClose={() => setViewer(null)}
        />
      )}
    </div>
  );
}
