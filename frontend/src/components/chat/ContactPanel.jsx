import { useEffect, useState } from 'react';
import axios from 'axios';
import { Archive, Ban, Bell, Eraser, Mail, Phone, Pin, Play, Users, Video, X } from 'lucide-react';
import { useSocket } from '../../context/SocketContext';
import Avatar from '../common/Avatar';
import FriendButton from '../friends/FriendButton';
import { mediaUrl } from '../../lib/api';
import { formatLastSeen } from '../../lib/format';

function Toggle({ checked, onChange, label, icon: Icon }) {
  return (
    <button type="button" className="settings-row" role="switch" aria-checked={checked} onClick={onChange}>
      <span className="settings-row-icon"><Icon size={18} /></span>
      <span className="settings-row-text">{label}</span>
      <span className={`switch${checked ? ' is-on' : ''}`}><i /></span>
    </button>
  );
}

export default function ContactPanel({
  conversation, other, onClose, onCall, onOpenMedia, onTogglePin, onToggleMute, onToggleArchive, onClear, onToggleBlock
}) {
  const { isOnline, lastSeen } = useSocket();
  const [profile, setProfile] = useState(null);
  const [media, setMedia] = useState([]);
  const isTemp = String(conversation._id).startsWith('temp');

  useEffect(() => {
    let cancelled = false;
    axios.get(`/api/users/${other._id}`).then(({ data }) => { if (!cancelled) setProfile(data); }).catch(() => {});
    if (!isTemp) {
      axios.get(`/api/messages/${conversation._id}/media`).then(({ data }) => { if (!cancelled) setMedia(data); }).catch(() => {});
    }
    return () => { cancelled = true; };
  }, [other._id, conversation._id, isTemp]);

  const person = { ...other, ...profile };
  const online = isOnline(other._id);
  const blocked = !!conversation.blockedByMe;

  return (
    <aside className="contact-panel" aria-label="Contact info">
      <header className="contact-header">
        <button type="button" className="icon-btn" onClick={onClose} aria-label="Close"><X size={22} /></button>
        <h2>Contact info</h2>
      </header>
      <div className="contact-scroll">
        <div className="contact-hero">
          <Avatar user={person} size={132} ring />
          <h3>{person.name}</h3>
          <p className={online ? 'is-online' : ''}>{online ? 'online' : formatLastSeen(other._id in lastSeen ? lastSeen[other._id] : person.lastSeen)}</p>
          {!blocked && <div className="profile-friend"><FriendButton user={person} size="md" showUnfriend /></div>}
          {profile?.mutualFriends > 0 && (
            <p className="profile-mutual"><Users size={14} /> {profile.mutualFriends} mutual friend{profile.mutualFriends > 1 ? 's' : ''}</p>
          )}
          <div className="contact-actions">
            <button type="button" onClick={() => onCall('audio')} disabled={blocked}><Phone size={20} /><span>Voice</span></button>
            <button type="button" onClick={() => onCall('video')} disabled={blocked}><Video size={20} /><span>Video</span></button>
          </div>
        </div>

        <section className="contact-card">
          <h4>About</h4>
          <p>{person.status || 'Hey there! I am using ChatApp'}</p>
          {person.email && <p className="contact-email"><Mail size={16} /> {person.email}</p>}
        </section>

        {media.length > 0 && (
          <section className="contact-card">
            <h4>Media <span>{media.length}</span></h4>
            <div className="media-grid">
              {media.slice(0, 12).map(item => (
                <button key={item._id} type="button" onClick={() => onOpenMedia(item)}>
                  {item.messageType === 'video'
                    ? <><video src={mediaUrl(item.media.url)} preload="metadata" muted /><Play size={18} className="media-grid-play" fill="currentColor" /></>
                    : <img src={mediaUrl(item.media.url)} alt="" loading="lazy" />}
                </button>
              ))}
            </div>
          </section>
        )}

        {!isTemp && (
          <section className="contact-card is-list">
            <Toggle icon={Bell} label="Mute notifications" checked={!!conversation.muted} onChange={onToggleMute} />
            <Toggle icon={Pin} label="Pin chat" checked={!!conversation.pinned} onChange={onTogglePin} />
            <Toggle icon={Archive} label="Archive chat" checked={!!conversation.archived} onChange={onToggleArchive} />
            <button type="button" className="settings-row is-danger" onClick={onClear}>
              <span className="settings-row-icon"><Eraser size={18} /></span>
              <span className="settings-row-text">Clear chat</span>
            </button>
          </section>
        )}

        <section className="contact-card is-list">
          <button type="button" className="settings-row is-danger" onClick={onToggleBlock}>
            <span className="settings-row-icon"><Ban size={18} /></span>
            <span className="settings-row-text">{blocked ? `Unblock ${person.name}` : `Block ${person.name}`}</span>
          </button>
        </section>
      </div>
    </aside>
  );
}
