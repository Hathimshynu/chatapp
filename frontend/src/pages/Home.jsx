import { useCallback, useEffect, useMemo, useState } from 'react';
import { Download, Lock, MessageCircle, Phone, Sparkles, Video } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useChat } from '../context/ChatContext';
import Sidebar from '../components/sidebar/Sidebar';
import ChatWindow from '../components/chat/ChatWindow';
import { OPEN_CONVERSATION_EVENT, useInstallPrompt } from '../lib/pwa';
import useLatest from '../hooks/useLatest';

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
  const [selected, setSelected] = useState(null); // { id, snapshot } for real chats, { temp } for a new one
  const selectedRef = useLatest(selected);

  const current = useMemo(() => {
    if (!selected) return null;
    if (selected.temp) return selected.temp;
    return chat.conversations.find(c => String(c._id) === selected.id) || selected.snapshot;
  }, [selected, chat.conversations]);

  // Phone back button / swipe-back closes the open chat instead of leaving the app.
  const select = useCallback((next) => {
    if (next && !selectedRef.current) window.history.pushState({ chatOpen: true }, '');
    setSelected(next);
  }, [selectedRef]);

  useEffect(() => {
    const onPop = () => { if (selectedRef.current) setSelected(null); };
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, [selectedRef]);

  const closeChat = useCallback(() => {
    if (window.history.state?.chatOpen) window.history.back();
    else setSelected(null);
  }, []);

  const openConversation = useCallback((conversation) => {
    select({ id: String(conversation._id), snapshot: conversation });
  }, [select]);

  const openUser = useCallback((person) => {
    const existing = chat.conversations.find(c =>
      !c.isGroup && c.participants?.some(p => String(p._id) === String(person._id)));
    if (existing) {
      openConversation(existing);
      return;
    }
    select({
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
  }, [chat.conversations, openConversation, select, user]);

  const onConversationCreated = useCallback((conversation) => {
    setSelected({ id: String(conversation._id), snapshot: conversation });
  }, []);

  // Tapping a notification opens that chat.
  useEffect(() => {
    const onOpen = (event) => {
      const conversation = chat.conversations.find(c => String(c._id) === String(event.detail));
      if (conversation) {
        setView('chats');
        openConversation(conversation);
      }
    };
    window.addEventListener(OPEN_CONVERSATION_EVENT, onOpen);
    return () => window.removeEventListener(OPEN_CONVERSATION_EVENT, onOpen);
  }, [chat.conversations, openConversation]);

  const other = current ? chat.otherParticipant(current) : null;

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
        {current && other ? (
          <ChatWindow
            key={other._id}
            conversation={current}
            onBack={closeChat}
            onConversationCreated={onConversationCreated}
          />
        ) : (
          <Welcome />
        )}
      </main>
    </div>
  );
}
