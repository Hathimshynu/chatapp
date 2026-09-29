import { memo, useRef } from 'react';
import {
  Ban, ChevronDown, Download, FileText, Forward, Phone, PhoneIncoming, PhoneMissed, PhoneOutgoing, Play, Reply, RotateCw, Video
} from 'lucide-react';
import Ticks from '../common/Ticks';
import Avatar from '../common/Avatar';
import AudioPlayer from './AudioPlayer';
import { mediaUrl } from '../../lib/api';
import { messageMedia } from '../../lib/messages';
import { STATUS_BACKGROUNDS } from '../../lib/status';
import {
  fileExtension, formatBytes, formatDuration, formatTime, jumboEmojiCount, messagePreview, splitLinks
} from '../../lib/format';

const SWIPE_TRIGGER = 64;
const LONG_PRESS_MS = 420;

function RichText({ text }) {
  return splitLinks(text).map((part, i) => (part.href
    ? <a key={i} href={part.href} target="_blank" rel="noopener noreferrer" onClick={(e) => e.stopPropagation()}>{part.text}</a>
    : <span key={i}>{part.text}</span>));
}

function ReplyQuote({ reply, myId, onJump }) {
  const mine = String(reply.sender?._id || reply.sender) === String(myId);
  const thumb = !reply.deleted && reply.messageType === 'image' && reply.media?.url;
  return (
    <button type="button" className="reply-quote" onClick={(e) => { e.stopPropagation(); onJump(reply._id); }}>
      <span className="reply-quote-body">
        <strong>{mine ? 'You' : reply.sender?.name || 'Message'}</strong>
        <span>{reply.deleted ? 'This message was deleted' : messagePreview(reply, myId)}</span>
      </span>
      {thumb && <img src={mediaUrl(reply.media.url)} alt="" />}
    </button>
  );
}

// Quote shown on a reply/reaction to someone's status.
function StatusQuote({ statusRef, mine, ownerName }) {
  return (
    <div className="reply-quote status-quote">
      <span className="reply-quote-body">
        <strong>{mine ? `${ownerName} · Status` : 'You · Status'}</strong>
        <span>{statusRef.text || (statusRef.type === 'video' ? 'Video' : 'Photo')}</span>
      </span>
      {statusRef.type === 'image' && statusRef.mediaUrl
        ? <img src={mediaUrl(statusRef.mediaUrl)} alt="" onError={(e) => { e.currentTarget.style.display = 'none'; }} />
        : statusRef.type === 'text' && <span className="status-quote-swatch" style={{ background: STATUS_BACKGROUNDS[statusRef.background] || STATUS_BACKGROUNDS.violet }} />}
    </div>
  );
}

function CallLog({ message, mine, onCallBack }) {
  const { type = 'audio', status, duration } = message.call || {};
  const missed = !mine && status !== 'completed';
  const Icon = type === 'video' ? Video : missed ? PhoneMissed : mine ? PhoneOutgoing : PhoneIncoming;
  const kind = type === 'video' ? 'Video call' : 'Voice call';
  let detail;
  if (status === 'completed') detail = formatDuration(duration);
  else if (mine) detail = status === 'declined' ? 'Declined' : status === 'busy' ? 'Busy' : 'No answer';
  else detail = status === 'declined' ? 'Declined' : 'Tap to call back';

  return (
    <button type="button" className={`call-log${missed ? ' is-missed' : ''}`} onClick={(e) => { e.stopPropagation(); onCallBack(type); }}>
      <span className="call-log-icon"><Icon size={20} /></span>
      <span className="call-log-text">
        <strong>{missed ? `Missed ${type === 'video' ? 'video' : 'voice'} call` : kind}</strong>
        <span>{detail}</span>
      </span>
      <span className="call-log-action">{type === 'video' ? <Video size={18} /> : <Phone size={18} />}</span>
    </button>
  );
}

