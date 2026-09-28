import { useEffect, useMemo, useRef, useState } from 'react';
import axios from 'axios';
import { Download, Search, SquarePen, X } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { useChat } from '../../context/ChatContext';
import { useSocket } from '../../context/SocketContext';
import { useInstallPrompt } from '../../lib/pwa';
import Avatar from '../common/Avatar';
import ConversationItem from './ConversationItem';

const FILTERS = [
  { id: 'all', label: 'All' },
  { id: 'unread', label: 'Unread' },
  { id: 'online', label: 'Online' },
  { id: 'pinned', label: 'Pinned' }
];

const INSTALL_DISMISSED_KEY = 'chatInstallDismissed';

export default function ChatList({ activeConversationId, onOpenConversation, onOpenUser }) {
  const { user } = useAuth();
  const { conversations, loaded, typing, otherParticipant } = useChat();
  const { isOnline, connected } = useSocket();
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState('all');
  const [people, setPeople] = useState([]);
  const [searching, setSearching] = useState(false);
  const searchRef = useRef(null);
  const install = useInstallPrompt();
  const [installDismissed, setInstallDismissed] = useState(() => {
    try { return localStorage.getItem(INSTALL_DISMISSED_KEY) === '1'; } catch { return false; }
  });

  const trimmed = query.trim().toLowerCase();

  // Search everyone on ChatApp (debounced).
  useEffect(() => {
    if (!trimmed) {
      setPeople([]);
      setSearching(false);
      return;
    }
    setSearching(true);
    const controller = new AbortController();
    const timer = setTimeout(async () => {
      try {
        const { data } = await axios.get('/api/users/search', { params: { query: trimmed }, signal: controller.signal });
        setPeople(data);
      } catch {
        // aborted or failed — keep previous results
      } finally {
        setSearching(false);
      }
    }, 250);
    return () => { clearTimeout(timer); controller.abort(); };
  }, [trimmed]);

  const rows = useMemo(() => conversations.map(c => ({ conversation: c, other: otherParticipant(c) })), [conversations, otherParticipant]);

  const visible = useMemo(() => rows.filter(({ conversation, other }) => {
    if (trimmed && !`${other?.name || ''} ${other?.email || ''}`.toLowerCase().includes(trimmed)) return false;
    if (filter === 'unread') return conversation.unreadCount > 0;
    if (filter === 'online') return isOnline(other?._id);
    if (filter === 'pinned') return conversation.pinned;
    return true;
  }), [rows, trimmed, filter, isOnline]);

  const knownIds = useMemo(() => new Set(rows.map(r => String(r.other?._id))), [rows]);
  const newPeople = people.filter(p => !knownIds.has(String(p._id)));
  const unreadChats = rows.filter(r => r.conversation.unreadCount > 0).length;

  const dismissInstall = () => {
    setInstallDismissed(true);
    try { localStorage.setItem(INSTALL_DISMISSED_KEY, '1'); } catch { /* ignore */ }
  };

  return (
    <div className="panel">
      <header className="panel-header">
        <div>
          <h1>Chats</h1>
          {!connected && <p className="panel-subtitle is-connecting">Connecting…</p>}
        </div>
        <div className="panel-actions">
          <button type="button" className="icon-btn" title="New chat" aria-label="New chat" onClick={() => searchRef.current?.focus()}>
            <SquarePen size={20} />
          </button>
        </div>
      </header>

      {install.canInstall && !installDismissed && (
        <div className="install-card">
          <img src="/icons/icon-192.png" alt="" />
          <div>
            <strong>Get the ChatApp app</strong>
            <span>Install for a faster, full-screen experience.</span>
          </div>
          <button type="button" className="btn btn-primary btn-sm" onClick={install.install}>
            <Download size={16} /> Install
          </button>
          <button type="button" className="icon-btn icon-btn-sm" aria-label="Dismiss" onClick={dismissInstall}>
            <X size={16} />
          </button>
        </div>
      )}

      <div className="search-box">
        <Search size={18} />
        <input
          ref={searchRef}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search chats or people"
          aria-label="Search chats or people"
          enterKeyHint="search"
        />
        {query && (
          <button type="button" className="icon-btn icon-btn-sm" onClick={() => setQuery('')} aria-label="Clear search">
            <X size={16} />
          </button>
        )}
      </div>

      {!trimmed && (
        <div className="chips" role="tablist">
          {FILTERS.map(f => (
            <button
              key={f.id}
              type="button"
              role="tab"
              aria-selected={filter === f.id}
              className={`chip${filter === f.id ? ' is-active' : ''}`}
              onClick={() => setFilter(f.id)}
            >
              {f.label}
              {f.id === 'unread' && unreadChats > 0 && <span className="chip-count">{unreadChats}</span>}
            </button>
          ))}
        </div>
      )}

      <div className="panel-scroll">
        {!loaded ? (
          <div className="skeleton-list">
            {Array.from({ length: 7 }).map((_, i) => (
              <div key={i} className="skeleton-row"><span className="sk-avatar" /><span className="sk-lines"><i /><i /></span></div>
            ))}
          </div>
        ) : (
          <>
            {visible.map(({ conversation, other }) => (
              <ConversationItem
                key={conversation._id}
                conversation={conversation}
                other={other}
                myId={user._id}
                active={String(activeConversationId) === String(conversation._id)}
                online={isOnline(other?._id)}
                typing={typing[conversation._id]}
                onClick={() => onOpenConversation(conversation)}
              />
            ))}

            {trimmed && (
              <>
                <div className="list-section">People on ChatApp</div>
                {newPeople.map(person => (
                  <button key={person._id} type="button" className="conv-item" onClick={() => { setQuery(''); onOpenUser(person); }}>
                    <Avatar user={person} size={52} online={isOnline(person._id)} />
                    <span className="conv-body">
                      <span className="conv-row"><span className="conv-name">{person.name}</span></span>
                      <span className="conv-row"><span className="conv-preview"><span className="conv-preview-text">{person.status || person.email}</span></span></span>
                    </span>
                  </button>
                ))}
                {!searching && newPeople.length === 0 && visible.length === 0 && (
                  <p className="empty-hint">No chats or people match “{query.trim()}”.</p>
                )}
                {searching && <p className="empty-hint">Searching…</p>}
              </>
            )}

            {!trimmed && visible.length === 0 && (
              <div className="empty-state">
                <div className="empty-icon"><SquarePen size={28} /></div>
                <h3>{filter === 'all' ? 'No chats yet' : `No ${filter} chats`}</h3>
                <p>{filter === 'all' ? 'Search for a friend by name or email to start chatting.' : 'Try another filter.'}</p>
                {filter === 'all' && (
                  <button type="button" className="btn btn-primary" onClick={() => searchRef.current?.focus()}>Start a new chat</button>
                )}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
