import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import axios from 'axios';
import toast from 'react-hot-toast';
import { Link2Off, Users } from 'lucide-react';
import Avatar from '../components/common/Avatar';
import { errorMessage } from '../lib/api';
import { PENDING_OPEN_KEY } from '../lib/messages';

// /join/:code — preview a group invite and join it.
export default function JoinGroup() {
  const { code } = useParams();
  const navigate = useNavigate();
  const [preview, setPreview] = useState(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    axios.get(`/api/groups/invite/${encodeURIComponent(code)}`)
      .then(({ data }) => setPreview(data))
      .catch(err => setError(errorMessage(err, 'This invite link is invalid or has been reset')));
  }, [code]);

  const openChat = (conversationId) => {
    try { sessionStorage.setItem(PENDING_OPEN_KEY, String(conversationId)); } catch { /* ignore */ }
    navigate('/', { replace: true });
  };

  const join = async () => {
    setBusy(true);
    try {
      const { data } = await axios.post(`/api/groups/invite/${encodeURIComponent(code)}/join`);
      toast.success(`You joined "${data.name}"`);
      openChat(data._id);
    } catch (err) {
      if (err.response?.status === 409 && err.response.data?.conversationId) openChat(err.response.data.conversationId);
      else {
        toast.error(errorMessage(err, 'Could not join the group'));
        setBusy(false);
      }
    }
  };

  return (
    <div className="join-page">
      <div className="join-card">
        {error ? (
          <>
            <div className="empty-icon"><Link2Off size={28} /></div>
            <h2>Invite link unavailable</h2>
            <p>{error}</p>
            <Link to="/" className="btn btn-primary">Go to chats</Link>
          </>
        ) : !preview ? (
          <span className="spinner" />
        ) : (
          <>
            <Avatar src={preview.avatar} name={preview.name} user={{ _id: code, name: preview.name }} size={104} ring />
            <h2>{preview.name}</h2>
            <p className="join-meta"><Users size={16} /> Group · {preview.memberCount} members</p>
            {preview.description && <p className="join-description">{preview.description}</p>}
            {preview.alreadyMember ? (
              <button type="button" className="btn btn-primary btn-block btn-lg" onClick={() => openChat(preview.conversationId)}>Open group</button>
            ) : (
              <button type="button" className="btn btn-primary btn-block btn-lg" disabled={busy} onClick={join}>{busy ? 'Joining…' : 'Join group'}</button>
            )}
            <Link to="/" className="link-btn">Not now</Link>
          </>
        )}
      </div>
    </div>
  );
}
