import { useEffect, useState } from 'react';
import axios from 'axios';
import toast from 'react-hot-toast';
import { BellRing, EyeOff } from 'lucide-react';
import { disablePush, enablePush, getPushState } from '../../lib/push';
import { errorMessage } from '../../lib/api';

// Notifications while the app is closed (Web Push). Permission is only requested
// when the user taps "Turn on" — never automatically.
export default function PushSettings() {
  const [state, setState] = useState(null);
  const [busy, setBusy] = useState(false);

  const load = () => getPushState().then(setState).catch(() => setState({ available: false, reason: 'Unavailable right now' }));
  useEffect(() => { load(); }, []);

  const toggle = async () => {
    setBusy(true);
    try {
      if (state.subscribed) await disablePush();
      else await enablePush(state.publicKey);
      await load();
    } catch (error) {
      toast.error(errorMessage(error, error.message));
    } finally {
      setBusy(false);
    }
  };

  const togglePreview = async () => {
    const preview = !state.preview;
    setState(s => ({ ...s, preview }));
    try {
      await axios.put('/api/push/preview', { preview });
    } catch (error) {
      setState(s => ({ ...s, preview: !preview }));
      toast.error(errorMessage(error));
    }
  };

  if (!state) return null;
  return (
    <>
      <button type="button" className={`settings-row${state.available ? '' : ' is-static'}`} role="switch" aria-checked={!!state.subscribed}
        onClick={state.available && !busy ? toggle : undefined}>
        <span className="settings-row-icon"><BellRing size={18} /></span>
        <span className="settings-row-text">
          When the app is closed
          <small>{state.available ? (state.subscribed ? 'Push notifications on for this device' : 'Get notified even when ChatApp is closed') : state.reason}</small>
        </span>
        {state.available && <span className={`switch${state.subscribed ? ' is-on' : ''}`}><i /></span>}
      </button>
      {state.available && state.subscribed && (
        <button type="button" className="settings-row" role="switch" aria-checked={state.preview} onClick={togglePreview}>
          <span className="settings-row-icon"><EyeOff size={18} /></span>
          <span className="settings-row-text">
            Show message text
            <small>{state.preview ? 'Notifications include a preview' : 'Notifications only say "New message"'}</small>
          </span>
          <span className={`switch${state.preview ? ' is-on' : ''}`}><i /></span>
        </button>
      )}
    </>
  );
}
