import { Check, CheckCheck, CircleAlert, Clock3 } from 'lucide-react';
import { messageStatus } from '../../lib/messages';

export default function Ticks({ message, size = 16 }) {
  const status = messageStatus(message);
  const label = { pending: 'Sending', failed: 'Not sent', read: 'Read', delivered: 'Delivered', sent: 'Sent' }[status];
  const Icon = { pending: Clock3, failed: CircleAlert, read: CheckCheck, delivered: CheckCheck, sent: Check }[status];
  return (
    <span className={`ticks ticks-${status}`} title={label} aria-label={label}>
      <Icon size={status === 'pending' ? size - 3 : size} strokeWidth={2.4} />
    </span>
  );
}
