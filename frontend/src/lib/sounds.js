// Tiny synthesized sounds — no audio files to download.
let ctx = null;

const getContext = () => {
  if (typeof window === 'undefined') return null;
  const AudioCtx = window.AudioContext || window.webkitAudioContext;
  if (!AudioCtx) return null;
  if (!ctx) ctx = new AudioCtx();
  if (ctx.state === 'suspended') ctx.resume().catch(() => {});
  return ctx;
};

// Browsers only allow audio after a user gesture; unlock on the first tap/click.
if (typeof window !== 'undefined') {
  const unlock = () => {
    getContext();
    window.removeEventListener('pointerdown', unlock);
    window.removeEventListener('keydown', unlock);
  };
  window.addEventListener('pointerdown', unlock);
  window.addEventListener('keydown', unlock);
}

const tone = (audio, { freq, start, duration, gain = 0.18, type = 'sine' }) => {
  const osc = audio.createOscillator();
  const amp = audio.createGain();
  osc.type = type;
  osc.frequency.value = freq;
  amp.gain.setValueAtTime(0, start);
  amp.gain.linearRampToValueAtTime(gain, start + 0.015);
  amp.gain.exponentialRampToValueAtTime(0.0001, start + duration);
  osc.connect(amp).connect(audio.destination);
  osc.start(start);
  osc.stop(start + duration + 0.05);
};

export const playMessageSound = () => {
  const audio = getContext();
  if (!audio || audio.state !== 'running') return;
  const t = audio.currentTime;
  tone(audio, { freq: 880, start: t, duration: 0.12, gain: 0.12 });
  tone(audio, { freq: 1318.5, start: t + 0.09, duration: 0.18, gain: 0.1 });
};

export const playSentSound = () => {
  const audio = getContext();
  if (!audio || audio.state !== 'running') return;
  tone(audio, { freq: 1046.5, start: audio.currentTime, duration: 0.08, gain: 0.06 });
};

// Returns a stop() function.
export const startRingtone = (kind = 'incoming') => {
  const audio = getContext();
  let stopped = false;
  let timer = null;

  const ringIncoming = () => {
    if (!audio || stopped) return;
    const t = audio.currentTime;
    [659.25, 783.99, 987.77, 783.99].forEach((freq, i) =>
      tone(audio, { freq, start: t + i * 0.16, duration: 0.3, gain: 0.16, type: 'triangle' }));
    [659.25, 783.99, 987.77, 1318.5].forEach((freq, i) =>
      tone(audio, { freq, start: t + 0.8 + i * 0.16, duration: 0.3, gain: 0.16, type: 'triangle' }));
    if (navigator.vibrate) navigator.vibrate([400, 200, 400]);
  };

  const ringOutgoing = () => {
    if (!audio || stopped) return;
    const t = audio.currentTime;
    tone(audio, { freq: 440, start: t, duration: 1.2, gain: 0.07 });
    tone(audio, { freq: 480, start: t, duration: 1.2, gain: 0.07 });
  };

  const ring = kind === 'incoming' ? ringIncoming : ringOutgoing;
  ring();
  timer = setInterval(ring, kind === 'incoming' ? 2600 : 3000);

  return () => {
    stopped = true;
    clearInterval(timer);
    if (navigator.vibrate) navigator.vibrate(0);
  };
};

export const playEndTone = () => {
  const audio = getContext();
  if (!audio || audio.state !== 'running') return;
  const t = audio.currentTime;
  tone(audio, { freq: 480, start: t, duration: 0.18, gain: 0.1 });
  tone(audio, { freq: 360, start: t + 0.2, duration: 0.25, gain: 0.1 });
};
