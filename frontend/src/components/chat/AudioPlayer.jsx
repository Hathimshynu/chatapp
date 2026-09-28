import { useEffect, useMemo, useRef, useState } from 'react';
import { Mic, Pause, Play } from 'lucide-react';
import Avatar from '../common/Avatar';
import { formatDuration } from '../../lib/format';

let currentlyPlaying = null; // only one voice note plays at a time

const BAR_COUNT = 36;
const RATES = [1, 1.5, 2];

// Deterministic pseudo-waveform so each voice note has its own shape.
const makeBars = (seed = '') => {
  let h = [...String(seed)].reduce((acc, c) => (acc * 31 + c.charCodeAt(0)) >>> 0, 17);
  return Array.from({ length: BAR_COUNT }, (_, i) => {
    h = (h * 1103515245 + 12345) >>> 0;
    const base = 0.25 + ((h >>> 8) % 1000) / 1000 * 0.75;
    const envelope = Math.sin((i / (BAR_COUNT - 1)) * Math.PI) * 0.35 + 0.65;
    return Math.max(0.18, Math.min(1, base * envelope));
  });
};

export default function AudioPlayer({ src, knownDuration = 0, seed, sender, mine }) {
  const audioRef = useRef(null);
  const [playing, setPlaying] = useState(false);
  const [current, setCurrent] = useState(0);
  const [duration, setDuration] = useState(knownDuration);
  const [rate, setRate] = useState(1);
  const bars = useMemo(() => makeBars(seed || src), [seed, src]);
  const progress = duration ? Math.min(current / duration, 1) : 0;

  useEffect(() => () => {
    if (currentlyPlaying === audioRef.current) currentlyPlaying = null;
  }, []);

  const toggle = async () => {
    const audio = audioRef.current;
    if (!audio) return;
    if (playing) {
      audio.pause();
      return;
    }
    if (currentlyPlaying && currentlyPlaying !== audio) currentlyPlaying.pause();
    currentlyPlaying = audio;
    audio.playbackRate = rate;
    try {
      await audio.play();
    } catch {
      setPlaying(false);
    }
  };

  const seek = (event) => {
    const audio = audioRef.current;
    if (!audio || !duration) return;
    const rect = event.currentTarget.getBoundingClientRect();
    const ratio = Math.min(Math.max((event.clientX - rect.left) / rect.width, 0), 1);
    audio.currentTime = ratio * duration;
    setCurrent(audio.currentTime);
  };

  const cycleRate = (event) => {
    event.stopPropagation();
    const next = RATES[(RATES.indexOf(rate) + 1) % RATES.length];
    setRate(next);
    if (audioRef.current) audioRef.current.playbackRate = next;
  };

  const onMetadata = () => {
    const d = audioRef.current?.duration;
    // MediaRecorder webm files report Infinity; keep the duration we stored at send time.
    if (Number.isFinite(d) && d > 0) setDuration(d);
  };

  return (
    <div className={`voice${mine ? ' is-mine' : ''}`}>
      <div className="voice-avatar">
        <Avatar user={sender} size={44} />
        <span className="voice-mic"><Mic size={12} /></span>
      </div>
      <button type="button" className="voice-play" onClick={toggle} aria-label={playing ? 'Pause' : 'Play voice message'}>
        {playing ? <Pause size={22} fill="currentColor" /> : <Play size={22} fill="currentColor" />}
      </button>
      <div className="voice-body">
        <div className="voice-wave" onClick={seek} role="slider" aria-label="Seek" aria-valuemin={0} aria-valuemax={Math.round(duration)} aria-valuenow={Math.round(current)} tabIndex={0}>
          {bars.map((height, i) => (
            <span key={i} className={i / BAR_COUNT < progress ? 'is-played' : ''} style={{ height: `${height * 100}%` }} />
          ))}
          <span className="voice-knob" style={{ left: `${progress * 100}%` }} />
        </div>
        <div className="voice-meta">
          <span>{formatDuration(playing || current ? current : duration)}</span>
          {(playing || rate !== 1) && (
            <button type="button" className="voice-rate" onClick={cycleRate}>{rate}×</button>
          )}
        </div>
      </div>
      <audio
        ref={audioRef}
        src={src}
        preload="metadata"
        onLoadedMetadata={onMetadata}
        onDurationChange={onMetadata}
        onTimeUpdate={(e) => setCurrent(e.currentTarget.currentTime)}
        onPlay={() => setPlaying(true)}
        onPause={() => setPlaying(false)}
        onEnded={() => { setPlaying(false); setCurrent(0); }}
      />
    </div>
  );
}
