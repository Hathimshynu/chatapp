import { useCallback, useEffect, useMemo, useState } from 'react';
import axios from 'axios';
import { Phone, PhoneIncoming, PhoneMissed, PhoneOutgoing, Users, Video } from 'lucide-react';
import { useChat } from '../../context/ChatContext';
import { useCall } from '../../context/CallContext';
import { useGroupCall } from '../../context/GroupCallContext';
import { useSocketEvent } from '../../context/SocketContext';
import Avatar from '../common/Avatar';
import { formatDuration, formatListTime, formatTime } from '../../lib/format';

export default function CallsPanel({ onOpenConversation, onOpenUser }) {
  const { conversations, otherParticipant } = useChat();
  const { startCall } = useCall();
  const { startGroupCall } = useGroupCall();
  const [calls, setCalls] = useState(null);

  const load = useCallback(async () => {
    try {
      const { data } = await axios.get('/api/messages/calls/history');
      setCalls(data);
    } catch {
      setCalls([]);
    }
  }, []);

  useEffect(() => { load(); }, [load]);
  // Call logs arrive as chat messages once a call finishes.
  const onMessage = useCallback(({ message }) => { if (message.messageType === 'call') load(); }, [load]);
  useSocketEvent('message:new', onMessage);

  // Avatars come from the chat list (the history endpoint only sends names).
  const peers = useMemo(() => {
    const map = new Map();
    conversations.forEach(c => {
      const other = otherParticipant(c);
      if (other) map.set(String(other._id), { user: other, conversation: c });
    });
    return map;
  }, [conversations, otherParticipant]);

  // Group calls: "missed" means I never joined; tapping calls the group again.
  const groupRow = (call) => {
    const conversation = conversations.find(c => String(c._id) === String(call.conversationId));
    const name = conversation?.name || call.group.name;
    const missed = call.direction === 'incoming' && !call.joined;
    const DirIcon = missed ? PhoneMissed : call.direction === 'incoming' ? PhoneIncoming : PhoneOutgoing;
    const open = () => { if (conversation) onOpenConversation(conversation); };
    return (
      <div key={call._id} className="conv-item call-row" role="button" tabIndex={0} onClick={open} onKeyDown={(e) => { if (e.key === 'Enter') open(); }}>
        <Avatar name={name} src={conversation?.avatar ?? call.group.avatar} user={{ _id: call.conversationId, name }} size={48} />
        <span className="conv-body">
          <span className={`conv-name${missed ? ' is-missed' : ''}`}>{name}</span>
          <span className={`call-meta${missed ? ' is-missed' : ''}`}>
            <DirIcon size={14} />
            <Users size={13} aria-label="Group call" />
            {formatListTime(call.createdAt)}{formatListTime(call.createdAt) !== formatTime(call.createdAt) ? `, ${formatTime(call.createdAt)}` : ''}
            {call.status === 'completed' && call.duration > 0 && ` · ${formatDuration(call.duration)}`}
          </span>
        </span>
        {conversation && (
          <button
            type="button"
            className="icon-btn call-row-btn"
            aria-label={`Group ${call.type === 'video' ? 'video' : 'voice'} call ${name}`}
            onClick={(e) => { e.stopPropagation(); startGroupCall(conversation, call.type); }}
          >
            {call.type === 'video' ? <Video size={20} /> : <Phone size={20} />}
          </button>
        )}
      </div>
    );
  };

  return (
    <div className="panel">
      <header className="panel-header"><h1>Calls</h1></header>
      <div className="panel-scroll">
        {calls === null ? (
          <p className="empty-hint">Loading…</p>
        ) : calls.length === 0 ? (
          <div className="empty-state">
            <div className="empty-icon"><Phone size={28} /></div>
            <h3>No calls yet</h3>
            <p>Start an HD voice or video call from any chat.</p>
          </div>
        ) : calls.map(call => {
          if (call.group) return groupRow(call);
          const known = call.peer && peers.get(String(call.peer._id));
          const peer = known?.user || call.peer;
          const missed = call.direction === 'incoming' && call.status !== 'completed';
          const DirIcon = missed ? PhoneMissed : call.direction === 'incoming' ? PhoneIncoming : PhoneOutgoing;
          const open = () => {
            if (known) onOpenConversation(known.conversation);
            else if (peer) onOpenUser(peer);
          };
          return (
            <div key={call._id} className="conv-item call-row" role="button" tabIndex={0} onClick={open} onKeyDown={(e) => { if (e.key === 'Enter') open(); }}>
              <Avatar user={peer} size={48} />
              <span className="conv-body">
                <span className={`conv-name${missed ? ' is-missed' : ''}`}>{peer?.name || 'Unknown'}</span>
                <span className={`call-meta${missed ? ' is-missed' : ''}`}>
                  <DirIcon size={14} />
                  {formatListTime(call.createdAt)}{formatListTime(call.createdAt) !== formatTime(call.createdAt) ? `, ${formatTime(call.createdAt)}` : ''}
                  {call.status === 'completed' && call.duration > 0 && ` · ${formatDuration(call.duration)}`}
                </span>
              </span>
              {peer && (
                <button
                  type="button"
                  className="icon-btn call-row-btn"
                  aria-label={`${call.type === 'video' ? 'Video' : 'Voice'} call ${peer.name}`}
                  onClick={(e) => { e.stopPropagation(); startCall(peer, call.type); }}
                >
                  {call.type === 'video' ? <Video size={20} /> : <Phone size={20} />}
                </button>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
