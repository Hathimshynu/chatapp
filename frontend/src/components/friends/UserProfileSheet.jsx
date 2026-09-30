import { useEffect, useState } from 'react';
import axios from 'axios';
import { Mail, MessageCircle, Phone, Users, Video } from 'lucide-react';
import { useSocket } from '../../context/SocketContext';
import { useCall } from '../../context/CallContext';
import { formatLastSeen } from '../../lib/format';
import Avatar from '../common/Avatar';
import Dialog from '../common/Dialog';
import FriendButton from './FriendButton';

// Anyone's profile: photo, name, about, presence (all privacy-filtered by the
// server), mutual friends, and Add friend / Message / Call.
export default function UserProfileSheet({ user: initial, onClose, onMessage }) {
  const { isOnline, lastSeen } = useSocket();
  const { startCall } = useCall();
  const [profile, setProfile] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;
    axios.get(`/api/users/${initial._id}`)
      .then(({ data }) => { if (!cancelled) setProfile(data); })
      .catch((e) => { if (!cancelled) setError(e.response?.status === 404 ? 'This account no longer exists.' : 'Could not load this profile.'); });
    return () => { cancelled = true; };
  }, [initial._id]);

  const person = { ...initial, ...profile };
  const online = isOnline(person._id);
  const seen = person._id in lastSeen ? lastSeen[person._id] : person.lastSeen;
  const blocked = !!profile?.blockedByMe;

  return (
    <Dialog title="Profile" onClose={onClose} className="profile-sheet">
      <div className="profile-view">
        <Avatar user={person} size={112} ring />
        <h3 className="profile-name">{person.name}</h3>
        <p className={`profile-presence${online ? ' is-online' : ''}`}>
          {online ? 'online' : formatLastSeen(seen)}
        </p>
        {error && <p className="profile-error" role="alert">{error}</p>}

        {profile && profile.friendship?.state !== 'self' && (
          <div className="profile-friend">
            <FriendButton user={person} size="md" showUnfriend />
          </div>
        )}
        {profile?.mutualFriends > 0 && (
          <p className="profile-mutual"><Users size={14} /> {profile.mutualFriends} mutual friend{profile.mutualFriends > 1 ? 's' : ''}</p>
        )}

        {profile?.friendship?.state !== 'self' && (
          <div className="contact-actions profile-actions">
            <button type="button" onClick={() => { onClose(); onMessage(person); }}><MessageCircle size={20} /><span>Message</span></button>
            <button type="button" disabled={blocked} onClick={() => { onClose(); startCall(person, 'audio'); }}><Phone size={20} /><span>Voice</span></button>
            <button type="button" disabled={blocked} onClick={() => { onClose(); startCall(person, 'video'); }}><Video size={20} /><span>Video</span></button>
          </div>
        )}

        <section className="contact-card profile-about">
          <h4>About</h4>
          <p>{person.status || (profile ? 'Hey there! I am using ChatApp' : '…')}</p>
          {person.email && <p className="contact-email"><Mail size={16} /> {person.email}</p>}
        </section>
      </div>
    </Dialog>
  );
}
