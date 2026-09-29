import { useEffect, useRef } from 'react';

// Makes the phone/browser Back button close in-app layers (status viewer → group
// info → chat) instead of leaving the app. Each open layer owns one history entry;
// Back closes only the top-most layer.
const stack = [];
let ignoredPops = 0;

if (typeof window !== 'undefined') {
  window.addEventListener('popstate', () => {
    if (ignoredPops > 0) {
      ignoredPops -= 1;
      return;
    }
    const top = stack.pop();
    if (top) {
      top.popped = true;
      top.onClose();
    }
  });
}

export function useBackClose(open, onClose) {
  const onCloseRef = useRef(onClose);
  const entryRef = useRef(null);
  useEffect(() => { onCloseRef.current = onClose; });

  useEffect(() => {
    if (!open) return undefined;
    let entry = entryRef.current;
    if (entry?.closing) {
      // Re-mounted right after a cleanup (React StrictMode, fast re-render):
      // reuse the same history entry instead of racing history.back() with a new push.
      clearTimeout(entry.timer);
      entry.closing = false;
      stack.push(entry);
    } else {
      entry = { popped: false, closing: false, timer: null, onClose: () => onCloseRef.current() };
      entryRef.current = entry;
      stack.push(entry);
      window.history.pushState({ layer: stack.length }, '');
    }
    return () => {
      const index = stack.indexOf(entry);
      if (index >= 0) stack.splice(index, 1);
      if (entry.popped) {
        entryRef.current = null;
        return;
      }
      // Closed from the UI (or unmounted): drop our history entry on the next tick,
      // unless the layer immediately re-opens and reclaims it.
      entry.closing = true;
      entry.timer = setTimeout(() => {
        entry.closing = false;
        if (entryRef.current === entry) entryRef.current = null;
        ignoredPops += 1;
        window.history.back();
      }, 0);
    };
  }, [open]);
}
