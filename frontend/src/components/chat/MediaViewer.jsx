import { useEffect } from 'react';
import { createPortal } from 'react-dom';
import { Download, X } from 'lucide-react';
import { mediaUrl } from '../../lib/api';
import { formatDayLabel, formatTime } from '../../lib/format';
import { messageMedia } from '../../lib/messages';

export default function MediaViewer({ message, senderName, onClose }) {
  const media = messageMedia(message);

  useEffect(() => {
    const onKey = (event) => { if (event.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  if (!media) return null;
  const src = mediaUrl(media.url);

  return createPortal(
    <div className="viewer" role="dialog" aria-label="Media viewer" onClick={onClose}>
      <header className="viewer-header" onClick={(e) => e.stopPropagation()}>
        <div>
          <strong>{senderName}</strong>
          <span>{formatDayLabel(message.createdAt)}, {formatTime(message.createdAt)}</span>
        </div>
        <a className="icon-btn" href={src} download target="_blank" rel="noopener noreferrer" aria-label="Download">
          <Download size={22} />
        </a>
        <button type="button" className="icon-btn" onClick={onClose} aria-label="Close"><X size={24} /></button>
      </header>
      <div className="viewer-stage">
        {message.messageType === 'video'
          ? <video src={src} controls autoPlay playsInline onClick={(e) => e.stopPropagation()} />
          : <img src={src} alt={message.text || 'Photo'} onClick={(e) => e.stopPropagation()} />}
      </div>
      {message.text && <p className="viewer-caption" onClick={(e) => e.stopPropagation()}>{message.text}</p>}
    </div>,
    document.body
  );
}
