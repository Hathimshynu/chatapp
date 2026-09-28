import { useEffect, useState } from 'react';
import { formatDuration } from '../../lib/format';

// Ticks on its own so the rest of the call UI doesn't re-render every second.
export default function CallTimer({ startedAt }) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);
  return <>{formatDuration((now - startedAt) / 1000)}</>;
}
