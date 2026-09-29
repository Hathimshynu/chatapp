import { useEffect, useState } from 'react';
import axios from 'axios';
import toast from 'react-hot-toast';
import { Ban, CheckCheck, ChevronRight, Clock, Image, Info, Radio } from 'lucide-react';
import { useChat } from '../../context/ChatContext';
import { errorMessage } from '../../lib/api';
import Avatar from '../common/Avatar';
import Dialog from '../common/Dialog';

const AUDIENCE = [
  { id: 'everyone', label: 'Everyone' },
  { id: 'contacts', label: 'My contacts' },
  { id: 'nobody', label: 'Nobody' }
];

const ROWS = [
  { key: 'lastSeen', label: 'Last seen', icon: Clock },
  { key: 'online', label: 'Online', icon: Radio },
  { key: 'profilePhoto', label: 'Profile photo', icon: Image },
  { key: 'about', label: 'About', icon: Info }
];

const labelOf = (value) => AUDIENCE.find(a => a.id === value)?.label || 'Everyone';

// Enforced on the server: these only change what others are sent.
export default function PrivacySettings() {
  const { setBlocked } = useChat();
  const [privacy, setPrivacy] = useState(null);
  const [editing, setEditing] = useState(null); // row key
  const [blocked, setBlockedList] = useState(null);
  const [showBlocked, setShowBlocked] = useState(false);

  useEffect(() => {
    let cancelled = false;
    axios.get('/api/users/privacy').then(({ data }) => { if (!cancelled) setPrivacy(data); }).catch(() => {});
    axios.get('/api/users/blocked').then(({ data }) => { if (!cancelled) setBlockedList(data); }).catch(() => {});
    return () => { cancelled = true; };
  }, []);

  const save = async (patch) => {
    const before = privacy;
    setPrivacy(p => ({ ...p, ...patch }));
    try {
      const { data } = await axios.put('/api/users/privacy', patch);
      setPrivacy(data);
    } catch (error) {
      setPrivacy(before);
      toast.error(errorMessage(error, 'Could not update privacy'));
    }
  };

  const unblock = async (person) => {
    if (await setBlocked(person._id, false)) {
      setBlockedList(list => list.filter(p => p._id !== person._id));
      toast.success(`${person.name} unblocked`);
    }
  };

  const row = ROWS.find(r => r.key === editing);

  return (
    <section className="settings-section">
      <h3>Privacy</h3>
      <div className="settings-list">
        {ROWS.map(({ key, label, icon: Icon }) => (
          <button key={key} type="button" className="settings-row" onClick={() => setEditing(key)} disabled={!privacy}>
            <span className="settings-row-icon"><Icon size={18} /></span>
            <span className="settings-row-text">{label}<small>{privacy ? labelOf(privacy[key]) : '…'}</small></span>
            <ChevronRight size={18} className="settings-row-chevron" aria-hidden="true" />
          </button>
        ))}
        <button
          type="button"
          className="settings-row"
          role="switch"
          aria-checked={!!privacy?.readReceipts}
          disabled={!privacy}
          onClick={() => save({ readReceipts: !privacy.readReceipts })}
        >
          <span className="settings-row-icon"><CheckCheck size={18} /></span>
          <span className="settings-row-text">
            Read receipts
            <small>If turned off, you won&apos;t send or receive read receipts in one-to-one chats. Groups always show them.</small>
          </span>
          <span className={`switch${privacy?.readReceipts ? ' is-on' : ''}`}><i /></span>
        </button>
        <button type="button" className="settings-row" onClick={() => setShowBlocked(true)}>
          <span className="settings-row-icon"><Ban size={18} /></span>
          <span className="settings-row-text">Blocked contacts<small>{blocked ? (blocked.length ? blocked.length : 'None') : '…'}</small></span>
          <ChevronRight size={18} className="settings-row-chevron" aria-hidden="true" />
        </button>
      </div>

      {row && privacy && (
        <Dialog title={`Who can see my ${row.label.toLowerCase()}`} onClose={() => setEditing(null)}>
          <div className="radio-list" role="radiogroup" aria-label={row.label}>
            {AUDIENCE.map(option => {
              const active = privacy[row.key] === option.id;
              return (
                <button
                  key={option.id}
                  type="button"
                  role="radio"
                  aria-checked={active}
                  className={`radio-row${active ? ' is-active' : ''}`}
                  onClick={() => { if (!active) save({ [row.key]: option.id }); setEditing(null); }}
                >
                  <span className="radio-dot" />
                  <span className="radio-text"><strong>{option.label}</strong></span>
                </button>
              );
            })}
          </div>
          <p className="dialog-text dialog-note">
            &quot;My contacts&quot; means people you have a one-to-one chat with. Blocked contacts never see it.
          </p>
        </Dialog>
      )}

      {showBlocked && (
        <Dialog title="Blocked contacts" onClose={() => setShowBlocked(false)}>
          {!blocked?.length ? (
            <p className="dialog-text">You haven&apos;t blocked anyone. Block someone from their chat menu or contact info.</p>
          ) : (
            <ul className="blocked-list">
              {blocked.map(person => (
                <li key={person._id}>
                  <Avatar user={person} size={40} />
                  <span className="blocked-name">{person.name}</span>
                  <button type="button" className="btn btn-sm btn-ghost" onClick={() => unblock(person)}>Unblock</button>
                </li>
              ))}
            </ul>
          )}
        </Dialog>
      )}
    </section>
  );
}
