import { lazy, Suspense, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import axios from 'axios';
import toast from 'react-hot-toast';
import { AlignCenter, AlignLeft, AlignRight, ChevronDown, Lock, Palette, SendHorizontal, Smile, Type, X } from 'lucide-react';
import VisibilityDialog from './VisibilityDialog';
import { useBackClose } from '../../lib/backStack';
import { errorMessage, MAX_UPLOAD_BYTES, uploadMedia } from '../../lib/api';
import { compressImage, readVideoMeta } from '../../lib/media';
import { loadPrivacy, privacyLabel, savePrivacy, STATUS_BACKGROUNDS, STATUS_FONTS } from '../../lib/status';

const EmojiPanel = lazy(() => import('../chat/EmojiPanel'));
const BACKGROUND_KEYS = Object.keys(STATUS_BACKGROUNDS);
const FONT_KEYS = Object.keys(STATUS_FONTS);
const ALIGNS = ['center', 'left', 'right'];
const ALIGN_ICONS = { center: AlignCenter, left: AlignLeft, right: AlignRight };

// Text size shrinks as the text grows, like WhatsApp.
const fontSizeFor = (text) => (text.length < 30 ? 40 : text.length < 90 ? 32 : text.length < 200 ? 24 : 19);

// mode: 'text' | 'media' (with `file`)
export default function StatusComposer({ mode, file, onClose, onPosted }) {
  const [text, setText] = useState('');
  const [background, setBackground] = useState(() => BACKGROUND_KEYS[Math.floor(Math.random() * BACKGROUND_KEYS.length)]);
  const [font, setFont] = useState('sans');
  const [align, setAlign] = useState('center');
  const [caption, setCaption] = useState('');
  const [privacy, setPrivacy] = useState(loadPrivacy);
  const [showPrivacy, setShowPrivacy] = useState(false);
  const [showEmoji, setShowEmoji] = useState(false);
  const [progress, setProgress] = useState(null);
  const textRef = useRef(null);
  const isVideo = file?.type.startsWith('video/');
  // The effect owns its object URL, so a StrictMode re-run can't revoke one still in use.
  const [previewUrl, setPreviewUrl] = useState('');
  useEffect(() => {
    if (!file) return undefined;
    const url = URL.createObjectURL(file);
    setPreviewUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);
  useBackClose(true, onClose);

  useEffect(() => {
    if (mode === 'text' && window.matchMedia('(pointer: fine)').matches) textRef.current?.focus();
  }, [mode]);

  const busy = progress !== null;
  const tooBig = file && file.size > MAX_UPLOAD_BYTES;

  const post = async () => {
    const visibility = { mode: privacy.mode, users: privacy.users.map(u => u._id) };
    try {
      let body;
      if (mode === 'text') {
        if (!text.trim()) return;
        body = { type: 'text', text: text.trim(), background, font, align, visibility };
        setProgress(1);
      } else {
        setProgress(0);
        let blob = file;
        let meta = {};
        if (isVideo) meta = await readVideoMeta(file);
        else {
          const compressed = await compressImage(file);
          blob = compressed.blob;
          meta = { width: compressed.width, height: compressed.height };
        }
        const uploaded = await uploadMedia(blob, { name: file.name, onProgress: p => setProgress(p) });
        body = { type: isVideo ? 'video' : 'image', media: { url: uploaded.url, ...meta }, caption: caption.trim(), visibility };
      }
      await axios.post('/api/status', body);
      savePrivacy(privacy);
      toast.success('Status posted');
      onPosted?.();
      onClose();
    } catch (error) {
      toast.error(errorMessage(error, 'Could not post status'));
      setProgress(null);
    }
  };

  const insertEmoji = (emoji) => {
    const el = textRef.current;
    const start = el?.selectionStart ?? text.length;
    const end = el?.selectionEnd ?? text.length;
    setText(t => (t.slice(0, start) + emoji + t.slice(end)).slice(0, 700));
  };

  const AlignIcon = ALIGN_ICONS[align];
  const fontDef = STATUS_FONTS[font];

  return createPortal(
    <div className={`status-composer ${mode === 'text' ? 'is-text' : 'is-media'}`}
      style={mode === 'text' ? { background: STATUS_BACKGROUNDS[background] } : undefined}
      role="dialog" aria-label="Create status">
      <header className="status-composer-top">
        <button type="button" className="sv-btn" onClick={onClose} aria-label="Cancel"><X size={24} /></button>
        {mode === 'text' && (
          <div className="status-tools">
            <button type="button" className="sv-btn" onClick={() => setShowEmoji(s => !s)} aria-label="Emoji"><Smile size={22} /></button>
            <button type="button" className="sv-btn" onClick={() => setFont(FONT_KEYS[(FONT_KEYS.indexOf(font) + 1) % FONT_KEYS.length])} aria-label={`Font: ${font}`}><Type size={22} /></button>
            <button type="button" className="sv-btn" onClick={() => setAlign(ALIGNS[(ALIGNS.indexOf(align) + 1) % ALIGNS.length])} aria-label={`Align ${align}`}><AlignIcon size={22} /></button>
            <button type="button" className="sv-btn" onClick={() => setBackground(BACKGROUND_KEYS[(BACKGROUND_KEYS.indexOf(background) + 1) % BACKGROUND_KEYS.length])} aria-label="Change background"><Palette size={22} /></button>
          </div>
        )}
      </header>

      <div className="status-composer-stage">
        {mode === 'text' ? (
          <textarea
            ref={textRef}
            className="status-text-input"
            value={text}
            onChange={(e) => setText(e.target.value.slice(0, 700))}
            placeholder="Type a status"
            aria-label="Status text"
            style={{ textAlign: align, fontFamily: fontDef.css, fontWeight: fontDef.weight, fontSize: fontSizeFor(text) }}
          />
        ) : isVideo ? (
          <video src={previewUrl} controls playsInline className="status-media-preview" />
        ) : (
          <img src={previewUrl} alt="Status preview" className="status-media-preview" />
        )}
        {tooBig && <p className="attach-error">Files must be under 15 MB.</p>}
      </div>

      {showEmoji && mode === 'text' && (
        <div className="status-emoji">
          <Suspense fallback={<div className="composer-panel emoji-panel"><span className="spinner" /></div>}>
            <EmojiPanel onPick={insertEmoji} />
          </Suspense>
        </div>
      )}

      <footer className="status-composer-bottom">
        {mode === 'media' && (
          <input
            className="status-caption"
            value={caption}
            onChange={(e) => setCaption(e.target.value)}
            maxLength={700}
            placeholder="Add a caption…"
            aria-label="Caption"
          />
        )}
        <div className="status-post-row">
          <button type="button" className="privacy-chip" onClick={() => setShowPrivacy(true)}>
            <Lock size={14} /> {privacyLabel(privacy)} <ChevronDown size={14} />
          </button>
          {mode === 'text' && <span className="status-count">{text.length}/700</span>}
          <button type="button" className="send-btn" onClick={post} disabled={busy || tooBig || (mode === 'text' && !text.trim())} aria-label="Post status">
            {busy ? <span className="upload-ring small light" style={{ '--p': progress }} /> : <SendHorizontal size={22} />}
          </button>
        </div>
      </footer>

      {showPrivacy && <VisibilityDialog value={privacy} onChange={setPrivacy} onClose={() => setShowPrivacy(false)} />}
    </div>,
    document.body
  );
}
