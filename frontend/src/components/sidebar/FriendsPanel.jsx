import { useEffect, useState } from 'react';
import axios from 'axios';
import { MessageCircle, Search, UserPlus, Users, X } from 'lucide-react';
import { useFriends } from '../../context/FriendsContext';
import { useProfile } from '../../context/ProfileContext';
import { useSocket } from '../../context/SocketContext';
import Avatar from '../common/Avatar';
import FriendButton from '../friends/FriendButton';
import { formatListTime } from '../../lib/format';

// A person row: tapping it opens their profile; buttons on the right act directly.
function PersonRow({ person, subtitle, children }) {
  const { openProfile } = useProfile();
  const { isOnline } = useSocket();
  const open = () => openProfile(person);
  return (
    <div
      className="conv-item person-row"
      role="button"
      tabIndex={0}
      onClick={open}
      onKeyDown={(e) => { if (e.key === 'Enter' && e.target === e.currentTarget) open(); }}
      aria-label={`${person.name} — view profile`}
    >
      <Avatar user={person} size={48} online={isOnline(person._id)} />
      <span className="conv-body">
        <span className="conv-name">{person.name}</span>
        {subtitle && <span className="conv-preview">{subtitle}</span>}
      </span>
      <span className="person-actions">{children}</span>
    </div>
  );
}

export default function FriendsPanel({ onOpenUser }) {
  const { friends, incoming, outgoing, loaded, relationOf, dismissed } = useFriends();
  const [suggested, setSuggested] = useState([]);
  const [query, setQuery] = useState('');
  const [found, setFound] = useState({ query: '', users: [] });
  const trimmed = query.trim();
  // Results belong to one query; while a new one is loading we show "Searching…".
  const results = found.query === trimmed ? found.users : null;

  // Search everyone on ChatApp by name or email (no phone number needed).
  useEffect(() => {
    if (!trimmed) return undefined;
    let cancelled = false;
    const timer = setTimeout(() => {
      axios.get('/api/users/search', { params: { query: trimmed } })
        .then(({ data }) => { if (!cancelled) setFound({ query: trimmed, users: data }); })
        .catch(() => { if (!cancelled) setFound({ query: trimmed, users: [] }); });
    }, 250);
    return () => { cancelled = true; clearTimeout(timer); };
  }, [trimmed]);

  // "People you may know": refreshed when your friends change. Rows stay after you tap
  // Add friend (the button turns into Cancel request) and drop out once you're friends.
  useEffect(() => {
    let cancelled = false;
    axios.get('/api/friends/suggestions')
      .then(({ data }) => { if (!cancelled && Array.isArray(data)) setSuggested(data); })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [friends.length]);
  const suggestions = suggested
    .filter(p => !['friends', 'incoming'].includes(relationOf(p._id).state) && !dismissed.has(String(p._id)))
    .slice(0, 8);

  const message = (person) => (e) => { e.stopPropagation(); onOpenUser(person); };

  return (
    <div className="panel">
      <header className="panel-header"><h1>Friends</h1></header>
      <div className="search-box">
        <Search size={18} aria-hidden="true" />
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search people by name or email"
          aria-label="Search people"
          enterKeyHint="search"
        />
        {query && <button type="button" className="icon-btn icon-btn-sm" onClick={() => setQuery('')} aria-label="Clear search"><X size={16} /></button>}
      </div>

      <div className="panel-scroll">
        {trimmed ? (
          results === null ? <p className="empty-hint">Searching…</p>
            : results.length === 0 ? <p className="empty-hint">No one found for “{trimmed}”.</p>
              : (
                <>
                  <div className="list-section">People</div>
                  {results.map(person => (
                    <PersonRow key={person._id} person={person} subtitle={person.email}>
                      <FriendButton user={person} />
                    </PersonRow>
                  ))}
                </>
              )
        ) : (
          <>
            {incoming.length > 0 && (
              <>
                <div className="list-section">Friend requests <span className="count-pill">{incoming.length}</span></div>
                {incoming.map(({ requestId, user, sentAt }) => (
                  <PersonRow key={requestId} person={user} subtitle={`Sent ${formatListTime(sentAt)}`}>
                    <FriendButton user={user} />
                  </PersonRow>
                ))}
              </>
            )}

            {outgoing.length > 0 && (
              <>
                <div className="list-section">Sent requests</div>
                {outgoing.map(({ requestId, user }) => (
                  <PersonRow key={requestId} person={user} subtitle="Waiting for a reply">
                    <FriendButton user={user} />
                  </PersonRow>
                ))}
              </>
            )}

            {friends.length > 0 && (
              <>
                <div className="list-section">Friends · {friends.length}</div>
                {friends.map(friend => (
                  <PersonRow key={friend._id} person={friend} subtitle={friend.status || friend.email}>
                    <button type="button" className="icon-btn" onClick={message(friend)} aria-label={`Message ${friend.name}`}>
                      <MessageCircle size={20} />
                    </button>
                  </PersonRow>
                ))}
              </>
            )}

            {suggestions.length > 0 && (
              <>
                <div className="list-section">People you may know</div>
                {suggestions.map(person => (
                  <PersonRow
                    key={person._id}
                    person={person}
                    subtitle={person.mutualFriends > 0
                      ? `${person.mutualFriends} mutual friend${person.mutualFriends > 1 ? 's' : ''}`
                      : 'In your chats or groups'}
                  >
                    <FriendButton user={person} />
                  </PersonRow>
                ))}
              </>
            )}

            {loaded && !friends.length && !incoming.length && !outgoing.length && !suggestions.length && (
              <div className="empty-state">
                <div className="empty-icon"><Users size={28} /></div>
                <h3>Find your friends</h3>
                <p>Search by name or email above and send a friend request. When they accept, they&apos;ll show up here.</p>
              </div>
            )}
            {!loaded && <p className="empty-hint">Loading…</p>}
            {loaded && friends.length > 0 && (
              <p className="friends-hint"><UserPlus size={14} /> Search above to add more friends.</p>
            )}
          </>
        )}
      </div>
    </div>
  );
}
