// Shared status (stories) constants — keys must match the server's whitelist.
export const STATUS_BACKGROUNDS = {
  violet: 'linear-gradient(135deg,#5b4bff,#8b3dff)',
  ocean: 'linear-gradient(135deg,#0ea5e9,#2563eb)',
  sunset: 'linear-gradient(135deg,#f97316,#e11d48)',
  forest: 'linear-gradient(135deg,#16a34a,#0d9488)',
  rose: 'linear-gradient(135deg,#ec4899,#a855f7)',
  night: 'linear-gradient(135deg,#1e293b,#0f172a)',
  amber: 'linear-gradient(135deg,#f59e0b,#d97706)',
  slate: 'linear-gradient(135deg,#475569,#334155)'
};

export const STATUS_FONTS = {
  sans: { label: 'Aa', css: "'Inter', system-ui, sans-serif", weight: 600 },
  serif: { label: 'Serif', css: "Georgia, 'Times New Roman', serif", weight: 500 },
  bold: { label: 'Bold', css: "'Inter', system-ui, sans-serif", weight: 800 },
  mono: { label: 'Mono', css: "ui-monospace, 'SFMono-Regular', Consolas, monospace", weight: 500 }
};

export const STATUS_REACTIONS = ['❤️', '😂', '😮', '😢', '👏', '🔥'];

export const IMAGE_DURATION_MS = 6000;
export const TEXT_DURATION_MS = 6000;
export const MAX_VIDEO_MS = 30000;

export const privacyLabel = (privacy) => {
  if (privacy.mode === 'except') return `Contacts except ${privacy.users.length}`;
  if (privacy.mode === 'only') return `Only ${privacy.users.length} ${privacy.users.length === 1 ? 'contact' : 'contacts'}`;
  return 'My contacts';
};

// Last privacy choice is remembered on this device (like WhatsApp's setting),
// separately for each signed-in account.
const privacyKey = (userId) => `chatStatusPrivacy:${userId}`;
export const loadPrivacy = (userId) => {
  try {
    const saved = JSON.parse(localStorage.getItem(privacyKey(userId)) || 'null');
    if (saved && ['contacts', 'except', 'only'].includes(saved.mode) && Array.isArray(saved.users)) return saved;
  } catch { /* ignore */ }
  return { mode: 'contacts', users: [] };
};
export const savePrivacy = (userId, privacy) => {
  try { localStorage.setItem(privacyKey(userId), JSON.stringify(privacy)); } catch { /* ignore */ }
};
