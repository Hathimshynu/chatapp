import { forwardRef, lazy, Suspense, useCallback, useEffect, useImperativeHandle, useRef, useState } from 'react';
import toast from 'react-hot-toast';
import {
  Camera, FileText, Image as ImageIcon, Keyboard, Mic, Paperclip, Pencil, Reply, SendHorizontal, Smile, Sticker, Trash2, X
} from 'lucide-react';
import StickerPicker from './StickerPicker';
import AttachmentPreview from './AttachmentPreview';
import { formatDuration, messagePreview } from '../../lib/format';
import { pickRecorderMimeType } from '../../lib/media';

const EmojiPanel = lazy(() => import('./EmojiPanel'));

const MAX_RECORDING_SECONDS = 10 * 60;
const TYPING_REPEAT_MS = 2500;
const TYPING_IDLE_MS = 3000;
const isTouchDevice = () => window.matchMedia('(pointer: coarse)').matches;

// Scoped to the signed-in account so two accounts on one device never see each other's drafts.
const draftKey = (myId, key) => `chatDraft:${myId}:${key}`;

function RecorderBar({ startedAt, levels, onCancel, onSend }) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(timer);
  }, []);
  return (
    <div className="recorder">
      <button type="button" className="icon-btn recorder-cancel" onClick={onCancel} aria-label="Discard recording">
        <Trash2 size={20} />
      </button>
      <span className="recorder-dot" />
      <span className="recorder-time">{formatDuration((now - startedAt) / 1000)}</span>
      <span className="recorder-levels" aria-hidden="true">
        {levels.map((level, i) => <i key={i} style={{ height: `${Math.max(12, level * 100)}%` }} />)}
      </span>
      <button type="button" className="send-btn" onClick={onSend} aria-label="Send voice message">
        <SendHorizontal size={22} />
      </button>
    </div>
  );
}

