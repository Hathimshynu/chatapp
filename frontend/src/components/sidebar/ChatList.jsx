import { lazy, Suspense, useEffect, useMemo, useRef, useState } from 'react';
import axios from 'axios';
import { Archive, ArrowLeft, Download, Search, SquarePen, Users, X } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { useChat } from '../../context/ChatContext';
import { useSocket } from '../../context/SocketContext';
import { useInstallPrompt } from '../../lib/pwa';
import { formatListTime, messagePreview } from '../../lib/format';
import Avatar from '../common/Avatar';
import ConversationItem from './ConversationItem';
import { useBackClose } from '../../lib/backStack';
import { useFriends } from '../../context/FriendsContext';

const RELATION_LABEL = { friends: 'Friend', outgoing: 'Request sent', incoming: 'Wants to be friends' };

const NewGroupDialog = lazy(() => import('./NewGroupDialog'));

const FILTERS = [
  { id: 'all', label: 'All' },
  { id: 'unread', label: 'Unread' },
  { id: 'groups', label: 'Groups' },
  { id: 'online', label: 'Online' },
  { id: 'pinned', label: 'Pinned' }
];

const INSTALL_DISMISSED_KEY = 'chatInstallDismissed';
const EMPTY_RESULTS = { users: [], groups: [], messages: [] };

// Wrap the matched part of a snippet in <mark> (plain string compare — no regex).
function Highlight({ text, query }) {
  const index = query ? text.toLowerCase().indexOf(query) : -1;
  if (index < 0) return text;
  return <>{text.slice(0, index)}<mark>{text.slice(index, index + query.length)}</mark>{text.slice(index + query.length)}</>;
}

