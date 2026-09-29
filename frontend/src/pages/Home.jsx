import { useCallback, useEffect, useMemo, useState } from 'react';
import { Download, Lock, MessageCircle, Phone, Sparkles, Video } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useChat } from '../context/ChatContext';
import Sidebar from '../components/sidebar/Sidebar';
import ChatWindow from '../components/chat/ChatWindow';
import { OPEN_CONVERSATION_EVENT, useInstallPrompt } from '../lib/pwa';
import toast from 'react-hot-toast';
import { useBackClose } from '../lib/backStack';
import { PENDING_OPEN_KEY } from '../lib/messages';

function Welcome() {
  const install = useInstallPrompt();
  return (
    <div className="welcome">
      <div className="welcome-art" aria-hidden="true">
        <span className="orb o1" /><span className="orb o2" />
        <div className="welcome-card c1"><MessageCircle size={22} /> Hey! Are we still on for tonight?</div>
        <div className="welcome-card c2 is-mine">Absolutely 🎉 Video call at 8?</div>
        <div className="welcome-card c3"><Video size={18} /> HD video call · 12:48</div>
      </div>
      <h2>ChatApp for everyone</h2>
      <p>Send messages, photos, voice notes and documents, and make HD voice & video calls — on any device.</p>
      <div className="welcome-features">
        <span><Sparkles size={16} /> Instant delivery</span>
        <span><Phone size={16} /> HD calls</span>
        <span><Lock size={16} /> Private chats</span>
      </div>
      {install.canInstall && (
        <button type="button" className="btn btn-primary" onClick={install.install}><Download size={18} /> Install the app</button>
      )}
    </div>
  );
}

export default function Home() {
  const { user } = useAuth();
  const chat = useChat();
  const [view, setView] = useState('chats');
  // { id, snapshot, focusMessageId? } for real chats, { temp } for a new direct chat
  const [selected, setSelected] = useState(null);

  const current = useMemo(() => {
    if (!selected) return null;
    if (selected.temp) return selected.temp;
    return chat.conversations.find(c => String(c._id) === selected.id) || selected.snapshot;
  }, [selected, chat.conversations]);

  // Phone back button / swipe-back closes the open chat instead of leaving the app
  // (shared back stack: status viewer → group info → chat → list).
  useBackClose(!!selected, () => setSelected(null));
  const closeChat = useCallback(() => setSelected(null), []);

  const openConversation = useCallback((conversation, options = {}) => {
    setSelected({ id: String(conversation._id), snapshot: conversation, focusMessageId: options.focusMessageId });
    setView('chats');
  }, []);

  const openUser = useCallback((person) => {
    const existing = chat.conversations.find(c =>
      !c.isGroup && c.participants?.some(p => String(p._id) === String(person._id)));
    if (existing) {
      openConversation(existing);
      return;
    }
    setSelected({
      temp: {
        _id: `temp_${person._id}`,
        isGroup: false,
        participants: [
          { _id: user._id, name: user.name, email: user.email, avatar: user.avatar, status: user.status },
          { _id: person._id, name: person.name, email: person.email, avatar: person.avatar, status: person.status, lastSeen: person.lastSeen }
        ],
        lastMessage: null,
        unreadCount: 0
      }
    });
    setView('chats');
  }, [chat.conversations, openConversation, user]);

  const onConversationCreated = useCallback((conversation) => {
    setSelected({ id: String(conversation._id), snapshot: conversation });
  }, []);

  const onFocusHandled = useCallback(() => {
    setSelected(s => (s?.focusMessageId ? { ...s, focusMessageId: undefined } : s));
  }, []);

  // Removed from / left / deleted the open group → close it with an explanation.
  useEffect(() => {
    const removal = chat.removal;
    if (!removal || selected?.id !== removal.conversationId) return;
    setSelected(null);
    const reasons = { removed: 'You were removed from this group', deleted: 'This group was deleted', left: 'You left the group' };
    toast(reasons[removal.reason] || 'This chat is no longer available');
  }, [chat.removal]); // eslint-disable-line react-hooks/exhaustive-deps

  // After joining via an invite link, open that group once it is in the list.
  useEffect(() => {
    let pending = null;
    try { pending = sessionStorage.getItem(PENDING_OPEN_KEY); } catch { /* ignore */ }
    if (!pending || !chat.loaded) return;
    const conversation = chat.conversations.find(c => String(c._id) === pending);
    if (conversation) {
      try { sessionStorage.removeItem(PENDING_OPEN_KEY); } catch { /* ignore */ }
      openConversation(conversation);
    }
  }, [chat.loaded, chat.conversations, openConversation]);

  // Tapping a notification opens that chat.
  useEffect(() => {
    const onOpen = (event) => {
      const conversation = chat.conversations.find(c => String(c._id) === String(event.detail));
      if (conversation) openConversation(conversation);
    };
    window.addEventListener(OPEN_CONVERSATION_EVENT, onOpen);
    return () => window.removeEventListener(OPEN_CONVERSATION_EVENT, onOpen);
  }, [chat.conversations, openConversation]);

  const other = current ? chat.otherParticipant(current) : null;
  const chatKey = current?.isGroup ? `g_${current._id}` : other?._id;

  return (
    <div className={`app-shell${current ? ' chat-open' : ''}`}>
      <Sidebar
        view={view}
        onViewChange={setView}
        activeConversationId={current?._id}
        onOpenConversation={openConversation}
        onOpenUser={openUser}
      />
      <main className="chat-pane">
        {current && (other || current.isGroup) ? (
          <ChatWindow
            key={chatKey}
            conversation={current}
            onBack={closeChat}
            onConversationCreated={onConversationCreated}
            onOpenUser={openUser}
            focusMessageId={selected?.focusMessageId}
            onFocusHandled={onFocusHandled}
          />
        ) : (
          <Welcome />
        )}
      </main>
    </div>
  );
}
