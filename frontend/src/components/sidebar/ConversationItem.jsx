import { memo } from 'react';
import { BellOff, Camera, FileText, Mic, Phone, PhoneMissed, Pin, Sticker, Video } from 'lucide-react';
import Avatar from '../common/Avatar';
import Ticks from '../common/Ticks';
import { formatListTime, messagePreview } from '../../lib/format';

const TYPE_ICONS = { image: Camera, video: Video, audio: Mic, file: FileText, sticker: Sticker };

function ConversationItem({ conversation, other, myId, active, online, typing, onClick }) {
  const last = conversation.lastMessage;
  const mine = last && String(last.sender?._id || last.sender) === String(myId);
  const unread = conversation.unreadCount || 0;
  const missedCall = last?.messageType === 'call' && !mine && last.call?.status !== 'completed';
  const TypeIcon = last && !last.deleted
    ? (last.messageType === 'call' ? (missedCall ? PhoneMissed : Phone) : TYPE_ICONS[last.messageType])
    : null;

  return (
    <button
      type="button"
      className={`conv-item${active ? ' is-active' : ''}${unread ? ' is-unread' : ''}`}
      onClick={onClick}
    >
      <Avatar user={other} size={52} online={online} />
      <span className="conv-body">
        <span className="conv-row">
          <span className="conv-name">{other?.name || 'Unknown'}</span>
          <span className="conv-time">{formatListTime(last?.createdAt || conversation.updatedAt)}</span>
        </span>
        <span className="conv-row">
          {typing ? (
            <span className="conv-preview is-typing">{typing === 'recording' ? 'recording audio…' : 'typing…'}</span>
          ) : (
            <span className={`conv-preview${missedCall ? ' is-missed' : ''}`}>
              {mine && last.messageType !== 'call' && !last.deleted && <Ticks message={last} size={15} />}
              {TypeIcon && <TypeIcon size={15} className="conv-type-icon" />}
              <span className="conv-preview-text">{last ? messagePreview(last, myId) : 'Tap to start chatting'}</span>
            </span>
          )}
          <span className="conv-flags">
            {conversation.muted && <BellOff size={15} aria-label="Muted" />}
            {conversation.pinned && <Pin size={15} aria-label="Pinned" />}
            {unread > 0 && <span className={`badge${conversation.muted ? ' is-muted' : ''}`}>{unread > 99 ? '99+' : unread}</span>}
          </span>
        </span>
      </span>
    </button>
  );
}

export default memo(ConversationItem);