export default function ChatList({ activeConversationId, onOpenConversation, onOpenUser }) {
  const { user } = useAuth();
  const { conversations, loaded, typing, otherParticipant, archivedUnread } = useChat();
  const { relationOf } = useFriends();
  const { isOnline, connected } = useSocket();
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState('all');
  const [results, setResults] = useState(EMPTY_RESULTS);
  const [searching, setSearching] = useState(false);
  const [newGroup, setNewGroup] = useState(false);
  const [showArchived, setShowArchived] = useState(false);
  useBackClose(showArchived, () => setShowArchived(false));
  const searchRef = useRef(null);
  const install = useInstallPrompt();
  const [installDismissed, setInstallDismissed] = useState(() => {
    try { return localStorage.getItem(INSTALL_DISMISSED_KEY) === '1'; } catch { return false; }
  });

  const trimmed = query.trim().toLowerCase();

  // Server-side search across people, my groups and my messages (debounced).
  useEffect(() => {
    if (!trimmed) {
      setResults(EMPTY_RESULTS);
      setSearching(false);
      return;
    }
    setSearching(true);
    const controller = new AbortController();
    const timer = setTimeout(async () => {
      try {
        const { data } = await axios.get('/api/search', { params: { q: trimmed }, signal: controller.signal });
        setResults(data);
      } catch {
        // aborted or failed — keep previous results
      } finally {
        setSearching(false);
      }
    }, 250);
    return () => { clearTimeout(timer); controller.abort(); };
  }, [trimmed]);

  const rows = useMemo(() => conversations.map(c => ({
    conversation: c,
    other: otherParticipant(c),
    title: (c.isGroup ? c.name : otherParticipant(c)?.name) || ''
  })), [conversations, otherParticipant]);

  const visible = useMemo(() => rows.filter(({ conversation, other, title }) => {
    if (trimmed) return `${title} ${other?.email || ''}`.toLowerCase().includes(trimmed); // search covers archived too
    if (showArchived) return !!conversation.archived;
    if (conversation.archived) return false;
    if (filter === 'unread') return conversation.unreadCount > 0;
    if (filter === 'groups') return conversation.isGroup;
    if (filter === 'online') return !conversation.isGroup && isOnline(other?._id);
    if (filter === 'pinned') return conversation.pinned;
    return true;
  }), [rows, trimmed, filter, isOnline, showArchived]);
  const archivedCount = rows.filter(r => r.conversation.archived).length;

  const byId = useMemo(() => new Map(rows.map(r => [String(r.conversation._id), r])), [rows]);
  const knownPeople = useMemo(() => new Set(rows.filter(r => r.other).map(r => String(r.other._id))), [rows]);
  const shownIds = new Set(visible.map(r => String(r.conversation._id)));
  const newPeople = results.users.filter(p => !knownPeople.has(String(p._id)));
  const extraGroups = results.groups.filter(g => !shownIds.has(String(g._id)) && byId.has(String(g._id)));
  const unreadChats = rows.filter(r => r.conversation.unreadCount > 0 && !r.conversation.archived).length;
  const nothingFound = !searching && !visible.length && !newPeople.length && !extraGroups.length && !results.messages.length;

  const dismissInstall = () => {
    setInstallDismissed(true);
    try { localStorage.setItem(INSTALL_DISMISSED_KEY, '1'); } catch { /* ignore */ }
  };

  const openResult = (conversationId, focusMessageId) => {
    const row = byId.get(String(conversationId));
    if (!row) return;
    setQuery('');
    onOpenConversation(row.conversation, focusMessageId ? { focusMessageId } : undefined);
  };

  return (
    <div className="panel">
      <header className="panel-header">
        <div className="panel-title-row">
          {showArchived && (
            <button type="button" className="icon-btn" onClick={() => setShowArchived(false)} aria-label="Back to chats"><ArrowLeft size={22} /></button>
          )}
          <h1>{showArchived ? 'Archived' : 'Chats'}</h1>
          {!connected && <p className="panel-subtitle is-connecting">Connecting…</p>}
        </div>
        <div className="panel-actions">
          <button type="button" className="icon-btn" title="New group" aria-label="New group" onClick={() => setNewGroup(true)}>
            <Users size={20} />
          </button>
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
          placeholder="Search chats, groups, people or messages"
          aria-label="Search chats, groups, people or messages"
          enterKeyHint="search"
        />
        {query && (
          <button type="button" className="icon-btn icon-btn-sm" onClick={() => setQuery('')} aria-label="Clear search">
            <X size={16} />
          </button>
        )}
      </div>

      {!trimmed && !showArchived && (
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
            {!trimmed && !showArchived && filter === 'all' && archivedCount > 0 && (
              <button type="button" className="conv-item archived-row" onClick={() => setShowArchived(true)}>
                <span className="archived-icon"><Archive size={20} /></span>
                <span className="conv-body">
                  <span className="conv-row">
                    <span className="conv-name">Archived</span>
                    {archivedUnread > 0 && <span className="badge" aria-label={`${archivedUnread} unread`}>{archivedUnread}</span>}
                  </span>
                </span>
                <span className="archived-count">{archivedCount}</span>
              </button>
            )}
            {showArchived && !trimmed && (
              <p className="archived-hint">Archived chats stay here when new messages arrive. Open a chat's menu to unarchive it.</p>
            )}
            {trimmed && visible.length > 0 && <div className="list-section">Chats</div>}
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
                {extraGroups.length > 0 && <div className="list-section">Groups</div>}
                {extraGroups.map(group => (
                  <button key={group._id} type="button" className="conv-item" onClick={() => openResult(group._id)}>
                    <span className="conv-avatar">
                      <Avatar user={{ _id: group._id, name: group.name }} src={group.avatar} size={52} />
                      <span className="group-badge"><Users size={11} strokeWidth={2.6} /></span>
                    </span>
                    <span className="conv-body">
                      <span className="conv-row"><span className="conv-name">{group.name}</span></span>
                      <span className="conv-row"><span className="conv-preview"><span className="conv-preview-text">
                        {group.matchedMember ? <>Member: <Highlight text={group.matchedMember} query={trimmed} /></> : `${group.memberCount} members`}
                      </span></span></span>
                    </span>
                  </button>
                ))}

                {newPeople.length > 0 && <div className="list-section">People on ChatApp</div>}
                {newPeople.map(person => (
                  <button key={person._id} type="button" className="conv-item" onClick={() => { setQuery(''); onOpenUser(person); }}>
                    <Avatar user={person} size={52} online={isOnline(person._id)} />
                    <span className="conv-body">
                      <span className="conv-row">
                        <span className="conv-name"><Highlight text={person.name} query={trimmed} /></span>
                        {RELATION_LABEL[relationOf(person._id).state] && (
                          <span className="relation-chip">{RELATION_LABEL[relationOf(person._id).state]}</span>
                        )}
                      </span>
                      <span className="conv-row"><span className="conv-preview"><span className="conv-preview-text">{person.status || person.email}</span></span></span>
                    </span>
                  </button>
                ))}

                {results.messages.length > 0 && <div className="list-section">Messages</div>}
                {results.messages.map(message => {
                  const row = byId.get(String(message.conversationId));
                  if (!row) return null;
                  const { conversation, other, title } = row;
                  const text = messagePreview(message, user._id, { group: conversation.isGroup });
                  return (
                    <button key={message._id} type="button" className="conv-item search-hit" onClick={() => openResult(conversation._id, message._id)}>
                      <Avatar user={conversation.isGroup ? { _id: conversation._id, name: title } : other} src={conversation.isGroup ? conversation.avatar : undefined} size={44} />
                      <span className="conv-body">
                        <span className="conv-row">
                          <span className="conv-name">{title}</span>
                          <span className="conv-time">{formatListTime(message.createdAt)}</span>
                        </span>
                        <span className="conv-row"><span className="conv-preview"><span className="conv-preview-text"><Highlight text={text} query={trimmed} /></span></span></span>
                      </span>
                    </button>
                  );
                })}

                {searching && <p className="empty-hint">Searching…</p>}
                {nothingFound && <p className="empty-hint">Nothing matches “{query.trim()}”.</p>}
              </>
            )}

            {!trimmed && showArchived && visible.length === 0 && (
              <div className="empty-state">
                <div className="empty-icon"><Archive size={28} /></div>
                <h3>No archived chats</h3>
                <p>Archive a chat from its menu to tidy up your list.</p>
              </div>
            )}
            {!trimmed && !showArchived && visible.length === 0 && (
              <div className="empty-state">
                <div className="empty-icon">{filter === 'groups' ? <Users size={28} /> : <SquarePen size={28} />}</div>
                <h3>{filter === 'all' ? 'No chats yet' : `No ${filter === 'groups' ? 'groups' : `${filter} chats`}`}</h3>
                <p>{filter === 'groups' ? 'Create a group to chat with several people at once.' : filter === 'all' ? 'Search for a friend by name or email to start chatting.' : 'Try another filter.'}</p>
                {filter === 'all' && (
                  <button type="button" className="btn btn-primary" onClick={() => searchRef.current?.focus()}>Start a new chat</button>
                )}
                {filter === 'groups' && (
                  <button type="button" className="btn btn-primary" onClick={() => setNewGroup(true)}><Users size={18} /> New group</button>
                )}
              </div>
            )}
          </>
        )}
      </div>

      {newGroup && (
        <Suspense fallback={null}>
          <NewGroupDialog
            onClose={() => setNewGroup(false)}
            onCreated={(conversation) => { setNewGroup(false); onOpenConversation(conversation); }}
          />
        </Suspense>
      )}
    </div>
  );
}
