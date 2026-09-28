const DAY = 24 * 60 * 60 * 1000;

const startOfDay = (date) => {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d;
};

const daysAgo = (date) => Math.round((startOfDay(new Date()) - startOfDay(date)) / DAY);

export const isSameDay = (a, b) => startOfDay(a).getTime() === startOfDay(b).getTime();

export const formatTime = (date) =>
  date ? new Date(date).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }) : '';

// Sidebar timestamps: 10:42 · Yesterday · Tue · 12/03/2026
export const formatListTime = (date) => {
  if (!date) return '';
  const ago = daysAgo(date);
  if (ago <= 0) return formatTime(date);
  if (ago === 1) return 'Yesterday';
  if (ago < 7) return new Date(date).toLocaleDateString([], { weekday: 'short' });
  return new Date(date).toLocaleDateString([], { day: '2-digit', month: '2-digit', year: '2-digit' });
};

// Separators inside a chat: Today · Yesterday · Monday · 12 March 2026
export const formatDayLabel = (date) => {
  const ago = daysAgo(date);
  if (ago <= 0) return 'Today';
  if (ago === 1) return 'Yesterday';
  if (ago < 7) return new Date(date).toLocaleDateString([], { weekday: 'long' });
  const d = new Date(date);
  const sameYear = d.getFullYear() === new Date().getFullYear();
  return d.toLocaleDateString([], { day: 'numeric', month: 'long', ...(sameYear ? {} : { year: 'numeric' }) });
};

export const formatLastSeen = (date) => {
  if (!date) return 'offline';
  const ago = daysAgo(date);
  const time = formatTime(date);
  if (ago <= 0) return `last seen today at ${time}`;
  if (ago === 1) return `last seen yesterday at ${time}`;
  if (ago < 7) return `last seen ${new Date(date).toLocaleDateString([], { weekday: 'long' })} at ${time}`;
  return `last seen ${new Date(date).toLocaleDateString([], { day: 'numeric', month: 'short', year: 'numeric' })}`;
};

export const formatDuration = (totalSeconds) => {
  const secs = Math.max(0, Math.floor(totalSeconds || 0));
  const h = Math.floor(secs / 3600);
  const m = Math.floor((secs % 3600) / 60);
  const s = String(secs % 60).padStart(2, '0');
  return h ? `${h}:${String(m).padStart(2, '0')}:${s}` : `${m}:${s}`;
};

export const formatBytes = (bytes) => {
  if (!bytes) return '';
  const units = ['B', 'KB', 'MB', 'GB'];
  const i = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  return `${(bytes / 1024 ** i).toFixed(i ? 1 : 0)} ${units[i]}`;
};

export const fileExtension = (name = '') => {
  const match = /\.([a-z0-9]{1,6})$/i.exec(name);
  return match ? match[1].toUpperCase() : 'FILE';
};

// Short preview used in the chat list and reply quotes.
export const messagePreview = (message, currentUserId) => {
  if (!message) return '';
  const mine = String(message.sender?._id || message.sender) === String(currentUserId);
  if (message.deleted) return mine ? 'You deleted this message' : 'This message was deleted';
  switch (message.messageType) {
    case 'image': return message.text || 'Photo';
    case 'video': return message.text || 'Video';
    case 'audio': return `Voice message${message.media?.duration ? ` (${formatDuration(message.media.duration)})` : ''}`;
    case 'file': return message.media?.name || 'Document';
    case 'sticker': return 'Sticker';
    case 'call': {
      const kind = message.call?.type === 'video' ? 'video' : 'voice';
      const missed = !mine && message.call?.status !== 'completed';
      return missed ? `Missed ${kind} call` : `${kind[0].toUpperCase()}${kind.slice(1)} call`;
    }
    default: return message.text || '';
  }
};

const EMOJI_ONLY = /^(?:\p{Extended_Pictographic}|\p{Emoji_Component}|‍|️|\s)+$/u;
const EMOJI_UNIT = /\p{Extended_Pictographic}/gu;

// WhatsApp shows messages of 1–3 emoji in a large size.
export const jumboEmojiCount = (text = '') => {
  if (!text || text.length > 40 || !EMOJI_ONLY.test(text)) return 0;
  const count = (text.match(EMOJI_UNIT) || []).length;
  return count > 0 && count <= 3 ? count : 0;
};

const URL_PATTERN = /(https?:\/\/[^\s<]+[^\s<.,:;"')\]!?])/gi;

export const splitLinks = (text = '') => {
  const parts = [];
  let last = 0;
  for (const match of text.matchAll(URL_PATTERN)) {
    if (match.index > last) parts.push({ text: text.slice(last, match.index) });
    parts.push({ text: match[0], href: match[0] });
    last = match.index + match[0].length;
  }
  if (last < text.length) parts.push({ text: text.slice(last) });
  return parts;
};
