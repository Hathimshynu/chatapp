// Normalises new (media.url) and legacy (inline base64 image/audio) messages.
export const messageMedia = (message) => {
  if (message.media?.url) return { ...message.media, url: message.localUrl || message.media.url };
  if (message.image) return { url: message.image, mimeType: 'image/*' };
  if (message.audio) return { url: message.audio, mimeType: 'audio/webm' };
  return null;
};

// WhatsApp-style status: clock (sending) → ✓ sent → ✓✓ delivered → blue ✓✓ read.
export const messageStatus = (message) => {
  if (message.status === 'pending') return 'pending';
  if (message.status === 'failed') return 'failed';
  if ((message.seen?.length || 0) > 1) return 'read';
  if ((message.deliveredTo?.length || 0) > 0) return 'delivered';
  return 'sent';
};
