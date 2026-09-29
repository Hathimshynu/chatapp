import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { FileText, Plus, SendHorizontal, X } from 'lucide-react';
import { attachmentKind } from '../../lib/media';
import { fileExtension, formatBytes } from '../../lib/format';
import { MAX_UPLOAD_BYTES } from '../../lib/api';

// Full-screen preview with a caption before sending photos, videos or documents.
export default function AttachmentPreview({ files, recipient, onSend, onClose, onAddMore }) {
  const [index, setIndex] = useState(0);
  const [caption, setCaption] = useState('');
  // The effect owns its object URLs, so a StrictMode re-run can't revoke ones still in use.
  const [urls, setUrls] = useState([]);
  useEffect(() => {
    const created = files.map(file => URL.createObjectURL(file));
    setUrls(created);
    return () => created.forEach(url => URL.revokeObjectURL(url));
  }, [files]);
  useEffect(() => { if (index >= files.length) setIndex(Math.max(files.length - 1, 0)); }, [files.length, index]);

  useEffect(() => {
    const onKey = (event) => { if (event.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const file = files[index];
  if (!file) return null;
  const kind = attachmentKind(file);
  const tooBig = files.filter(f => f.size > MAX_UPLOAD_BYTES);

  const send = () => {
    if (tooBig.length) return;
    onSend(caption.trim());
  };

  return createPortal(
    <div className="attach-preview" role="dialog" aria-label="Send attachment">
      <header className="attach-header">
        <button type="button" className="icon-btn" onClick={onClose} aria-label="Cancel"><X size={22} /></button>
        <span>{files.length > 1 ? `${index + 1} of ${files.length}` : file.name}</span>
      </header>

      <div className="attach-stage">
        {kind === 'image' && <img src={urls[index]} alt={file.name} />}
        {kind === 'video' && <video src={urls[index]} controls playsInline />}
        {(kind === 'file' || kind === 'audio') && (
          <div className="attach-doc">
            <span className="file-icon large"><FileText size={40} /><em>{fileExtension(file.name)}</em></span>
            <strong>{file.name}</strong>
            <span>{formatBytes(file.size)}</span>
          </div>
        )}
        {tooBig.length > 0 && <p className="attach-error">Files must be under 15 MB — remove {tooBig.map(f => f.name).join(', ')}.</p>}
      </div>

      <footer className="attach-footer">
        {files.length > 1 || onAddMore ? (
          <div className="attach-thumbs">
            {files.map((f, i) => (
              <button key={i} type="button" className={`attach-thumb${i === index ? ' is-active' : ''}`} onClick={() => setIndex(i)}>
                {attachmentKind(f) === 'image' ? <img src={urls[i]} alt="" /> : <FileText size={20} />}
              </button>
            ))}
            {onAddMore && (
              <button type="button" className="attach-thumb is-add" onClick={onAddMore} aria-label="Add more"><Plus size={20} /></button>
            )}
          </div>
        ) : null}
        <div className="attach-compose">
          <input
            value={caption}
            onChange={(e) => setCaption(e.target.value)}
            placeholder="Add a caption…"
            maxLength={1000}
            onKeyDown={(e) => { if (e.key === 'Enter') send(); }}
            autoFocus={window.matchMedia('(pointer: fine)').matches}
          />
          <button type="button" className="send-btn" onClick={send} disabled={tooBig.length > 0} aria-label={`Send to ${recipient}`}>
            <SendHorizontal size={22} />
          </button>
        </div>
        <p className="attach-recipient">Sending to <strong>{recipient}</strong></p>
      </footer>
    </div>,
    document.body
  );
}