const Composer = forwardRef(function Composer({
  draftId, recipientName, replyTo, onCancelReply, editing, onCancelEdit, myId,
  onSendText, onSubmitEdit, onSendFiles, onSendSticker, onSendVoice, onTyping, onStopTyping
}, ref) {
  const [text, setText] = useState(() => {
    try { return localStorage.getItem(draftKey(myId, draftId)) || ''; } catch { return ''; }
  });
  const [panel, setPanel] = useState(null); // 'emoji' | 'sticker' | 'attach'
  const [pendingFiles, setPendingFiles] = useState(null);
  const [recording, setRecording] = useState(null); // { startedAt, levels }
  const textareaRef = useRef(null);
  const mediaInputRef = useRef(null);
  const docInputRef = useRef(null);
  const cameraInputRef = useRef(null);
  const addMoreRef = useRef(null);
  const typingRef = useRef({ lastSent: 0, idleTimer: null });
  const recorderRef = useRef(null);

  // ── Drafts are kept per chat, like WhatsApp ──────────────────────
  useEffect(() => {
    if (editing) return;
    const timer = setTimeout(() => {
      try {
        if (text.trim()) localStorage.setItem(draftKey(myId, draftId), text);
        else localStorage.removeItem(draftKey(myId, draftId));
      } catch { /* storage full */ }
    }, 300);
    return () => clearTimeout(timer);
  }, [text, myId, draftId, editing]);

  // Editing a message pre-fills the box; cancelling restores nothing.
  useEffect(() => {
    if (editing) {
      setText(editing.text || '');
      requestAnimationFrame(() => {
        const el = textareaRef.current;
        el?.focus();
        el?.setSelectionRange(el.value.length, el.value.length);
      });
    }
  }, [editing]);

  useEffect(() => {
    if (replyTo && !isTouchDevice()) textareaRef.current?.focus();
  }, [replyTo]);

  // Auto-grow the textarea up to ~6 lines.
  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight, 148)}px`;
  }, [text]);

  const stopTyping = useCallback(() => {
    clearTimeout(typingRef.current.idleTimer);
    if (typingRef.current.lastSent) {
      typingRef.current.lastSent = 0;
      onStopTyping();
    }
  }, [onStopTyping]);

  const signalTyping = () => {
    const now = Date.now();
    if (now - typingRef.current.lastSent > TYPING_REPEAT_MS) {
      typingRef.current.lastSent = now;
      onTyping('typing');
    }
    clearTimeout(typingRef.current.idleTimer);
    typingRef.current.idleTimer = setTimeout(stopTyping, TYPING_IDLE_MS);
  };

  useEffect(() => () => clearTimeout(typingRef.current.idleTimer), []);

  const onChange = (event) => {
    setText(event.target.value);
    if (event.target.value && !editing) signalTyping();
  };

  const submit = () => {
    const value = text.trim();
    if (!value) return;
    if (editing) {
      if (value !== editing.text) onSubmitEdit(value);
      else onCancelEdit();
    } else {
      onSendText(value);
    }
    setText('');
    stopTyping();
    if (!isTouchDevice()) textareaRef.current?.focus();
  };

  const onKeyDown = (event) => {
    // Desktop: Enter sends, Shift+Enter = new line. Phones: Enter is a new line (like WhatsApp).
    if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing && !isTouchDevice()) {
      event.preventDefault();
      submit();
    }
    if (event.key === 'Escape') {
      if (editing) { setText(''); onCancelEdit(); } else if (replyTo) onCancelReply();
    }
  };

  const insertEmoji = (emoji) => {
    const el = textareaRef.current;
    if (!el) { setText(t => t + emoji); return; }
    const start = el.selectionStart ?? text.length;
    const end = el.selectionEnd ?? text.length;
    const next = text.slice(0, start) + emoji + text.slice(end);
    setText(next);
    requestAnimationFrame(() => {
      el.setSelectionRange(start + emoji.length, start + emoji.length);
    });
  };

  // ── Attachments ──────────────────────────────────────────────────
  const openFiles = useCallback((fileList) => {
    const files = Array.from(fileList || []).filter(Boolean).slice(0, 10);
    if (!files.length) return;
    setPanel(null);
    setPendingFiles(prev => (prev ? [...prev, ...files].slice(0, 10) : files));
  }, []);

  useImperativeHandle(ref, () => ({ openFiles, focus: () => textareaRef.current?.focus() }), [openFiles]);

  const onPickFiles = (event) => {
    openFiles(event.target.files);
    event.target.value = '';
  };

  const onPaste = (event) => {
    const files = Array.from(event.clipboardData?.files || []);
    if (files.length) {
      event.preventDefault();
      openFiles(files);
    }
  };

  // ── Voice notes ──────────────────────────────────────────────────
  const cleanupRecorder = () => {
    const rec = recorderRef.current;
    if (!rec) return;
    clearInterval(rec.levelTimer);
    clearInterval(rec.typingTimer);
    clearTimeout(rec.limitTimer);
    rec.stream.getTracks().forEach(track => track.stop());
    rec.audioContext?.close().catch(() => {});
    recorderRef.current = null;
  };

  const finishRecording = (send) => {
    const rec = recorderRef.current;
    if (!rec) return;
    const duration = (Date.now() - rec.startedAt) / 1000;
    rec.recorder.onstop = () => {
      const blob = new Blob(rec.chunks, { type: rec.recorder.mimeType || rec.mimeType || 'audio/webm' });
      cleanupRecorder();
      if (send && duration >= 0.8 && blob.size > 0) onSendVoice(blob, duration);
      else if (send) toast('Hold on — voice message was too short');
    };
    try { rec.recorder.stop(); } catch { cleanupRecorder(); }
    setRecording(null);
    onStopTyping();
  };

  const startRecording = async () => {
    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === 'undefined') {
      toast.error('Voice messages are not supported in this browser');
      return;
    }
    let stream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true } });
    } catch {
      toast.error('Allow microphone access to record voice messages');
      return;
    }
    const mimeType = pickRecorderMimeType();
    const recorder = new MediaRecorder(stream, mimeType ? { mimeType, audioBitsPerSecond: 48000 } : undefined);
    const rec = { recorder, stream, mimeType, chunks: [], startedAt: Date.now() };
    recorder.ondataavailable = (event) => { if (event.data.size) rec.chunks.push(event.data); };
    recorder.start(250);

    // Live input level for the recording bar.
    try {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      rec.audioContext = new AudioCtx();
      const analyser = rec.audioContext.createAnalyser();
      analyser.fftSize = 256;
      rec.audioContext.createMediaStreamSource(stream).connect(analyser);
      const data = new Uint8Array(analyser.fftSize);
      rec.levelTimer = setInterval(() => {
        analyser.getByteTimeDomainData(data);
        let sum = 0;
        for (const v of data) sum += ((v - 128) / 128) ** 2;
        const level = Math.min(1, Math.sqrt(sum / data.length) * 4);
        setRecording(r => (r ? { ...r, levels: [...r.levels.slice(1), level] } : r));
      }, 100);
    } catch { /* level meter is decorative */ }

    onTyping('recording');
    rec.typingTimer = setInterval(() => onTyping('recording'), TYPING_REPEAT_MS);
    rec.limitTimer = setTimeout(() => finishRecording(true), MAX_RECORDING_SECONDS * 1000);
    recorderRef.current = rec;
    setPanel(null);
    setRecording({ startedAt: rec.startedAt, levels: Array(28).fill(0.05) });
  };

  useEffect(() => () => {
    const rec = recorderRef.current;
    if (rec) {
      rec.recorder.onstop = null;
      try { rec.recorder.stop(); } catch { /* ignore */ }
      cleanupRecorder();
    }
  }, []);

  const hasText = text.trim().length > 0;
  const togglePanel = (name) => setPanel(p => (p === name ? null : name));

  return (
    <div className="composer">
      {(replyTo || editing) && (
        <div className="composer-context">
          <span className="composer-context-icon">{editing ? <Pencil size={18} /> : <Reply size={18} />}</span>
          <div className="composer-context-body">
            <strong>
              {editing
                ? 'Edit message'
                : String(replyTo.sender?._id || replyTo.sender) === String(myId) ? 'Replying to yourself' : `Replying to ${replyTo.sender?.name || recipientName}`}
            </strong>
            <span>{messagePreview(editing || replyTo, myId)}</span>
          </div>
          <button
            type="button"
            className="icon-btn icon-btn-sm"
            onClick={() => { if (editing) { setText(''); onCancelEdit(); } else onCancelReply(); }}
            aria-label="Cancel"
          >
            <X size={18} />
          </button>
        </div>
      )}

      {panel === 'emoji' && (
        <Suspense fallback={<div className="composer-panel emoji-panel"><span className="spinner" /></div>}>
          <EmojiPanel onPick={insertEmoji} />
        </Suspense>
      )}
      {panel === 'sticker' && <StickerPicker onSelect={(sticker) => { setPanel(null); onSendSticker(sticker); }} />}
      {panel === 'attach' && (
        <div className="attach-menu">
          <button type="button" onClick={() => mediaInputRef.current?.click()}>
            <span className="attach-icon is-media"><ImageIcon size={22} /></span>Photos & videos
          </button>
          <button type="button" onClick={() => cameraInputRef.current?.click()}>
            <span className="attach-icon is-camera"><Camera size={22} /></span>Camera
          </button>
          <button type="button" onClick={() => docInputRef.current?.click()}>
            <span className="attach-icon is-doc"><FileText size={22} /></span>Document
          </button>
        </div>
      )}

      {recording ? (
        <RecorderBar
          startedAt={recording.startedAt}
          levels={recording.levels}
          onCancel={() => finishRecording(false)}
          onSend={() => finishRecording(true)}
        />
      ) : (
        <div className="composer-bar">
          <div className="composer-field">
            <button
              type="button"
              className={`icon-btn${panel === 'emoji' ? ' is-active' : ''}`}
              onClick={() => { togglePanel('emoji'); if (panel === 'emoji') textareaRef.current?.focus(); }}
              aria-label={panel === 'emoji' ? 'Show keyboard' : 'Emoji'}
            >
              {panel === 'emoji' ? <Keyboard size={22} /> : <Smile size={22} />}
            </button>
            <textarea
              ref={textareaRef}
              rows={1}
              value={text}
              onChange={onChange}
              onKeyDown={onKeyDown}
              onPaste={onPaste}
              onFocus={() => { if (isTouchDevice()) setPanel(p => (p === 'attach' ? null : p)); }}
              placeholder={editing ? 'Edit message' : 'Message'}
              aria-label="Message"
              maxLength={5000}
            />
            {!editing && (
              <>
                <button type="button" className={`icon-btn${panel === 'sticker' ? ' is-active' : ''}`} onClick={() => togglePanel('sticker')} aria-label="Stickers and GIFs">
                  <Sticker size={22} />
                </button>
                <button type="button" className={`icon-btn${panel === 'attach' ? ' is-active' : ''}`} onClick={() => togglePanel('attach')} aria-label="Attach">
                  <Paperclip size={22} />
                </button>
                {!hasText && (
                  <button type="button" className="icon-btn composer-camera" onClick={() => cameraInputRef.current?.click()} aria-label="Camera">
                    <Camera size={22} />
                  </button>
                )}
              </>
            )}
          </div>
          {hasText || editing ? (
            <button type="button" className="send-btn" onClick={submit} disabled={!hasText} aria-label={editing ? 'Save edit' : 'Send'}>
              <SendHorizontal size={22} />
            </button>
          ) : (
            <button type="button" className="send-btn" onClick={startRecording} aria-label="Record voice message">
              <Mic size={22} />
            </button>
          )}
        </div>
      )}

      <input ref={mediaInputRef} type="file" accept="image/*,video/*" multiple hidden onChange={onPickFiles} />
      <input ref={cameraInputRef} type="file" accept="image/*" capture="environment" hidden onChange={onPickFiles} />
      <input ref={docInputRef} type="file" multiple hidden onChange={onPickFiles} />
      <input ref={addMoreRef} type="file" accept="image/*,video/*" multiple hidden onChange={onPickFiles} />

      {pendingFiles && (
        <AttachmentPreview
          files={pendingFiles}
          recipient={recipientName}
          onClose={() => setPendingFiles(null)}
          onAddMore={() => addMoreRef.current?.click()}
          onSend={(caption) => {
            const files = pendingFiles;
            setPendingFiles(null);
            onSendFiles(files, caption);
          }}
        />
      )}
    </div>
  );
});

export default Composer;
