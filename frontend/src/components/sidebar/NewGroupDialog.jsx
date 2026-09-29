import { useRef, useState } from 'react';
import axios from 'axios';
import toast from 'react-hot-toast';
import { ArrowLeft, ArrowRight, Camera, Users } from 'lucide-react';
import Dialog from '../common/Dialog';
import UserPicker from '../common/UserPicker';
import Avatar from '../common/Avatar';
import { useChat } from '../../context/ChatContext';
import { errorMessage, uploadMedia } from '../../lib/api';
import { compressImage } from '../../lib/media';
import useContacts from '../../hooks/useContacts';

export default function NewGroupDialog({ onClose, onCreated }) {
  const { upsertConversation } = useChat();
  const contacts = useContacts();
  const [step, setStep] = useState(1);
  const [members, setMembers] = useState([]);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [avatar, setAvatar] = useState('');
  const [busy, setBusy] = useState(false);
  const fileRef = useRef(null);

  const onPhoto = async (event) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file?.type.startsWith('image/')) return;
    setBusy(true);
    try {
      const { blob } = await compressImage(file, { maxSize: 640 });
      setAvatar((await uploadMedia(blob, { name: 'group.jpg' })).url);
    } catch (error) {
      toast.error(errorMessage(error, 'Could not upload photo'));
    } finally {
      setBusy(false);
    }
  };

  const create = async () => {
    if (!name.trim()) return toast.error('Give your group a name');
    setBusy(true);
    try {
      const { data } = await axios.post('/api/groups', {
        name: name.trim(),
        description: description.trim(),
        avatar,
        memberIds: members.map(m => m._id)
      });
      upsertConversation(data);
      toast.success(`"${data.name}" created`);
      onCreated(data);
    } catch (error) {
      toast.error(errorMessage(error, 'Could not create group'));
      setBusy(false);
    }
  };

  return (
    <Dialog
      title={step === 1 ? 'New group' : 'Group details'}
      onClose={onClose}
      wide
      footer={step === 1 ? (
        <button type="button" className="btn btn-primary btn-block" disabled={!members.length} onClick={() => setStep(2)}>
          Next {members.length ? `(${members.length})` : ''} <ArrowRight size={18} />
        </button>
      ) : (
        <div className="dialog-footer-row">
          <button type="button" className="btn btn-ghost" onClick={() => setStep(1)}><ArrowLeft size={18} /> Back</button>
          <button type="button" className="btn btn-primary" disabled={busy || !name.trim()} onClick={create}>
            {busy ? 'Creating…' : 'Create group'}
          </button>
        </div>
      )}
    >
      {step === 1 ? (
        <>
          <p className="dialog-text small">Choose at least one person to add.</p>
          <UserPicker selected={members} onChange={setMembers} suggestions={contacts} />
        </>
      ) : (
        <div className="group-form">
          <button type="button" className="group-photo-picker" onClick={() => fileRef.current?.click()} disabled={busy} aria-label="Group photo">
            {avatar
              ? <Avatar src={avatar} name={name} size={96} />
              : <span className="group-photo-empty"><Camera size={28} /><small>Add photo</small></span>}
          </button>
          <input ref={fileRef} type="file" accept="image/*" hidden onChange={onPhoto} />
          <label className="field">
            <span>Group name</span>
            <input value={name} onChange={(e) => setName(e.target.value)} maxLength={60} placeholder="e.g. Weekend Trip" autoFocus={window.matchMedia('(pointer: fine)').matches} />
            <small>{name.length}/60</small>
          </label>
          <label className="field">
            <span>Description (optional)</span>
            <textarea value={description} onChange={(e) => setDescription(e.target.value)} maxLength={500} rows={2} placeholder="What's this group about?" />
          </label>
          <div className="group-members-preview">
            <Users size={16} /> {members.length + 1} members: You, {members.map(m => m.name.split(' ')[0]).join(', ')}
          </div>
        </div>
      )}
    </Dialog>
  );
}
