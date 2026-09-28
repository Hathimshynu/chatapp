import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  ChevronDown, Mic, MicOff, Phone, PhoneOff, SwitchCamera, Video, VideoOff, Volume2, VolumeX
} from 'lucide-react';
import Avatar from '../common/Avatar';
import VideoTile from './VideoTile';
import CallTimer from './CallTimer';
import { formatDuration } from '../../lib/format';
import { mediaUrl } from '../../lib/api';

const qualityLevel = (q) => (q === 0 ? 3 : q <= 2 ? 3 : q <= 4 ? 2 : 1);

function SignalBars({ quality }) {
  const level = qualityLevel(quality);
  return (
    <span className={`signal signal-${level}`} title={['', 'Poor connection', 'Fair connection', 'Good connection'][level]}>
      <i /><i /><i />
    </span>
  );
}

function ControlButton({ icon: Icon, label, onClick, active = false, variant = '' }) {
  return (
    <div className="call-control">
      <button
        type="button"
        className={`call-btn ${variant}${active ? ' is-active' : ''}`}
        onClick={(event) => { event.stopPropagation(); onClick(); }}
        aria-label={label}
        aria-pressed={variant ? undefined : active}
      >
        <Icon size={variant === 'end' || variant === 'accept' ? 28 : 24} />
      </button>
      <span className="call-control-label">{label}</span>
    </div>
  );
}

export default function CallScreen({ call, agora, onAccept, onReject, onEnd, onMinimize }) {
  const isVideo = call.type === 'video';
  const { status, peer } = call;
  const [swapped, setSwapped] = useState(false);
  const [controlsVisible, setControlsVisible] = useState(true);
  const hideTimer = useRef(null);

  const remoteVisible = isVideo && status === 'active' && agora.remoteVideoTrack && !agora.remoteCameraOff;
  const localVisible = isVideo && agora.localVideoTrack && !agora.cameraOff;
  // While ringing, show your own camera full-screen (like WhatsApp).
  const mainTrack = remoteVisible ? (swapped && localVisible ? agora.localVideoTrack : agora.remoteVideoTrack) : (localVisible && status !== 'incoming' ? agora.localVideoTrack : null);
  const mainIsLocal = mainTrack && mainTrack === agora.localVideoTrack;
  const pipTrack = remoteVisible && localVisible ? (swapped ? agora.remoteVideoTrack : agora.localVideoTrack) : null;
  const pipIsLocal = pipTrack && pipTrack === agora.localVideoTrack;
  const autoHide = isVideo && status === 'active' && !!mainTrack;

  // Video calls: tap to show controls; they fade after a few seconds.
  const pokeControls = () => {
    setControlsVisible(true);
    clearTimeout(hideTimer.current);
    if (autoHide) hideTimer.current = setTimeout(() => setControlsVisible(false), 4000);
  };
  useEffect(() => {
    pokeControls();
    return () => clearTimeout(hideTimer.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoHide]);

  useEffect(() => {
    const onKey = (event) => {
      if (event.key === 'Escape' && status !== 'incoming' && status !== 'ended') onMinimize();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [status, onMinimize]);

  let statusText;
  if (status === 'outgoing') statusText = call.callId ? 'Ringing…' : 'Calling…';
  else if (status === 'incoming') statusText = `Incoming ${isVideo ? 'video' : 'voice'} call`;
  else if (status === 'connecting') statusText = 'Connecting…';
  else if (status === 'ended') statusText = call.duration ? `${call.endReason} · ${formatDuration(call.duration)}` : call.endReason;
  else if (agora.reconnecting) statusText = 'Reconnecting…';
  else statusText = <CallTimer startedAt={call.startedAt} />;

  const ringing = status === 'outgoing' || status === 'incoming';
  const peerAvatar = peer?.avatar ? mediaUrl(peer.avatar) : '';

  return createPortal(
    <div
      className={`call-screen ${isVideo ? 'is-video' : 'is-audio'} status-${status}${mainTrack ? ' has-video' : ''}${controlsVisible ? '' : ' controls-hidden'}`}
      onClick={pokeControls}
      role="dialog"
      aria-label={`${isVideo ? 'Video' : 'Voice'} call with ${peer?.name}`}
    >
      <div className="call-backdrop" style={peerAvatar ? { backgroundImage: `url("${peerAvatar}")` } : undefined} />

      {mainTrack && (
        <VideoTile
          key={mainIsLocal ? 'main-local' : 'main-remote'}
          track={mainTrack}
          mirror={mainIsLocal && agora.facingMode === 'user'}
          className="call-main-video"
        />
      )}

      <header className="call-top">
        {status !== 'incoming' && status !== 'ended' && (
          <button type="button" className="call-top-btn" onClick={(e) => { e.stopPropagation(); onMinimize(); }} aria-label="Minimize call">
            <ChevronDown size={24} />
          </button>
        )}
        <div className="call-top-info">
          <span className="call-kind">
            {isVideo ? <Video size={14} /> : <Phone size={14} />}
            {isVideo ? 'HD video call' : 'HD voice call'}
          </span>
          {mainTrack && <h2 className="call-name-compact">{peer?.name}</h2>}
          {mainTrack && <p className="call-status-compact">{statusText}</p>}
        </div>
        {status === 'active' && <SignalBars quality={agora.networkQuality} />}
      </header>

      {!mainTrack && (
        <div className="call-center">
          <div className={`call-avatar${ringing ? ' is-ringing' : ''}`}>
            {ringing && <><span className="ring r1" /><span className="ring r2" /><span className="ring r3" /></>}
            <Avatar user={peer} size={132} />
          </div>
          <h2 className="call-name">{peer?.name}</h2>
          <p className="call-status">{statusText}</p>
          {isVideo && status === 'active' && agora.remoteCameraOff && (
            <p className="call-chip"><VideoOff size={14} /> Camera is off</p>
          )}
        </div>
      )}

      {pipTrack && (
        <button
          type="button"
          className="call-pip"
          onClick={(e) => { e.stopPropagation(); setSwapped(s => !s); }}
          aria-label="Swap videos"
        >
          <VideoTile
            key={pipIsLocal ? 'pip-local' : 'pip-remote'}
            track={pipTrack}
            mirror={pipIsLocal && agora.facingMode === 'user'}
          />
        </button>
      )}

      <div className="call-chips">
        {status === 'active' && agora.remoteMicMuted && (
          <span className="call-chip"><MicOff size={14} /> {peer?.name?.split(' ')[0]} is muted</span>
        )}
        {status === 'active' && agora.networkQuality >= 5 && (
          <span className="call-chip is-warn">Poor connection</span>
        )}
      </div>

      <footer className="call-controls">
        {status === 'incoming' ? (
          <>
            <ControlButton icon={PhoneOff} label="Decline" onClick={onReject} variant="end" />
            <ControlButton icon={isVideo ? Video : Phone} label="Accept" onClick={onAccept} variant="accept" />
          </>
        ) : status === 'ended' ? (
          <ControlButton icon={PhoneOff} label="Close" onClick={onEnd} variant="end" />
        ) : (
          <>
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
            <ControlButton icon={PhoneOff} label="End" onClick={onEnd} variant="end" />
          </>
        )}
      </footer>
    </div>,
    document.body
  );
}
