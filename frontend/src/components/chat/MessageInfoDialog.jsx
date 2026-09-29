import { useEffect, useState } from 'react';
import axios from 'axios';
import { CheckCheck } from 'lucide-react';
import Dialog from '../common/Dialog';
import Avatar from '../common/Avatar';
import { errorMessage } from '../../lib/api';
import { formatDayLabel, formatTime } from '../../lib/format';

const when = (value) => (typeof value === 'string' ? `${formatDayLabel(value)}, ${formatTime(value)}` : '');

function Section({ title, icon, rows, field, empty }) {
  return (
    <section className="info-section">
      <h4>{icon}{title}</h4>
      {rows.length ? rows.map(r => (
        <div key={r.user._id} className="info-row">
          <Avatar user={r.user} size={38} />
          <span className="info-name">{r.user.name}</span>
          <time>{when(r[field])}</time>
        </div>
      )) : <p className="empty-hint left">{empty}</p>}
    </section>
  );
}

// "Read by / Delivered to" for one of your messages (group or direct).
export default function MessageInfoDialog({ messageId, onClose }) {
  const [info, setInfo] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    axios.get(`/api/messages/${messageId}/info`)
      .then(({ data }) => setInfo(data))
      .catch(err => setError(errorMessage(err, 'Could not load message info')));
  }, [messageId]);

  const read = info?.recipients.filter(r => r.readAt) || [];
  const delivered = info?.recipients.filter(r => r.deliveredAt && !r.readAt) || [];
  const pending = info?.recipients.filter(r => !r.deliveredAt) || [];

  return (
    <Dialog title="Message info" onClose={onClose}>
      {error && <p className="empty-hint">{error}</p>}
      {!info && !error && <p className="empty-hint">Loading…</p>}
      {info && (
        <>
          <Section title="Read by" icon={<CheckCheck size={16} className="ticks-read" />} rows={read} field="readAt" empty="Nobody yet" />
          <Section title="Delivered to" icon={<CheckCheck size={16} />} rows={delivered} field="deliveredAt" empty={read.length ? 'Everyone else has read it' : 'Nobody yet'} />
          {pending.length > 0 && (
            <p className="info-pending">Waiting for {pending.map(r => r.user.name.split(' ')[0]).join(', ')}</p>
          )}
          <p className="info-sent">Sent {when(info.sentAt)}</p>
        </>
      )}
    </Dialog>
  );
}
