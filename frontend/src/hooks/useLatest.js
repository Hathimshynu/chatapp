import { useLayoutEffect, useRef } from 'react';

// Ref that always holds the latest value — for reading current props/state
// inside long-lived callbacks (socket handlers, SDK events) without re-subscribing.
export default function useLatest(value) {
  const ref = useRef(value);
  useLayoutEffect(() => {
    ref.current = value;
  });
  return ref;
}
