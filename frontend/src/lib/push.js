import axios from 'axios';

// Web Push: notifications while the app is completely closed. Needs the service
// worker, so it is only available in production builds (not the Vite dev server).
const base64ToBytes = (base64) => {
  const padded = (base64 + '='.repeat((4 - (base64.length % 4)) % 4)).replace(/-/g, '+').replace(/_/g, '/');
  return Uint8Array.from(atob(padded), c => c.charCodeAt(0));
};

export const pushSupported = () =>
  typeof window !== 'undefined' && 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;

const activeRegistration = async () => {
  if (!pushSupported()) return null;
  return (await navigator.serviceWorker.getRegistration()) || null;
};

// { available, reason?, enabled (server), subscribed (this device + account), preview }
export const getPushState = async () => {
  if (!pushSupported()) return { available: false, reason: 'Not supported by this browser' };
  const registration = await activeRegistration();
  if (!registration) return { available: false, reason: 'Available in the installed app / production build' };
  const { data } = await axios.get('/api/push/config');
  if (!data.enabled) return { available: false, reason: 'Not configured on the server' };
  const subscription = await registration.pushManager.getSubscription();
  return { available: true, enabled: true, subscribed: !!subscription && data.subscribed, preview: data.preview, publicKey: data.publicKey };
};

// Must be called from a user gesture (button tap) — never on page load.
export const enablePush = async (publicKey) => {
  const permission = await Notification.requestPermission();
  if (permission !== 'granted') throw new Error(permission === 'denied' ? 'Notifications are blocked in your browser settings' : 'Permission not granted');
  const registration = await activeRegistration();
  const subscription = (await registration.pushManager.getSubscription())
    || await registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: base64ToBytes(publicKey) });
  await axios.post('/api/push/subscribe', { subscription: subscription.toJSON() });
};

// Only removes this account's registration; other accounts on the device keep theirs.
export const disablePush = async (token) => {
  const registration = await activeRegistration();
  const subscription = await registration?.pushManager.getSubscription();
  if (!subscription) return;
  await axios.delete('/api/push/subscribe', {
    data: { endpoint: subscription.endpoint },
    ...(token ? { headers: { Authorization: `Bearer ${token}` } } : {})
  });
};
