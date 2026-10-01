import { useState } from 'react';
import { Check, UserCheck, UserPlus, UserX, X } from 'lucide-react';
import { useFriends } from '../../context/FriendsContext';
import ConfirmDialog from '../common/ConfirmDialog';

// The one control for a relationship: Add friend → Requested (cancel) → Friends,
// or Accept / Delete when they asked you.
export default function FriendButton({ user, size = 'sm', showUnfriend = false }) {
  const { relationOf, sendRequest, accept, decline, cancel, unfriend } = useFriends();
  const [busy, setBusy] = useState(false);
  const [confirmUnfriend, setConfirmUnfriend] = useState(false);
  const relation = relationOf(user._id);
  const first = user.name?.split(' ')[0] || 'them';
  const cls = `btn btn-${size}`;

  const run = (fn) => async (event) => {
    event?.stopPropagation();
    setBusy(true);
    await fn();
    setBusy(false);
  };

  if (relation.state === 'friends') {
    return (
      <>
        <span className="friend-actions">
          <span className="friend-chip"><UserCheck size={15} /> Friends</span>
          {showUnfriend && (
            <button type="button" className={`${cls} btn-ghost`} disabled={busy} onClick={(e) => { e.stopPropagation(); setConfirmUnfriend(true); }}>
              <UserX size={15} /> Unfriend
            </button>
          )}
        </span>
        {confirmUnfriend && (
          <ConfirmDialog
            title={`Remove ${first} from friends?`}
            message="You can still message each other. You can send a new request later."
            confirmLabel="Unfriend"
            danger
            onConfirm={async () => { setConfirmUnfriend(false); await unfriend(user); }}
            onClose={() => setConfirmUnfriend(false)}
          />
        )}
      </>
    );
  }
  if (relation.state === 'incoming') {
    return (
      <span className="friend-actions">
        <button type="button" className={`${cls} btn-primary`} disabled={busy} onClick={run(() => accept(relation.requestId, user.name))} aria-label={`Accept friend request from ${user.name}`}>
          <Check size={15} /> Accept
        </button>
        <button type="button" className={`${cls} btn-ghost`} disabled={busy} onClick={run(() => decline(relation.requestId, user._id))} aria-label={`Delete friend request from ${user.name}`}>
          <X size={15} /> Delete
        </button>
      </span>
    );
  }
  if (relation.state === 'outgoing') {
    return (
      <button type="button" className={`${cls} btn-ghost friend-requested`} disabled={busy} onClick={run(() => cancel(relation.requestId, user._id))} aria-label={`Cancel friend request to ${user.name}`}>
        <UserX size={15} /> Cancel request
      </button>
    );
  }
  return (
    <button type="button" className={`${cls} btn-primary`} disabled={busy} onClick={run(() => sendRequest(user))} aria-label={`Add ${user.name} as a friend`}>
      <UserPlus size={15} /> Add friend
    </button>
  );
}
