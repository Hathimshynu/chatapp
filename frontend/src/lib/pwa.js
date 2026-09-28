import { useEffect, useState } from 'react';

export const OPEN_CONVERSATION_EVENT = 'chatapp:open-conversation';

export const registerServiceWorker = () => {
  if (!('serviceWorker' in navigator)) return;

  // Notification taps are relayed by the service worker; turn them into an app event.
  navigator.serviceWorker.addEventListener('message', (event) => {
    if (event.data?.type === 'open-conversation') {
      window.dispatchEvent(new CustomEvent(OPEN_CONVERSATION_EVENT, { detail: event.data.conversationId }));
    }
  });

  // The service worker would fight Vite's hot reload, so only use it in builds.
  if (!import.meta.env.PROD) return;
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(error => console.warn('SW registration failed:', error));
  });
};

// Mobile browsers change the visible height when the keyboard or toolbars show.
// Exposing it as --app-height keeps the composer glued above the keyboard on iOS.
export const trackViewportHeight = () => {
  const root = document.documentElement;
  const update = () => {
    const height = window.visualViewport?.height || window.innerHeight;
    root.style.setProperty('--app-height', `${Math.round(height)}px`);
  };
  update();
  window.visualViewport?.addEventListener('resize', update);
  window.addEventListener('resize', update);
  window.addEventListener('orientationchange', update);
};

export const isStandalone = () =>
  window.matchMedia?.('(display-mode: standalone)').matches || window.navigator.standalone === true;

export const isIOS = () =>
  /iphone|ipad|ipod/i.test(navigator.userAgent) ||
  (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);

let deferredPrompt = null;
const listeners = new Set();
if (typeof window !== 'undefined') {
  window.addEventListener('beforeinstallprompt', (event) => {
    event.preventDefault();
    deferredPrompt = event;
    listeners.forEach(fn => fn());
  });
  window.addEventListener('appinstalled', () => {
    deferredPrompt = null;
    listeners.forEach(fn => fn());
  });
}

// { canInstall, installed, needsIOSInstructions, install() }
export const useInstallPrompt = () => {
  const [, force] = useState(0);
  useEffect(() => {
    const fn = () => force(n => n + 1);
    listeners.add(fn);
    return () => listeners.delete(fn);
  }, []);

  const installed = isStandalone();
  return {
    installed,
    canInstall: !!deferredPrompt && !installed,
    needsIOSInstructions: !installed && isIOS(),
    install: async () => {
      if (!deferredPrompt) return false;
      deferredPrompt.prompt();
      const { outcome } = await deferredPrompt.userChoice;
      deferredPrompt = null;
      listeners.forEach(fn => fn());
      return outcome === 'accepted';
    }
  };
};
