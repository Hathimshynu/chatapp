import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import toast from 'react-hot-toast';
import {
  Bell, Camera, Check, Download, LogOut, Monitor, Moon, Plus, Share, Smartphone, Sun, Trash2
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { useTheme } from '../../context/ThemeContext';
import { useInstallPrompt } from '../../lib/pwa';
import { errorMessage, uploadMedia } from '../../lib/api';
import { compressImage } from '../../lib/media';
import { notificationPermission, requestNotificationPermission } from '../../lib/notify';
import Avatar from '../common/Avatar';
import Dialog from '../common/Dialog';

const THEMES = [
  { id: 'system', label: 'System', icon: Monitor },
  { id: 'light', label: 'Light', icon: Sun },
  { id: 'dark', label: 'Dark', icon: Moon }
];

function ProfileEditor() {
  const { user, updateUser } = useAuth();
  const [name, setName] = useState(user.name);
  const [about, setAbout] = useState(user.status || '');
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef(null);

  useEffect(() => {
    setName(user.name);
    setAbout(user.status || '');
  }, [user._id, user.name, user.status]);

  const dirty = name.trim() !== user.name || about.trim() !== (user.status || '');

  const save = async (patch) => {
    const { data } = await axios.put('/api/users/profile', patch);
    updateUser({ name: data.name, status: data.status, avatar: data.avatar });
  };

  const onSave = async (event) => {
    event.preventDefault();
    if (!name.trim()) return toast.error('Name cannot be empty');
    setSaving(true);
    try {
      await save({ name: name.trim(), status: about.trim() });
      toast.success('Profile updated');
    } catch (error) {
      toast.error(errorMessage(error, 'Could not update profile'));
    } finally {
      setSaving(false);
    }
  };

  const onPhoto = async (event) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    if (!file.type.startsWith('image/')) return toast.error('Please choose an image');
    setUploading(true);
    try {
      const { blob } = await compressImage(file, { maxSize: 640, quality: 0.86 });
      const uploaded = await uploadMedia(blob, { name: 'avatar.jpg' });
      await save({ avatar: uploaded.url });
      toast.success('Profile photo updated');
    } catch (error) {
      toast.error(errorMessage(error, 'Could not upload photo'));
    } finally {
      setUploading(false);
    }
  };

  const removePhoto = async () => {
    try {
      await save({ avatar: '' });
    } catch (error) {
      toast.error(errorMessage(error));
    }
  };

  return (
    <form className="profile-card" onSubmit={onSave}>
      <div className="profile-photo">
        <Avatar user={user} size={112} ring />
        <button type="button" className="profile-photo-btn" onClick={() => fileRef.current?.click()} aria-label="Change profile photo" disabled={uploading}>
          {uploading ? <span className="spinner spinner-sm" /> : <Camera size={18} />}
        </button>
        <input ref={fileRef} type="file" accept="image/*" hidden onChange={onPhoto} />
      </div>
      {user.avatar && (
        <button type="button" className="link-btn" onClick={removePhoto}>Remove photo</button>
      )}
      <label className="field">
        <span>Name</span>
        <input value={name} onChange={(e) => setName(e.target.value)} maxLength={50} autoComplete="name" />
        <small>{name.length}/50</small>
      </label>
      <label className="field">
        <span>About</span>
        <textarea value={about} onChange={(e) => setAbout(e.target.value)} maxLength={139} rows={2} placeholder="Hey there! I am using ChatApp" />
        <small>{about.length}/139</small>
      </label>
      <label className="field">
        <span>Email</span>
        <input value={user.email || ''} readOnly />
      </label>
      {dirty && (
        <button type="submit" className="btn btn-primary btn-block" disabled={saving}>
          {saving ? 'Saving…' : 'Save changes'}
        </button>
      )}
    </form>
  );
}

function Accounts() {
  const { user, accounts, switchAccount, removeAccount } = useAuth();
  const navigate = useNavigate();
  const [unread, setUnread] = useState({});

  // Unread badges for the accounts you're not currently using.
  useEffect(() => {
    let cancelled = false;
    accounts.filter(a => a._id !== user._id).forEach(async (account) => {
      try {
        const { data } = await axios.get('/api/messages/unread-count', {
          headers: { Authorization: `Bearer ${account.token}` }
        });
        if (!cancelled) setUnread(prev => ({ ...prev, [account._id]: data.total }));
      } catch {
        // expired session; it will be flagged when the user switches to it
      }
    });
    return () => { cancelled = true; };
  }, [accounts, user._id]);

  return (
    <section className="settings-section">
      <h3>Accounts</h3>
      <div className="settings-list">
        {accounts.map(account => (
          <div key={account._id} className={`account-row${account._id === user._id ? ' is-current' : ''}`}>
            <button type="button" className="account-main" onClick={() => account._id !== user._id && switchAccount(account._id)}>
              <Avatar user={account} size={40} />
              <span className="account-info">
                <strong>{account.name}</strong>
                <span>{account.email}</span>
              </span>
              {account._id === user._id
                ? <Check size={20} className="account-check" />
                : unread[account._id] > 0 && <span className="badge">{unread[account._id]}</span>}
            </button>
            {account._id !== user._id && (
              <button type="button" className="icon-btn icon-btn-sm" onClick={() => removeAccount(account._id)} aria-label={`Log out ${account.name}`} title="Log out of this account">
                <Trash2 size={16} />
              </button>
            )}
          </div>
        ))}
        <button type="button" className="settings-row" onClick={() => navigate('/login?add=1')}>
          <span className="settings-row-icon"><Plus size={18} /></span>
          <span>Add account</span>
        </button>
      </div>
    </section>
  );
}

