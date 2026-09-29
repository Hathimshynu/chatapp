import { useEffect, useMemo, useState } from 'react';
import axios from 'axios';
import { Check, Search, X } from 'lucide-react';
import Avatar from './Avatar';

// Multi-select list of people. Shows `suggestions` (your contacts) by default and
// searches everyone when you type (unless `searchable` is false).
export default function UserPicker({ selected, onChange, suggestions = [], excludeIds = [], searchable = true, max = 255, placeholder = 'Search name or email' }) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState([]);
  const trimmed = query.trim();
  const excluded = useMemo(() => new Set(excludeIds.map(String)), [excludeIds]);
  const selectedIds = useMemo(() => new Set(selected.map(u => String(u._id))), [selected]);

  useEffect(() => {
    if (!searchable || !trimmed) return undefined;
    const controller = new AbortController();
    const timer = setTimeout(() => {
      axios.get('/api/users/search', { params: { query: trimmed }, signal: controller.signal })
        .then(({ data }) => setResults(data))
        .catch(() => {});
    }, 250);
    return () => { clearTimeout(timer); controller.abort(); };
  }, [trimmed, searchable]);

  const list = (searchable && trimmed
    ? results
    : suggestions.filter(u => !trimmed || u.name.toLowerCase().includes(trimmed.toLowerCase()))
  ).filter(u => !excluded.has(String(u._id)));

  const toggle = (user) => {
    if (selectedIds.has(String(user._id))) onChange(selected.filter(u => String(u._id) !== String(user._id)));
    else if (selected.length < max) onChange([...selected, user]);
  };

  return (
    <div className="user-picker">
      {selected.length > 0 && (
        <div className="picked-chips">
          {selected.map(user => (
            <button key={user._id} type="button" className="picked-chip" onClick={() => toggle(user)} aria-label={`Remove ${user.name}`}>
              <Avatar user={user} size={24} />
              <span>{user.name.split(' ')[0]}</span>
              <X size={14} />
            </button>
          ))}
        </div>
      )}
      <div className="search-box in-dialog">
        <Search size={18} />
        <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder={placeholder} aria-label={placeholder} />
      </div>
      <div className="pick-list">
        {list.map(user => {
          const checked = selectedIds.has(String(user._id));
          return (
            <button key={user._id} type="button" className={`pick-row${checked ? ' is-checked' : ''}`} onClick={() => toggle(user)}>
              <Avatar user={user} size={42} />
              <span className="pick-name">
                {user.name}
                {user.status && <small>{user.status}</small>}
              </span>
              <span className="pick-check">{checked && <Check size={16} strokeWidth={3} />}</span>
            </button>
          );
        })}
        {!list.length && <p className="empty-hint">{trimmed ? 'No people found' : 'Search for people by name or email'}</p>}
      </div>
    </div>
  );
}
