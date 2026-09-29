import { useEffect, useMemo, useRef, useState } from 'react';
import axios from 'axios';
import toast from 'react-hot-toast';
import {
  Bell, Camera, Check, Copy, EllipsisVertical, Eraser, Link2, LogOut, MessageCircle, Pencil, Pin, Play,
  RefreshCw, Share2, ShieldCheck, ShieldOff, Trash2, UserMinus, UserPlus, X
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { useChat } from '../../context/ChatContext';
import { useSocket } from '../../context/SocketContext';
import Avatar from '../common/Avatar';
import Dialog from '../common/Dialog';
import ConfirmDialog from '../common/ConfirmDialog';
import Menu from '../common/Menu';
import UserPicker from '../common/UserPicker';
import useContacts from '../../hooks/useContacts';
import { errorMessage, mediaUrl, uploadMedia } from '../../lib/api';
import { compressImage } from '../../lib/media';
import { formatDayLabel } from '../../lib/format';

const PERMISSION_ROWS = [
  { key: 'editInfo', label: 'Edit group info', hint: 'Name, photo and description' },
  { key: 'sendMessages', label: 'Send messages' },
  { key: 'addMembers', label: 'Add members' }
];

function Toggle({ checked, onChange, label, icon: Icon }) {
  return (
    <button type="button" className="settings-row" role="switch" aria-checked={checked} onClick={onChange}>
      <span className="settings-row-icon"><Icon size={18} /></span>
      <span className="settings-row-text">{label}</span>
      <span className={`switch${checked ? ' is-on' : ''}`}><i /></span>
    </button>
  );
}

function EditTextDialog({ title, initial, maxLength, multiline, onSave, onClose }) {
  const [value, setValue] = useState(initial || '');
  const [busy, setBusy] = useState(false);
  const Field = multiline ? 'textarea' : 'input';
  return (
    <Dialog
      title={title}
      onClose={onClose}
      footer={(
        <button type="button" className="btn btn-primary btn-block" disabled={busy || (!multiline && !value.trim())}
          onClick={async () => { setBusy(true); if (await onSave(value.trim())) onClose(); else setBusy(false); }}>
          {busy ? 'Saving…' : 'Save'}
        </button>
      )}
    >
      <label className="field">
        <Field value={value} onChange={(e) => setValue(e.target.value)} maxLength={maxLength} rows={multiline ? 4 : undefined} autoFocus />
        <small>{value.length}/{maxLength}</small>
      </label>
    </Dialog>
  );
}

export default function GroupInfoPanel({ conversation, onClose, onOpenMedia, onMessageUser }) {
  const { user } = useAuth();
  const { patchConversation } = useChat();
  const { isOnline } = useSocket();
  const contacts = useContacts();
  const me = String(user._id);
  const gid = String(conversation._id);
  const isAdmin = conversation.myRole === 'admin';
  const settings = conversation.settings || {};
  const canEditInfo = isAdmin || settings.editInfo === 'all';
  const canAdd = isAdmin || settings.addMembers === 'all';

  const [media, setMedia] = useState([]);
  const [invite, setInvite] = useState(conversation.inviteCode || null);
  const [editing, setEditing] = useState(null); // 'name' | 'description'
  const [adding, setAdding] = useState(false);
  const [newMembers, setNewMembers] = useState([]);
  const [confirm, setConfirm] = useState(null); // { title, message, label, action }
  const [busy, setBusy] = useState(false);
  const photoRef = useRef(null);

  useEffect(() => {
    let cancelled = false;
    axios.get(`/api/messages/${gid}/media`).then(({ data }) => { if (!cancelled) setMedia(data); }).catch(() => {});
    if (isAdmin) axios.get(`/api/groups/${gid}`).then(({ data }) => { if (!cancelled) setInvite(data.inviteCode || null); }).catch(() => {});
    return () => { cancelled = true; };
  }, [gid, isAdmin]);

  const roles = useMemo(() => new Map((conversation.members || []).map(m => [String(m.user), m])), [conversation.members]);
  const members = useMemo(() => [...(conversation.participants || [])].sort((a, b) => {
    const ra = roles.get(String(a._id))?.role === 'admin' ? 0 : 1;
    const rb = roles.get(String(b._id))?.role === 'admin' ? 0 : 1;
    if (String(a._id) === me) return -1;
    if (String(b._id) === me) return 1;
    return ra - rb || a.name.localeCompare(b.name);
  }), [conversation.participants, roles, me]);
  const onlineCount = members.filter(m => String(m._id) !== me && isOnline(m._id)).length;

  // Every change goes through the server (which re-checks permissions);
  // the response is merged into the chat list.
  const call = async (request, success) => {
    try {
      const { data } = await request();
      if (data?._id) patchConversation(gid, data);
      if (success) toast.success(success);
      return data || true;
    } catch (error) {
      toast.error(errorMessage(error));
      return false;
    }
  };

  const onPhoto = async (event) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file?.type.startsWith('image/')) return;
    try {
      const { blob } = await compressImage(file, { maxSize: 640 });
      const { url } = await uploadMedia(blob, { name: 'group.jpg' });
      await call(() => axios.patch(`/api/groups/${gid}`, { avatar: url }), 'Group photo updated');
    } catch (error) {
      toast.error(errorMessage(error, 'Could not upload photo'));
    }
  };

  const inviteLink = invite ? `${window.location.origin}/join/${invite}` : '';
  const copyLink = async () => {
    try { await navigator.clipboard.writeText(inviteLink); toast.success('Invite link copied'); } catch { toast.error('Could not copy'); }
  };
  const shareLink = () => navigator.share?.({ title: conversation.name, text: `Join "${conversation.name}" on ChatApp`, url: inviteLink }).catch(() => {});

  const runConfirm = async () => {
    setBusy(true);
    const ok = await confirm.action();
    setBusy(false);
    if (ok !== false) setConfirm(null);
  };

  return (
    <aside className="contact-panel group-panel" aria-label="Group info">
      <header className="contact-header">
        <button type="button" className="icon-btn" onClick={onClose} aria-label="Close"><X size={22} /></button>
        <h2>Group info</h2>
      </header>
      <div className="contact-scroll">
        <div className="contact-hero">
          <div className="profile-photo">
            <Avatar src={conversation.avatar} name={conversation.name} user={{ _id: gid, name: conversation.name }} size={132} ring />
            {canEditInfo && (
              <button type="button" className="profile-photo-btn" onClick={() => photoRef.current?.click()} aria-label="Change group photo">
                <Camera size={18} />
              </button>
            )}
            <input ref={photoRef} type="file" accept="image/*" hidden onChange={onPhoto} />
          </div>
          <h3 className="group-title">
            {conversation.name}
            {canEditInfo && <button type="button" className="icon-btn icon-btn-sm" onClick={() => setEditing('name')} aria-label="Edit group name"><Pencil size={16} /></button>}
          </h3>
          <p>Group · {members.length} members{onlineCount ? ` · ${onlineCount} online` : ''}</p>
        </div>

        <section className="contact-card">
          <h4>
            Description
            {canEditInfo && <button type="button" className="link-btn" onClick={() => setEditing('description')}>Edit</button>}
          </h4>
          <p className={conversation.description ? '' : 'muted'}>{conversation.description || 'No description'}</p>
          {conversation.createdAt && <p className="contact-meta">Created {formatDayLabel(conversation.createdAt).toLowerCase()}</p>}
        </section>

        {isAdmin && (
          <section className="contact-card">
            <h4>Invite link</h4>
            {invite ? (
              <>
                <div className="invite-link"><Link2 size={16} /><span>{inviteLink}</span></div>
                <div className="invite-actions">
                  <button type="button" className="btn btn-sm btn-ghost" onClick={copyLink}><Copy size={16} /> Copy</button>
                  {navigator.share && <button type="button" className="btn btn-sm btn-ghost" onClick={shareLink}><Share2 size={16} /> Share</button>}
                  <button type="button" className="btn btn-sm btn-ghost" onClick={() => setConfirm({
                    title: 'Reset invite link?', message: 'The current link will stop working. Anyone who has it won\'t be able to join.', label: 'Reset link',
                    action: async () => { const data = await call(() => axios.post(`/api/groups/${gid}/invite`), 'New invite link created'); if (data) setInvite(data.inviteCode); return data; }
                  })}><RefreshCw size={16} /> Reset</button>
                  <button type="button" className="btn btn-sm btn-soft-danger" onClick={() => setConfirm({
                    title: 'Turn off invite link?', message: 'Nobody will be able to join with the link.', label: 'Turn off', danger: true,
                    action: async () => { const data = await call(() => axios.delete(`/api/groups/${gid}/invite`), 'Invite link turned off'); if (data) setInvite(null); return data; }
                  })}><X size={16} /> Turn off</button>
                </div>
              </>
            ) : (
              <button type="button" className="btn btn-sm btn-primary" onClick={async () => {
                const data = await call(() => axios.post(`/api/groups/${gid}/invite`));
                if (data) setInvite(data.inviteCode);
              }}><Link2 size={16} /> Create invite link</button>
            )}
          </section>
        )}

        {isAdmin && (
          <section className="contact-card">
            <h4>Group permissions</h4>
            {PERMISSION_ROWS.map(({ key, label, hint }) => (
              <div key={key} className="permission-row">
                <span>{label}{hint && <small>{hint}</small>}</span>
                <div className="segmented small" role="radiogroup" aria-label={label}>
                  {[['all', 'Everyone'], ['admins', 'Admins']].map(([value, text]) => (
                    <button key={value} type="button" role="radio" aria-checked={(settings[key] || (key === 'sendMessages' ? 'all' : 'admins')) === value}
                      className={(settings[key] || (key === 'sendMessages' ? 'all' : 'admins')) === value ? 'is-active' : ''}
                      onClick={() => call(() => axios.patch(`/api/groups/${gid}/settings`, { [key]: value }))}>
                      {text}
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </section>
        )}

        <section className="contact-card is-list">
          <h4 className="list-heading">{members.length} members</h4>
          {canAdd && (
            <button type="button" className="settings-row" onClick={() => { setNewMembers([]); setAdding(true); }}>
              <span className="settings-row-icon is-brand"><UserPlus size={18} /></span>
              <span className="settings-row-text">Add members</span>
            </button>
          )}
          {members.map(member => {
            const id = String(member._id);
            const admin = roles.get(id)?.role === 'admin';
            const self = id === me;
            return (
              <div key={id} className="member-row">
                <button type="button" className="member-main" disabled={self} onClick={() => onMessageUser(member)}>
                  <Avatar user={member} size={42} online={!self && isOnline(id)} />
                  <span className="member-info">
                    <strong>{self ? 'You' : member.name}</strong>
                    <span>{member.status || member.email}</span>
                  </span>
                  {admin && <span className="role-badge">Admin</span>}
                </button>
                {isAdmin && !self && (
                  <Menu
                    trigger={<EllipsisVertical size={18} />}
                    label={`Options for ${member.name}`}
                    items={[
                      { icon: MessageCircle, label: `Message ${member.name.split(' ')[0]}`, onClick: () => onMessageUser(member) },
                      admin
                        ? { icon: ShieldOff, label: 'Dismiss as admin', onClick: () => call(() => axios.delete(`/api/groups/${gid}/admins/${id}`)) }
                        : { icon: ShieldCheck, label: 'Make group admin', onClick: () => call(() => axios.post(`/api/groups/${gid}/admins/${id}`)) },
                      {
                        icon: UserMinus, label: 'Remove from group', danger: true, onClick: () => setConfirm({
                          title: `Remove ${member.name}?`, message: 'They will no longer see new messages in this group.', label: 'Remove', danger: true,
                          action: () => call(() => axios.delete(`/api/groups/${gid}/members/${id}`), `${member.name} removed`)
                        })
                      }
                    ]}
                  />
                )}
              </div>
            );
          })}
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

        <section className="contact-card is-list">
          <Toggle icon={Bell} label="Mute notifications" checked={!!conversation.muted} onChange={() => call(async () => {
            await axios.post(`/api/messages/conversation/${gid}/mute`, { value: !conversation.muted });
            patchConversation(gid, { muted: !conversation.muted });
            return {};
          })} />
          <Toggle icon={Pin} label="Pin chat" checked={!!conversation.pinned} onChange={() => call(async () => {
            await axios.post(`/api/messages/conversation/${gid}/pin`, { value: !conversation.pinned });
            patchConversation(gid, { pinned: !conversation.pinned });
            return {};
          })} />
          <button type="button" className="settings-row" onClick={() => setConfirm({
            title: 'Clear this chat?', message: 'Messages will be removed for you only.', label: 'Clear chat', danger: true,
            action: () => call(() => axios.post(`/api/messages/conversation/${gid}/clear`), 'Chat cleared')
          })}>
            <span className="settings-row-icon"><Eraser size={18} /></span>
            <span className="settings-row-text">Clear chat</span>
          </button>
          <button type="button" className="settings-row is-danger" onClick={() => setConfirm({
            title: `Leave "${conversation.name}"?`,
            message: isAdmin && members.filter(m => roles.get(String(m._id))?.role === 'admin').length === 1 && members.length > 1
              ? 'You are the only admin. The longest-standing member will become admin.'
              : 'You will stop receiving messages from this group.',
            label: 'Leave group', danger: true,
            action: () => call(() => axios.post(`/api/groups/${gid}/leave`))
          })}>
            <span className="settings-row-icon"><LogOut size={18} /></span>
            <span className="settings-row-text">Leave group</span>
          </button>
          {isAdmin && (
            <button type="button" className="settings-row is-danger" onClick={() => setConfirm({
              title: `Delete "${conversation.name}"?`, message: 'The group and all of its messages will be deleted for everyone. This cannot be undone.', label: 'Delete group', danger: true,
              action: () => call(() => axios.delete(`/api/groups/${gid}`))
            })}>
              <span className="settings-row-icon"><Trash2 size={18} /></span>
              <span className="settings-row-text">Delete group</span>
            </button>
          )}
        </section>
      </div>

      {editing && (
        <EditTextDialog
          title={editing === 'name' ? 'Group name' : 'Group description'}
          initial={editing === 'name' ? conversation.name : conversation.description}
          maxLength={editing === 'name' ? 60 : 500}
          multiline={editing === 'description'}
          onClose={() => setEditing(null)}
          onSave={(value) => call(() => axios.patch(`/api/groups/${gid}`, { [editing]: value }))}
        />
      )}

      {adding && (
        <Dialog
          title="Add members"
          wide
          onClose={() => setAdding(false)}
          footer={(
            <button type="button" className="btn btn-primary btn-block" disabled={!newMembers.length || busy} onClick={async () => {
              setBusy(true);
              const ok = await call(() => axios.post(`/api/groups/${gid}/members`, { userIds: newMembers.map(u => u._id) }), `Added ${newMembers.length} ${newMembers.length === 1 ? 'person' : 'people'}`);
              setBusy(false);
              if (ok) setAdding(false);
            }}>
              <Check size={18} /> Add {newMembers.length || ''}
            </button>
          )}
        >
          <UserPicker selected={newMembers} onChange={setNewMembers} suggestions={contacts} excludeIds={members.map(m => m._id)} />
        </Dialog>
      )}

      {confirm && (
        <ConfirmDialog
          title={confirm.title}
          message={confirm.message}
          confirmLabel={confirm.label}
          danger={confirm.danger}
          busy={busy}
          onConfirm={runConfirm}
          onClose={() => setConfirm(null)}
        />
      )}
    </aside>
  );
}
