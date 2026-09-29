import { memo } from 'react';
import { BellOff, Camera, FileText, Mic, Phone, PhoneMissed, Pin, Sticker, Users, Video } from 'lucide-react';
import Avatar from '../common/Avatar';
import Ticks from '../common/Ticks';
import { formatListTime, messagePreview, typingLabel } from '../../lib/format';

const TYPE_ICONS = { image: Camera, video: Video, audio: Mic, file: FileText, sticker: Sticker };

function ConversationItem({ conversation, other, myId, active, online, typing, onClick }) {
  const isGroup = !!conversation.isGroup;
  const last = conversation.lastMessage;
  const mine = last && String(last.sender?._id || last.sender) === String(myId);
  const unread = conversation.unreadCount || 0;
  const isSystem = last?.messageType === 'system';
  const missedCall = last?.messageType === 'call' && !mine && last.call?.status !== 'completed';
  const TypeIcon = last && !last.deleted && !isSystem
    ? (last.messageType === 'call' ? (missedCall ? PhoneMissed : Phone) : TYPE_ICONS[last.messageType])
    : null;
  const title = isGroup ? conversation.name : other?.name || 'Unknown';
  const typingText = typing
    ? typingLabel(typing, id => conversation.participants?.find(p => String(p._id) === String(id))?.name, isGroup)
    : '';

  // In groups the preview is "John: 📷 Photo"; the icon sits after the sender name.
  const preview = last ? messagePreview(last, myId, { group: isGroup && !isSystem }) : (isGroup ? 'Group created' : 'Tap to start chatting');
  const splitAt = isGroup && !isSystem && last && last.messageType !== 'call' ? preview.indexOf(': ') : -1;

  return (
    <button
      type="button"
      className={`conv-item${active ? ' is-active' : ''}${unread ? ' is-unread' : ''}`}
      onClick={onClick}
      aria-label={`${isGroup ? 'Group chat' : 'Direct chat'} ${title}${unread ? `, ${unread} unread` : ''}`}
    >
      <span className="conv-avatar">
        <Avatar user={isGroup ? { _id: conversation._id, name: title } : other} src={isGroup ? conversation.avatar : undefined} size={52} online={!isGroup && online} />
        {isGroup && <span className="group-badge" title="Group chat"><Users size={11} strokeWidth={2.6} /></span>}
      </span>
      <span className="conv-body">
        <span className="conv-row">
          <span className="conv-name">{title}</span>
          <span className="conv-time">{formatListTime(last?.createdAt || conversation.updatedAt)}</span>
        </span>
        <span className="conv-row">
          {typingText ? (
            <span className="conv-preview is-typing">{typingText}</span>
          ) : (
            <span className={`conv-preview${missedCall ? ' is-missed' : ''}${isSystem ? ' is-system' : ''}`}>
              {mine && !isSystem && last.messageType !== 'call' && !last.deleted && <Ticks message={last} size={15} />}
              {splitAt > 0 ? (
                <>
                  <span className="conv-sender">{preview.slice(0, splitAt + 1)}</span>
                  {TypeIcon && <TypeIcon size={15} className="conv-type-icon" />}
                  <span className="conv-preview-text">{preview.slice(splitAt + 2)}</span>
                </>
              ) : (
                <>
                  {TypeIcon && <TypeIcon size={15} className="conv-type-icon" />}
                  <span className="conv-preview-text">{preview}</span>
                </>
              )}
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