function MessageBubble({
  message, mine, myId, grouped, highlighted, sender, isGroup, showSender, senderColor, peerName,
  onOpenMenu, onReply, onJumpTo, onOpenMedia, onRetry, onToggleReaction, onCallBack, onMediaLoad
}) {
  const rowRef = useRef(null);
  const touch = useRef(null);
  const type = message.messageType || 'text';
  const media = messageMedia(message);
  const deleted = message.deleted;
  const isSticker = type === 'sticker' && !deleted;
  const isVisual = (type === 'image' || type === 'video') && media && !deleted;
  const jumbo = type === 'text' && !deleted ? jumboEmojiCount(message.text) : 0;
  const hasCaption = isVisual && message.text;
  const pending = message.status === 'pending';
  const failed = message.status === 'failed';
  const interactive = !pending && !failed && !deleted;

  // ── Touch: swipe right to reply, long-press for the menu ─────────
  const onTouchStart = (event) => {
    const t = event.touches[0];
    touch.current = { x: t.clientX, y: t.clientY, dx: 0, timer: null, horizontal: null };
    rowRef.current.style.transition = 'none'; // follow the finger 1:1
    if (interactive) {
      touch.current.timer = setTimeout(() => {
        touch.current.longPress = true;
        navigator.vibrate?.(12);
        onOpenMenu(message, { x: t.clientX, y: t.clientY });
      }, LONG_PRESS_MS);
    }
  };
  const onTouchMove = (event) => {
    const state = touch.current;
    if (!state) return;
    const t = event.touches[0];
    const dx = t.clientX - state.x;
    const dy = t.clientY - state.y;
    if (Math.abs(dx) > 8 || Math.abs(dy) > 8) clearTimeout(state.timer);
    if (state.horizontal === null && (Math.abs(dx) > 8 || Math.abs(dy) > 8)) state.horizontal = Math.abs(dx) > Math.abs(dy);
    if (state.horizontal && dx > 0 && interactive) {
      state.dx = Math.min(dx, 96);
      rowRef.current.style.transform = `translateX(${state.dx}px)`;
      rowRef.current.classList.toggle('swipe-ready', state.dx > SWIPE_TRIGGER);
    }
  };
  const onTouchEnd = () => {
    const state = touch.current;
    if (!state) return;
    clearTimeout(state.timer);
    if (state.dx > SWIPE_TRIGGER) {
      navigator.vibrate?.(8);
      onReply(message);
    }
    if (rowRef.current) {
      rowRef.current.style.transition = '';
      rowRef.current.style.transform = '';
      rowRef.current.classList.remove('swipe-ready');
    }
    touch.current = null;
  };

  const openMenuFromEvent = (event) => {
    if (!interactive) return;
    event.preventDefault();
    event.stopPropagation();
    if (event.type === 'contextmenu' && touch.current) return; // long-press already handled
    const rect = event.currentTarget.getBoundingClientRect();
    onOpenMenu(message, event.type === 'contextmenu'
      ? { x: event.clientX, y: event.clientY }
      : { x: mine ? rect.right : rect.left, y: rect.bottom });
  };

  const reactions = Object.values((message.reactions || []).reduce((acc, r) => {
    acc[r.emoji] = acc[r.emoji] || { emoji: r.emoji, count: 0, mine: false };
    acc[r.emoji].count += 1;
    if (String(r.user) === String(myId)) acc[r.emoji].mine = true;
    return acc;
  }, {}));

  const meta = (
    <span className="bubble-meta">
      {message.edited && !deleted && <span className="bubble-edited">Edited</span>}
      <time>{formatTime(message.createdAt)}</time>
      {mine && !deleted && <Ticks message={message} size={16} />}
    </span>
  );

  let content;
  if (deleted) {
    content = (
      <p className="bubble-text is-deleted">
        <Ban size={15} /> {mine ? 'You deleted this message' : 'This message was deleted'}
        <span className="meta-spacer" />
      </p>
    );
  } else if (type === 'call') {
    content = <CallLog message={message} mine={mine} onCallBack={onCallBack} />;
  } else if (isSticker && media) {
    content = <img className="sticker" src={mediaUrl(media.url)} alt="Sticker" loading="lazy" onLoad={onMediaLoad} draggable="false" />;
  } else if (isVisual) {
    const ratio = media.width && media.height ? media.width / media.height : null;
    content = (
      <>
        <button
          type="button"
          className={`bubble-media${type === 'video' ? ' is-video' : ''}`}
          style={ratio ? { aspectRatio: Math.min(Math.max(ratio, 0.6), 1.9) } : undefined}
          onClick={(e) => { e.stopPropagation(); if (!pending) onOpenMedia(message); }}
        >
          {type === 'image'
            ? <img src={mediaUrl(media.url)} alt={message.text || 'Photo'} loading="lazy" onLoad={onMediaLoad} draggable="false" />
            : <video src={mediaUrl(media.url)} preload="metadata" muted playsInline onLoadedData={onMediaLoad} />}
          {type === 'video' && !pending && (
            <span className="bubble-play"><Play size={26} fill="currentColor" />{media.duration ? <em>{formatDuration(media.duration)}</em> : null}</span>
          )}
          {pending && (
            <span className="upload-overlay">
              <span className="upload-ring" style={{ '--p': message.uploadProgress || 0 }} />
            </span>
          )}
        </button>
        {hasCaption && <p className="bubble-text"><RichText text={message.text} /><span className="meta-spacer" /></p>}
      </>
    );
  } else if (type === 'audio' && media) {
    content = <AudioPlayer src={mediaUrl(media.url)} knownDuration={media.duration} seed={message._id} sender={sender} mine={mine} />;
  } else if (type === 'file' && media) {
    content = (
      <>
        <a
          className="file-card"
          href={pending ? undefined : mediaUrl(media.url)}
          target="_blank"
          rel="noopener noreferrer"
          download={media.name || true}
          onClick={(e) => e.stopPropagation()}
        >
          <span className="file-icon"><FileText size={22} /><em>{fileExtension(media.name)}</em></span>
          <span className="file-info">
            <strong>{media.name || 'Document'}</strong>
            <span>{[formatBytes(media.size), fileExtension(media.name)].filter(Boolean).join(' · ')}</span>
          </span>
          <span className="file-download">
            {pending ? <span className="upload-ring small" style={{ '--p': message.uploadProgress || 0 }} /> : <Download size={18} />}
          </span>
        </a>
        {message.text && <p className="bubble-text"><RichText text={message.text} /><span className="meta-spacer" /></p>}
      </>
    );
  } else {
    content = (
      <p className={`bubble-text${jumbo ? ` is-jumbo jumbo-${jumbo}` : ''}`}>
        <RichText text={message.text} />
        <span className="meta-spacer" />
      </p>
    );
  }

  const bubbleClass = [
    'bubble',
    mine ? 'is-mine' : 'is-theirs',
    grouped ? 'is-grouped' : 'has-tail',
    isSticker ? 'is-sticker' : '',
    isVisual && !hasCaption ? 'is-media-only' : '',
    isVisual ? 'has-media' : '',
    type === 'audio' ? 'is-voice' : '',
    type === 'call' ? 'is-call' : '',
    jumbo ? 'is-jumbo' : '',
    message.edited && !deleted ? 'is-edited' : '',
    highlighted ? 'is-highlighted' : ''
  ].filter(Boolean).join(' ');

  const groupAvatar = isGroup && !mine;
  return (
    <div
      id={`msg-${message._id}`}
      className={`msg-row ${mine ? 'is-mine' : 'is-theirs'}${grouped ? ' is-grouped' : ''}${groupAvatar ? ' has-avatar' : ''}`}
    >
      {groupAvatar && (
        <span className="msg-avatar" aria-hidden="true">
          {showSender && <Avatar user={sender} name={message.sender?.name} size={30} />}
        </span>
      )}
      <div
        ref={rowRef}
        className="msg-swipe"
        onTouchStart={onTouchStart}
        onTouchMove={onTouchMove}
        onTouchEnd={onTouchEnd}
        onTouchCancel={onTouchEnd}
      >
        <span className="swipe-reply-hint" aria-hidden="true"><Reply size={16} /></span>
        <div className={bubbleClass} onContextMenu={openMenuFromEvent} onDoubleClick={() => interactive && onReply(message)}>
          {groupAvatar && showSender && (
            <span className="bubble-sender" style={{ color: senderColor }}>{message.sender?.name || 'Former member'}</span>
          )}
          {message.statusRef && !deleted && <StatusQuote statusRef={message.statusRef} mine={mine} ownerName={peerName} />}
          {message.forwarded && !deleted && (
            <span className="bubble-forwarded"><Forward size={13} /> Forwarded</span>
          )}
          {message.replyTo && !deleted && <ReplyQuote reply={message.replyTo} myId={myId} onJump={onJumpTo} />}
          {content}
          {type !== 'call' && meta}
          {type === 'call' && <span className="bubble-meta"><time>{formatTime(message.createdAt)}</time></span>}
          {interactive && (
            <button type="button" className="bubble-caret" onClick={openMenuFromEvent} aria-label="Message options">
              <ChevronDown size={18} />
            </button>
          )}
        </div>
        {failed && (
          <button type="button" className="retry-btn" onClick={() => onRetry(message)}>
            <RotateCw size={14} /> Not sent · Tap to retry
          </button>
        )}
      </div>
      {reactions.length > 0 && (
        <div className={`reactions${groupAvatar ? ' has-avatar' : ''}`}>
          {reactions.map(r => (
            <button
              key={r.emoji}
              type="button"
              className={`reaction${r.mine ? ' is-mine' : ''}`}
              onClick={() => onToggleReaction(message, r.emoji)}
              aria-label={`${r.emoji} ${r.count}`}
            >
              <span>{r.emoji}</span>{r.count > 1 && <em>{r.count}</em>}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export default memo(MessageBubble);
