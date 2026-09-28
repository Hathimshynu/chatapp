import { useMemo, useState } from 'react';
import axios from 'axios';
import toast from 'react-hot-toast';
import { Check, Search, SendHorizontal } from 'lucide-react';
import { useChat } from '../../context/ChatContext';
import Dialog from '../common/Dialog';
import Avatar from '../common/Avatar';
import { errorMessage } from '../../lib/api';

const MAX_TARGETS = 5;

export default function ForwardDialog({ message, onClose }) {
  const { conversations, otherParticipant } = useChat();
  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState([]);
  const [sending, setSending] = useState(false);

  const rows = useMemo(() => conversations
    .map(c => ({ conversation: c, other: otherParticipant(c) }))
    .filter(({ other }) => other && other.name.toLowerCase().includes(query.trim().toLowerCase())),
  [conversations, otherParticipant, query]);

  const toggle = (id) => setSelected(prev => {
    if (prev.includes(id)) return prev.filter(x => x !== id);
    if (prev.length >= MAX_TARGETS) {
      toast(`You can forward to up to ${MAX_TARGETS} chats`);
      return prev;
    }
    return [...prev, id];
  });

  const send = async () => {
    setSending(true);
    const body = {
      text: message.text || '',
      messageType: message.messageType,
      media: message.media,
      forwarded: true
    };
    try {
      await Promise.all(selected.map(conversationId => axios.post('/api/messages/send', { ...body, conversationId })));
      toast.success(selected.length > 1 ? `Forwarded to ${selected.length} chats` : 'Message forwarded');
      onClose();
    } catch (error) {
      toast.error(errorMessage(error, 'Could not forward'));
    } finally {
      setSending(false);
    }
  };

  return (
    <Dialog
      title="Forward to…"
      onClose={onClose}
      footer={(
        <button type="button" className="btn btn-primary btn-block" disabled={!selected.length || sending} onClick={send}>
          <SendHorizontal size={18} /> {sending ? 'Sending…' : `Send${selected.length ? ` (${selected.length})` : ''}`}
        </button>
      )}
    >
      <div className="search-box in-dialog">
        <Search size={18} />
        <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search chats" autoFocus={window.matchMedia('(pointer: fine)').matches} />
      </div>
      <div className="pick-list">
        {rows.map(({ conversation, other }) => {
          const checked = selected.includes(conversation._id);
          return (
            <button key={conversation._id} type="button" className={`pick-row${checked ? ' is-checked' : ''}`} onClick={() => toggle(conversation._id)}>
              <Avatar user={other} size={42} />
              <span className="pick-name">{other.name}</span>
              <span className="pick-check">{checked && <Check size={16} strokeWidth={3} />}</span>
            </button>
          );
        })}
        {!rows.length && <p className="empty-hint">No chats found</p>}
      </div>
    </Dialog>
  );
}
