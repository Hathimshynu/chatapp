// Normalises new (media.url) and legacy (inline base64 image/audio) messages.
export const messageMedia = (message) => {
  if (message.media?.url) return { ...message.media, url: message.localUrl || message.media.url };
  if (message.image) return { url: message.image, mimeType: 'image/*' };
  if (message.audio) return { url: message.audio, mimeType: 'audio/webm' };
  return null;
};

// WhatsApp-style status: clock (sending) → ✓ sent → ✓✓ delivered → blue ✓✓ read.
// Group messages carry recipientCount: read/delivered once *every* member has.
export const messageStatus = (message) => {
  if (message.status === 'pending') return 'pending';
  if (message.status === 'failed') return 'failed';
  const read = Math.max((message.seen?.length || 0) - 1, 0);
  const delivered = message.deliveredTo?.length || 0;
  if (message.recipientCount) {
    if (read >= message.recipientCount) return 'read';
    if (Math.max(delivered, read) >= message.recipientCount) return 'delivered';
    return 'sent';
  }
  if (read > 0) return 'read';
  if (delivered > 0) return 'delivered';
  return 'sent';
};

// Display name / avatar holder for any conversation.
export const conversationTitle = (conversation, other) =>
  (conversation?.isGroup ? conversation.name : other?.name) || 'Unknown';

// sessionStorage key: conversation to open once the chat list has loaded (invite links).
export const PENDING_OPEN_KEY = 'chatOpenConversation';
