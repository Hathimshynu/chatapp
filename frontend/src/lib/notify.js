import { OPEN_CONVERSATION_EVENT } from './pwa';

export const notificationsSupported = () => typeof window !== 'undefined' && 'Notification' in window;

export const notificationPermission = () => (notificationsSupported() ? Notification.permission : 'unsupported');

export const requestNotificationPermission = async () => {
  if (!notificationsSupported()) return 'unsupported';
  try {
    return await Notification.requestPermission();
  } catch {
    return Notification.permission;
  }
};

// Uses the service worker when available: `new Notification()` throws on Android Chrome.
export const showNotification = async (title, { body = '', tag, conversationId, icon } = {}) => {
  if (notificationPermission() !== 'granted') return;
  const options = {
    body,
    tag,
    renotify: !!tag,
    icon: icon || '/icons/icon-192.png',
    badge: '/icons/icon-192.png',
    data: { conversationId }
  };
  try {
    const registration = await navigator.serviceWorker?.getRegistration();
    if (registration) {
      await registration.showNotification(title, options);
      return;
    }
  } catch {
    // fall through to the page-level API
  }
  try {
    const notification = new Notification(title, options);
    notification.onclick = () => {
      window.focus();
      if (conversationId) {
        window.dispatchEvent(new CustomEvent(OPEN_CONVERSATION_EVENT, { detail: conversationId }));
      }
      notification.close();
    };
  } catch {
    // Notifications unavailable in this context.
  }
};