export default function SettingsPanel() {
  const { user, logout, logoutAll, accounts } = useAuth();
  const { preference, setPreference } = useTheme();
  const install = useInstallPrompt();
  const [permission, setPermission] = useState(notificationPermission);
  const [showIOSHelp, setShowIOSHelp] = useState(false);

  const enableNotifications = async () => {
    const result = await requestNotificationPermission();
    setPermission(result);
    if (result === 'denied') toast.error('Notifications are blocked. Enable them in your browser settings.');
  };

  return (
    <div className="panel">
      <header className="panel-header"><h1>Settings</h1></header>
      <div className="panel-scroll settings">
        <ProfileEditor key={user._id} />
        <Accounts />

        <section className="settings-section">
          <h3>Appearance</h3>
          <div className="segmented" role="radiogroup" aria-label="Theme">
            {THEMES.map(({ id, label, icon: Icon }) => (
              <button
                key={id}
                type="button"
                role="radio"
                aria-checked={preference === id}
                className={preference === id ? 'is-active' : ''}
                onClick={() => setPreference(id)}
              >
                <Icon size={16} /> {label}
              </button>
            ))}
          </div>
        </section>

        <section className="settings-section">
          <h3>Notifications</h3>
          <div className="settings-list">
            <div className="settings-row is-static">
              <span className="settings-row-icon"><Bell size={18} /></span>
              <span className="settings-row-text">
                Message & call alerts
                <small>{permission === 'granted' ? 'On' : permission === 'denied' ? 'Blocked in browser settings' : permission === 'unsupported' ? 'Not supported on this browser' : 'Off'}</small>
              </span>
              {permission === 'default' && <button type="button" className="btn btn-sm btn-primary" onClick={enableNotifications}>Turn on</button>}
            </div>
          </div>
        </section>

        <section className="settings-section">
          <h3>App</h3>
          <div className="settings-list">
            {install.installed ? (
              <div className="settings-row is-static">
                <span className="settings-row-icon"><Smartphone size={18} /></span>
                <span className="settings-row-text">ChatApp is installed<small>You're using the app version</small></span>
              </div>
            ) : install.canInstall ? (
              <button type="button" className="settings-row" onClick={install.install}>
                <span className="settings-row-icon"><Download size={18} /></span>
                <span className="settings-row-text">Install ChatApp<small>Add to your home screen or desktop</small></span>
              </button>
            ) : install.needsIOSInstructions ? (
              <button type="button" className="settings-row" onClick={() => setShowIOSHelp(true)}>
                <span className="settings-row-icon"><Download size={18} /></span>
                <span className="settings-row-text">Install on iPhone / iPad<small>Add ChatApp to your Home Screen</small></span>
              </button>
            ) : (
              <div className="settings-row is-static">
                <span className="settings-row-icon"><Download size={18} /></span>
                <span className="settings-row-text">Install ChatApp<small>Use your browser menu → “Install app” / “Add to Home screen”</small></span>
              </div>
            )}
          </div>
        </section>

        <section className="settings-section">
          <div className="settings-list">
            <button type="button" className="settings-row is-danger" onClick={logout}>
              <span className="settings-row-icon"><LogOut size={18} /></span>
              <span>Log out {accounts.length > 1 ? `of ${user.name}` : ''}</span>
            </button>
            {accounts.length > 1 && (
              <button type="button" className="settings-row is-danger" onClick={logoutAll}>
                <span className="settings-row-icon"><LogOut size={18} /></span>
                <span>Log out of all accounts</span>
              </button>
            )}
          </div>
        </section>
        <p className="settings-footer">ChatApp · HD calling powered by Agora</p>
      </div>

      {showIOSHelp && (
        <Dialog title="Install on iPhone" onClose={() => setShowIOSHelp(false)}>
          <ol className="ios-steps">
            <li>Open ChatApp in <strong>Safari</strong>.</li>
            <li>Tap the <Share size={16} className="inline-icon" /> <strong>Share</strong> button.</li>
            <li>Choose <strong>Add to Home Screen</strong>, then tap <strong>Add</strong>.</li>
          </ol>
        </Dialog>
      )}
    </div>
  );
}
