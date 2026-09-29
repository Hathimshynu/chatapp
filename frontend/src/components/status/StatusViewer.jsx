import { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import axios from 'axios';
import toast from 'react-hot-toast';
import { ChevronUp, Eye, SendHorizontal, Trash2, Volume2, VolumeX, X } from 'lucide-react';
import Avatar from '../common/Avatar';
import ConfirmDialog from '../common/ConfirmDialog';
import { useBackClose } from '../../lib/backStack';
import { errorMessage, mediaUrl } from '../../lib/api';
import { formatDayLabel, formatTime } from '../../lib/format';
import { IMAGE_DURATION_MS, MAX_VIDEO_MS, STATUS_BACKGROUNDS, STATUS_FONTS, STATUS_REACTIONS, TEXT_DURATION_MS } from '../../lib/status';

const when = (date) => {
  const label = formatDayLabel(date);
  return `${label === 'Today' ? 'Today' : label}, ${formatTime(date)}`;
};

// groups: [{ user, statuses }]; own=true shows viewers + delete instead of reply.
export default function StatusViewer({ groups, startGroup = 0, startIndex = 0, own = false, onClose, onViewed, onDeleted }) {
  const [gi, setGi] = useState(startGroup);
  const [si, setSi] = useState(startIndex);
  const [progress, setProgress] = useState(0);
  const [held, setHeld] = useState(false);
  const [muted, setMuted] = useState(true);
  const [reply, setReply] = useState('');
  const [typing, setTyping] = useState(false);
  const [viewers, setViewers] = useState(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const videoRef = useRef(null);
  const clock = useRef({ elapsed: 0, last: 0 });
  const touch = useRef(null);
  useBackClose(true, onClose);

  const group = groups[gi];
  const status = group?.statuses[si];
  const paused = held || typing || viewers !== null || confirmDelete;

  // ── Navigation ───────────────────────────────────────────────────
  const next = useCallback(() => {
    if (si < group.statuses.length - 1) setSi(si + 1);
    else if (gi < groups.length - 1) { setGi(gi + 1); setSi(0); }
    else onClose();
  }, [si, gi, group, groups.length, onClose]);

  const prev = useCallback(() => {
    if (si > 0) setSi(si - 1);
    else if (gi > 0) { setGi(gi - 1); setSi(groups[gi - 1].statuses.length - 1); }
    else clock.current.elapsed = 0;
  }, [si, gi, groups]);

  const nextGroup = () => (gi < groups.length - 1 ? (setGi(gi + 1), setSi(0)) : onClose());
  const prevGroup = () => { if (gi > 0) { setGi(gi - 1); setSi(0); } };

  // Reset the clock and record the view whenever the visible status changes.
  useEffect(() => {
    if (!status) return;
    clock.current = { elapsed: 0, last: performance.now() };
    setProgress(0);
    if (!own && !status.viewed) onViewed?.(status);
  }, [status?._id]); // eslint-disable-line react-hooks/exhaustive-deps

  // Progress clock (images/text by time, videos by playback position).
  useEffect(() => {
    if (!status) return undefined;
    let frame;
    const tick = (now) => {
      const video = videoRef.current;
      if (status.type === 'video' && video) {
        const total = Math.min((video.duration || 0) * 1000 || MAX_VIDEO_MS, MAX_VIDEO_MS);
        const value = Math.min((video.currentTime * 1000) / total, 1);
        setProgress(value);
        if (value >= 1 || video.ended) { next(); return; }
      } else {
        if (!paused) clock.current.elapsed += now - clock.current.last;
        const total = status.type === 'text' ? TEXT_DURATION_MS : IMAGE_DURATION_MS;
        const value = Math.min(clock.current.elapsed / total, 1);
        setProgress(value);
        if (value >= 1) { next(); return; }
      }
      clock.current.last = now;
      frame = requestAnimationFrame(tick);
    };
    clock.current.last = performance.now();
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [status, paused, next]);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    if (paused) video.pause();
    else video.play().catch(() => {});
  }, [paused, status?._id]);

  useEffect(() => {
    const onKey = (event) => {
      if (event.key === 'Escape') {
        if (confirmDelete) return; // the dialog handles its own Escape
        if (viewers !== null) setViewers(null);
        else onClose();
        return;
      }
      if (typing) return;
      if (event.key === 'ArrowRight') next();
      if (event.key === 'ArrowLeft') prev();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [next, prev, typing, viewers, confirmDelete, onClose]);

  // ── Touch / pointer: tap sides, hold to pause, swipe between people ─
  const onPointerDown = (event) => {
    touch.current = { x: event.clientX, y: event.clientY, at: Date.now() };
    setHeld(true);
  };
  const onPointerUp = (event) => {
    setHeld(false);
    const start = touch.current;
    touch.current = null;
    if (!start) return;
    const dx = event.clientX - start.x;
    const dy = event.clientY - start.y;
    if (dy > 90 && Math.abs(dy) > Math.abs(dx)) { onClose(); return; }
    if (Math.abs(dx) > 60 && Math.abs(dx) > Math.abs(dy)) { if (dx < 0) nextGroup(); else prevGroup(); return; }
    if (Date.now() - start.at > 250) return; // it was a hold
    const rect = event.currentTarget.getBoundingClientRect();
    if (event.clientX - rect.left < rect.width * 0.3) prev();
    else next();
  };

  if (!status) return null;

  const sendReply = async (text) => {
    if (!text.trim()) return;
    try {
      await axios.post(`/api/status/${status._id}/reply`, { text: text.trim() });
      setReply('');
      setTyping(false);
      toast.success('Reply sent');
    } catch (error) {
      toast.error(errorMessage(error, 'Could not send reply'));
    }
  };
  const react = async (emoji) => {
    try {
      await axios.post(`/api/status/${status._id}/react`, { emoji });
      toast.success(`Reacted ${emoji}`);
    } catch (error) {
      toast.error(errorMessage(error, 'Could not react'));
    }
  };
  const openViewers = async () => {
    setViewers([]);
    try {
      const { data } = await axios.get(`/api/status/${status._id}/viewers`);
      setViewers(data);
    } catch {
      setViewers([]);
    }
  };
  const remove = async () => {
    try {
      await axios.delete(`/api/status/${status._id}`);
      toast.success('Status deleted');
      onDeleted?.(status);
      setConfirmDelete(false);
      if (group.statuses.length === 1) onClose();
      else setSi(Math.max(0, si - (si === group.statuses.length - 1 ? 1 : 0)));
    } catch (error) {
      toast.error(errorMessage(error));
    }
  };

  const font = STATUS_FONTS[status.font] || STATUS_FONTS.sans;
  const textSize = status.text?.length < 30 ? 40 : status.text?.length < 90 ? 32 : status.text?.length < 200 ? 24 : 19;

  return createPortal(
    <div className="status-viewer" role="dialog" aria-label={`Status from ${own ? 'you' : group.user.name}`}>
      <div className="sv-progress">
        {group.statuses.map((s, i) => (
          <span key={s._id}><i style={{ transform: `scaleX(${i < si ? 1 : i === si ? progress : 0})` }} /></span>
        ))}
      </div>
      <header className="sv-header">
        <Avatar user={group.user} size={40} />
        <div className="sv-who">
          <strong>{own ? 'My status' : group.user.name}</strong>
          <span>{when(status.createdAt)}</span>
        </div>
        {status.type === 'video' && (
          <button type="button" className="sv-btn" onClick={() => setMuted(m => !m)} aria-label={muted ? 'Unmute' : 'Mute'}>
            {muted ? <VolumeX size={22} /> : <Volume2 size={22} />}
          </button>
        )}
        {own && (
          <button type="button" className="sv-btn" onClick={() => setConfirmDelete(true)} aria-label="Delete status"><Trash2 size={21} /></button>
        )}
        <button type="button" className="sv-btn" onClick={onClose} aria-label="Close"><X size={24} /></button>
      </header>

      <div
        className="sv-stage"
        onPointerDown={onPointerDown}
        onPointerUp={onPointerUp}
        onPointerCancel={() => { setHeld(false); touch.current = null; }}
        onContextMenu={(e) => e.preventDefault()}
      >
        {status.type === 'text' && (
          <div className="sv-text" style={{ background: STATUS_BACKGROUNDS[status.background] || STATUS_BACKGROUNDS.violet }}>
            <p style={{ textAlign: status.align, fontFamily: font.css, fontWeight: font.weight, fontSize: textSize }}>{status.text}</p>
          </div>
        )}
        {status.type === 'image' && (
          <>
            <div className="sv-blur" style={{ backgroundImage: `url("${mediaUrl(status.media.url)}")` }} />
            <img className="sv-media" src={mediaUrl(status.media.url)} alt={status.caption || 'Status'} draggable="false" />
          </>
        )}
        {status.type === 'video' && (
          <video key={status._id} ref={videoRef} className="sv-media" src={mediaUrl(status.media.url)} autoPlay playsInline muted={muted} />
        )}
        {status.caption && <p className="sv-caption">{status.caption}</p>}
      </div>

      <footer className="sv-footer">
        {own ? (
          <button type="button" className="sv-viewers-btn" onClick={openViewers}>
            <ChevronUp size={18} /><Eye size={18} /> {status.viewCount || 0}
          </button>
        ) : (
          <>
            <div className="sv-reactions">
              {STATUS_REACTIONS.map(emoji => (
                <button key={emoji} type="button" onClick={() => react(emoji)} aria-label={`React ${emoji}`}>{emoji}</button>
              ))}
            </div>
            <form className="sv-reply" onSubmit={(e) => { e.preventDefault(); sendReply(reply); }}>
              <input
                value={reply}
                onChange={(e) => setReply(e.target.value)}
                onFocus={() => setTyping(true)}
                onBlur={() => { if (!reply) setTyping(false); }}
                placeholder={`Reply to ${group.user.name.split(' ')[0]}…`}
                aria-label="Reply"
                maxLength={1000}
              />
              <button type="submit" className="send-btn" disabled={!reply.trim()} aria-label="Send reply"><SendHorizontal size={20} /></button>
            </form>
          </>
        )}
      </footer>

      {viewers !== null && (
        <div className="sv-sheet-backdrop" onClick={() => setViewers(null)}>
          <div className="sv-sheet" onClick={(e) => e.stopPropagation()}>
            <span className="sheet-handle" />
            <h3>Viewed by {viewers.length}</h3>
            <div className="sv-sheet-list">
              {viewers.length === 0 && <p className="empty-hint">No views yet</p>}
              {viewers.map(v => (
                <div key={v.user._id} className="info-row">
                  <Avatar user={v.user} size={40} />
                  <span className="info-name">{v.user.name}</span>
                  {v.reaction && <span className="sv-viewer-reaction">{v.reaction}</span>}
                  <time>{when(v.viewedAt)}</time>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {confirmDelete && (
        <ConfirmDialog title="Delete this status?" message="It will be removed for everyone." confirmLabel="Delete" danger onConfirm={remove} onClose={() => setConfirmDelete(false)} />
      )}
    </div>,
    document.body
  );
}
