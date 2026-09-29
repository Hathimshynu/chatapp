import { useState } from 'react';
import Dialog from '../common/Dialog';
import UserPicker from '../common/UserPicker';
import useContacts from '../../hooks/useContacts';

const MODES = [
  { id: 'contacts', label: 'My contacts', hint: 'Everyone you have a direct chat with' },
  { id: 'except', label: 'My contacts except…', hint: 'Hide from selected contacts' },
  { id: 'only', label: 'Only share with…', hint: 'Only selected contacts' }
];

// Who can see my status. The server re-validates the list against my contacts.
// (Label/persistence helpers live in lib/status.js.)
export default function VisibilityDialog({ value, onChange, onClose }) {
  const contacts = useContacts();
  const [mode, setMode] = useState(value.mode);
  const [users, setUsers] = useState(value.users);
  const invalid = mode === 'only' && !users.length;

  return (
    <Dialog
      title="Status privacy"
      onClose={onClose}
      wide
      footer={(
        <button type="button" className="btn btn-primary btn-block" disabled={invalid} onClick={() => { onChange({ mode, users: mode === 'contacts' ? [] : users }); onClose(); }}>
          Done
        </button>
      )}
    >
      <div className="radio-list" role="radiogroup" aria-label="Who can see my status">
        {MODES.map(m => (
          <button key={m.id} type="button" role="radio" aria-checked={mode === m.id} className={`radio-row${mode === m.id ? ' is-active' : ''}`} onClick={() => setMode(m.id)}>
            <span className="radio-dot" />
            <span className="radio-text"><strong>{m.label}</strong><small>{m.hint}</small></span>
          </button>
        ))}
      </div>
      {mode !== 'contacts' && (
        contacts.length
          ? <UserPicker selected={users} onChange={setUsers} suggestions={contacts} searchable={false} placeholder="Search contacts" />
          : <p className="empty-hint">You have no contacts yet — start a chat with someone first.</p>
      )}
    </Dialog>
  );
}
