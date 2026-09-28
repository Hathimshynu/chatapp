import { createPortal } from 'react-dom';
import { PhoneOff, Video, Phone } from 'lucide-react';
import CallTimer from './CallTimer';

// Floating pill so you can keep chatting during a call.
export default function MinimizedCall({ call, onRestore, onEnd }) {
  const Icon = call.type === 'video' ? Video : Phone;
  return createPortal(
    <div className="call-pill" role="status">
      <button type="button" className="call-pill-main" onClick={onRestore}>
        <span className="call-pill-dot" />
        <Icon size={16} />
        <span className="call-pill-name">{call.peer?.name}</span>
        <span className="call-pill-time">
          {call.status === 'active' && call.startedAt ? <CallTimer startedAt={call.startedAt} /> : call.status === 'outgoing' ? 'Ringing…' : 'Connecting…'}
        </span>
      </button>
      <button type="button" className="call-pill-end" onClick={onEnd} aria-label="End call">
        <PhoneOff size={16} />
      </button>
    </div>,
    document.body
  );
}
