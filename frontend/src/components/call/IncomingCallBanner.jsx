import { createPortal } from 'react-dom';
import { Phone, PhoneOff, Users, Video } from 'lucide-react';
import Avatar from '../common/Avatar';

export default function IncomingCallBanner({ call, onAccept, onReject, group = false }) {
  const isVideo = call.type === 'video';
  const kind = `Incoming ${group ? 'group ' : ''}${isVideo ? 'video' : 'voice'} call`;
  return createPortal(
    <div className="incoming-banner" role="alertdialog" aria-label={`${kind}: ${call.peer?.name}`}>
      <div className="incoming-banner-avatar">
        <span className="ring r1" />
        <Avatar user={call.peer} size={56} />
      </div>
      <div className="incoming-banner-info">
        <span className="incoming-banner-kind">
          {group ? <Users size={14} /> : isVideo ? <Video size={14} /> : <Phone size={14} />}
          {kind}
        </span>
        <strong>{call.peer?.name}</strong>
        {call.subtitle && <span className="incoming-banner-sub">{call.subtitle}</span>}
      </div>
      <div className="incoming-banner-actions">
        <button type="button" className="call-btn end small" onClick={onReject} aria-label="Decline">
          <PhoneOff size={20} />
        </button>
        <button type="button" className="call-btn accept small" onClick={onAccept} aria-label={group ? 'Join' : 'Accept'}>
          {isVideo ? <Video size={20} /> : <Phone size={20} />}
        </button>
      </div>
    </div>,
    document.body
  );
}
