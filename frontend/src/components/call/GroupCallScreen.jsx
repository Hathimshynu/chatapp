import { useEffect } from 'react';
import { createPortal } from 'react-dom';
import {
  ChevronDown, Mic, MicOff, PhoneOff, SwitchCamera, Users, Video, VideoOff, Volume2, VolumeX
} from 'lucide-react';
import Avatar from '../common/Avatar';
import VideoTile from './VideoTile';
import CallTimer from './CallTimer';
import { useAuth } from '../../context/AuthContext';

function ControlButton({ icon: Icon, label, onClick, active = false, variant = '' }) {
  return (
    <div className="call-control">
      <button
        type="button"
        className={`call-btn ${variant}${active ? ' is-active' : ''}`}
        onClick={onClick}
        aria-label={label}
        aria-pressed={variant ? undefined : active}
      >
        <Icon size={variant === 'end' ? 28 : 24} />
      </button>
      <span className="call-control-label">{label}</span>
    </div>
  );
}

function Tile({ person, track, mirror, muted, speaking, connecting, isVideo }) {
  const name = person?.name || 'Member';
  return (
    <div className={`gc-tile${speaking ? ' is-speaking' : ''}`}>
      {isVideo && track ? (
        <VideoTile track={track} mirror={mirror} />
      ) : (
        <div className="gc-tile-avatar"><Avatar user={person} name={name} size={72} /></div>
      )}
      <span className="gc-tile-name">
        {muted && <MicOff size={13} aria-label="muted" />}
        {name}
        {connecting && <em> · connecting…</em>}
      </span>
    </div>
  );
}

// Grid layout: 1 → full, 2 → split, 3–4 → 2×2, 5–6 → 2×3 / 3×2, 7–8 → 3×3.
const gridClass = (count) => `gc-grid gc-n${Math.min(count, 9)}`;

export default function GroupCallScreen({ call, group, agora, onLeave, onMinimize }) {
  const { user } = useAuth();
  const isVideo = call.type === 'video';
  const members = new Map((group?.participants || []).map(p => [String(p._id), p]));
  const nameOf = (id) => members.get(String(id)) || { _id: id, name: 'Member' };

  useEffect(() => {
    const onKey = (event) => { if (event.key === 'Escape') onMinimize(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onMinimize]);

  // Everyone the server says is in the call; people Agora has not delivered yet show "connecting".
  const remoteIds = new Set(Object.keys(agora.remotes));
  (call.participants || []).forEach(id => { if (String(id) !== String(user._id)) remoteIds.add(String(id)); });
  const tiles = [
    <Tile
      key="me"
      person={{ ...user, name: 'You' }}
      track={agora.cameraOff ? null : agora.localVideoTrack}
      mirror={agora.facingMode === 'user'}
      muted={agora.micMuted}
      speaking={!agora.micMuted && agora.activeSpeaker === String(user._id)}
      isVideo={isVideo}
    />,
    ...[...remoteIds].map(id => {
      const remote = agora.remotes[id];
      return (
        <Tile
          key={id}
          person={nameOf(id)}
          track={remote && !remote.cameraOff ? remote.videoTrack : null}
          muted={remote ? remote.micMuted : false}
          speaking={agora.activeSpeaker === id}
          connecting={!remote}
          isVideo={isVideo}
        />
      );
    })
  ];

  let statusText;
  if (call.status === 'connecting') statusText = 'Connecting…';
  else if (agora.reconnecting) statusText = 'Reconnecting…';
  else if (tiles.length === 1) statusText = 'Waiting for others to join…';
  else statusText = <CallTimer startedAt={call.joinedAt} />;

  return createPortal(
    <div className={`call-screen group-call ${isVideo ? 'is-video' : 'is-audio'} status-${call.status}`} role="dialog" aria-label={`Group ${isVideo ? 'video' : 'voice'} call: ${call.groupName}`}>
      <div className="call-backdrop" />
      <header className="call-top">
        <button type="button" className="call-top-btn" onClick={onMinimize} aria-label="Minimize call">
          <ChevronDown size={24} />
        </button>
        <div className="call-top-info">
          <span className="call-kind">
            <Users size={14} />
            Group {isVideo ? 'video' : 'voice'} call · {tiles.length}/{call.max || 8}
          </span>
          <h2 className="call-name-compact">{call.groupName}</h2>
          <p className="call-status-compact" aria-live="polite">{statusText}</p>
        </div>
      </header>

      <div className={gridClass(tiles.length)}>{tiles}</div>

      <footer className="call-controls">
        {isVideo && agora.localVideoTrack && (
          <ControlButton icon={SwitchCamera} label="Flip" onClick={agora.switchCamera} />
        )}
        {isVideo && agora.localVideoTrack && (
          <ControlButton
            icon={agora.cameraOff ? VideoOff : Video}
            label={agora.cameraOff ? 'Camera off' : 'Camera'}
            onClick={agora.toggleCamera}
            active={agora.cameraOff}
          />
        )}
        <ControlButton
          icon={agora.micMuted ? MicOff : Mic}
          label={agora.micMuted ? 'Unmute' : 'Mute'}
          onClick={agora.toggleMic}
          active={agora.micMuted}
        />
        <ControlButton
          icon={agora.speakerOff ? VolumeX : Volume2}
          label={agora.speakerOff ? 'Sound off' : 'Speaker'}
          onClick={agora.toggleSpeaker}
          active={agora.speakerOff}
        />
        <ControlButton icon={PhoneOff} label="Leave" onClick={onLeave} variant="end" />
      </footer>
    </div>,
    document.body
  );
}
