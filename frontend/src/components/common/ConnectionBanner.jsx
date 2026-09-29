import { useEffect, useState } from 'react';
import { RefreshCw, WifiOff } from 'lucide-react';
import { useSocket } from '../../context/SocketContext';

const SHOW_AFTER_MS = 1500; // don't flash during the first connect or a quick blip

// Shows when the device is offline or the realtime connection is down. Messages
// sent meanwhile stay in the chat marked as failed and are retried automatically.
export default function ConnectionBanner() {
  const { connected } = useSocket();
  const [online, setOnline] = useState(() => navigator.onLine);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const up = () => setOnline(true);
    const down = () => setOnline(false);
    window.addEventListener('online', up);
    window.addEventListener('offline', down);
    return () => {
      window.removeEventListener('online', up);
      window.removeEventListener('offline', down);
    };
  }, []);

  const problem = !online || !connected;
  useEffect(() => {
    if (!problem) return undefined;
    const timer = setTimeout(() => setVisible(true), online ? SHOW_AFTER_MS : 0);
    return () => {
      clearTimeout(timer);
      setVisible(false);
    };
  }, [problem, online]);

  return (
    <div className="connection-banner-slot" role="status" aria-live="polite">
      {visible && problem && (
        <div className={`connection-banner${online ? '' : ' is-offline'}`}>
          {online ? <RefreshCw size={15} className="spin" /> : <WifiOff size={15} />}
          <span>{online ? 'Connecting…' : 'You are offline. Messages will send when you reconnect.'}</span>
        </div>
      )}
    </div>
  );
}
