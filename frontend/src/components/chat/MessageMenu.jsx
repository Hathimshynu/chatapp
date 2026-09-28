import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Copy, Download, Forward, Pencil, Reply, Trash2 } from 'lucide-react';
import { mediaUrl } from '../../lib/api';
import { messageMedia } from '../../lib/messages';

const QUICK_REACTIONS = ['👍', '❤️', '😂', '😮', '😢', '🙏'];
const EDIT_WINDOW_MS = 15 * 60 * 1000;

// Floating menu next to the message on desktop; bottom sheet on phones (see chat.css).
export default function MessageMenu({ menu, myId, onClose, onReact, onReply, onCopy, onForward, onEdit, onDelete }) {
  const { message, x, y } = menu;
  const ref = useRef(null);
  const [openedAt] = useState(() => Date.now());
  const [canClose, setCanClose] = useState(false);
  // The finger lifting after a long-press can land on the backdrop; ignore that.
  useEffect(() => {
    const timer = setTimeout(() => setCanClose(true), 400);
    return () => clearTimeout(timer);
  }, []);
  const closeFromBackdrop = () => { if (canClose) onClose(); };
  const [position, setPosition] = useState({ left: x, top: y, ready: false });
  const mine = String(message.sender?._id || message.sender) === String(myId);
  const myReaction = message.reactions?.find(r => String(r.user) === String(myId))?.emoji;
  const media = messageMedia(message);
  const canEdit = mine && message.messageType === 'text' && openedAt - new Date(message.createdAt).getTime() < EDIT_WINDOW_MS;
  const canForward = message.messageType !== 'call' && (message.messageType === 'text' || message.media?.url);
  const canCopy = !!message.text;

  // Keep the menu inside the viewport.
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const { width, height } = el.getBoundingClientRect();
    const margin = 12;
    const left = Math.min(Math.max(x - (mine ? width : 0), margin), window.innerWidth - width - margin);
    const top = y + height + margin > window.innerHeight ? Math.max(y - height - 8, margin) : y + 6;
    setPosition({ left, top, ready: true });
  }, [x, y, mine]);

  const act = (fn) => () => { onClose(); fn(message); };

  const actions = [
    { label: 'Reply', icon: Reply, run: onReply },
    canCopy && { label: 'Copy', icon: Copy, run: onCopy },
    canForward && { label: 'Forward', icon: Forward, run: onForward },
    canEdit && { label: 'Edit', icon: Pencil, run: onEdit },
    media && message.messageType !== 'sticker' && message.messageType !== 'call' && {
      label: 'Download', icon: Download, run: () => window.open(mediaUrl(media.url), '_blank', 'noopener')
    },
    { label: 'Delete', icon: Trash2, run: onDelete, danger: true }
  ].filter(Boolean);

  return createPortal(
    <div className="msg-menu-backdrop" onMouseDown={closeFromBackdrop} onTouchStart={(e) => { if (e.target === e.currentTarget) closeFromBackdrop(); }}>
      <div
        ref={ref}
        className="msg-menu"
        style={{ left: position.left, top: position.top, visibility: position.ready ? 'visible' : 'hidden' }}
        onMouseDown={(e) => e.stopPropagation()}
        role="menu"
      >
        <span className="sheet-handle" aria-hidden="true" />
        {message.messageType !== 'call' && (
          <div className="msg-menu-reactions">
            {QUICK_REACTIONS.map(emoji => (
              <button
                key={emoji}
                type="button"
                className={myReaction === emoji ? 'is-active' : ''}
                onClick={() => { onClose(); onReact(message, emoji); }}
                aria-label={`React ${emoji}`}
              >
                {emoji}
              </button>
            ))}
          </div>
        )}
        <div className="msg-menu-actions">
          {actions.map(({ label, icon: Icon, run, danger }) => (
            <button key={label} type="button" role="menuitem" className={`menu-item${danger ? ' is-danger' : ''}`} onClick={act(run)}>
              <Icon size={18} />
              <span>{label}</span>
            </button>
          ))}
        </div>
      </div>
    </div>,
    document.body
  );
}
