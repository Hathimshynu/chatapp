import { useCallback, useEffect, useRef, useState } from 'react';
import axios from 'axios';
import useLatest from './useLatest';
import { MEDIA_CHECK_MS, RELAY_PROXY_MODE, relayAllowed, rememberRelay, startWithRelay } from '../lib/callTransport';

// HD: 1280×720 @ 30fps. Agora adapts the bitrate between these bounds to the
// network, and "detail" keeps the picture sharp rather than dropping resolution.
const HD_VIDEO = {
  encoderConfig: { width: 1280, height: 720, frameRate: 30, bitrateMin: 600, bitrateMax: 2260 },
  optimizationMode: 'detail'
};

// Wideband voice with echo cancellation, noise suppression and auto gain.
export const HD_AUDIO = {
  AEC: true,
  ANS: true,
  AGC: true,
  encoderConfig: { sampleRate: 48000, stereo: false, bitrate: 64 }
};

let agoraPromise = null;
// The SDK is large; load it only when a call actually starts.
export const loadAgora = () => {
  if (!agoraPromise) {
    agoraPromise = import('agora-rtc-sdk-ng').then(({ default: AgoraRTC }) => {
      AgoraRTC.setLogLevel(3);
      return AgoraRTC;
    });
  }
  return agoraPromise;
};

export const permissionMessage = (error, type) => {
  const code = error?.code || error?.name || '';
  if (/PERMISSION_DENIED|NotAllowedError/i.test(code) || /permission/i.test(error?.message || '')) {
    return type === 'video'
      ? 'Allow camera and microphone access to make video calls.'
      : 'Allow microphone access to make calls.';
  }
  if (/NOT_READABLE|NotReadableError|DEVICE_NOT_FOUND|NotFoundError/i.test(code)) {
    return type === 'video' ? 'Camera or microphone is unavailable.' : 'Microphone is unavailable.';
  }
  return error?.response?.data?.message || 'Could not connect the call.';
};

// Small second stream (≈200 kbps) that viewers on poor networks are switched to
// automatically, before dropping to audio-only — instead of a frozen picture.
const LOW_STREAM = { width: 320, height: 180, framerate: 15, bitrate: 200 };
const STALL_CHECK_MS = 2000;

const fetchToken = async (channelName) => {
  const { data } = await axios.get('/api/calls/token', { params: { channel: channelName } });
  return data;
};

export default function useAgoraCall({ onRemoteJoined, onRemoteLeft, onMediaMissing } = {}) {
  const clientRef = useRef(null);
  const audioTrackRef = useRef(null);
  const videoTrackRef = useRef(null);
  const remoteAudioRef = useRef(null);
  const speakerOffRef = useRef(false);
  const generationRef = useRef(0); // bumped by leave() so late async work can bail out
  const callbacks = useLatest({ onRemoteJoined, onRemoteLeft, onMediaMissing });
  const channelRef = useRef(null);
  const typeRef = useRef('audio');
  const relayRef = useRef(false); // this call goes through Agora's TCP relay
  const mediaCheckRef = useRef(null);
  const [relayed, setRelayed] = useState(false);

  const [localVideoTrack, setLocalVideoTrack] = useState(null);
  const [remoteVideoTrack, setRemoteVideoTrack] = useState(null);
  const [micMuted, setMicMuted] = useState(false);
  const [cameraOff, setCameraOff] = useState(false);
  const [speakerOff, setSpeakerOff] = useState(false);
  const [remoteMicMuted, setRemoteMicMuted] = useState(false);
  const [remoteCameraOff, setRemoteCameraOff] = useState(false);
  const [networkQuality, setNetworkQuality] = useState(0); // 0 unknown, 1 best … 6 down
  const [reconnecting, setReconnecting] = useState(false);
  const [facingMode, setFacingMode] = useState('user');
  // Remote video published but no frames arriving (bad network) → show avatar + notice.
  const [remoteVideoStalled, setRemoteVideoStalled] = useState(false);
  const stallTimerRef = useRef(null);

  const resetState = () => {
    setLocalVideoTrack(null);
    setRemoteVideoTrack(null);
    setMicMuted(false);
    setCameraOff(false);
    setSpeakerOff(false);
    setRemoteMicMuted(false);
    setRemoteCameraOff(false);
    setNetworkQuality(0);
    setReconnecting(false);
    setFacingMode('user');
    setRemoteVideoStalled(false);
    clearInterval(stallTimerRef.current);
    clearTimeout(mediaCheckRef.current);
    setRelayed(false);
    speakerOffRef.current = false;
  };

  const closeLocalTracks = () => {
    [audioTrackRef.current, videoTrackRef.current].forEach(track => {
      try { track?.stop(); track?.close(); } catch { /* already closed */ }
    });
    audioTrackRef.current = null;
    videoTrackRef.current = null;
  };

  // Create mic (+ camera) tracks. Falls back to audio-only if the camera fails.
  const prepare = useCallback(async (type) => {
    const generation = generationRef.current;
    const AgoraRTC = await loadAgora();
    const keep = (tracks) => {
      if (generation !== generationRef.current) {
        tracks.forEach(t => { t.stop(); t.close(); });
        throw new Error('cancelled');
      }
    };
    try {
      if (type === 'video') {
        try {
          const [audio, video] = await AgoraRTC.createMicrophoneAndCameraTracks(HD_AUDIO, { ...HD_VIDEO, facingMode: 'user' });
          keep([audio, video]);
          audioTrackRef.current = audio;
          videoTrackRef.current = video;
          setLocalVideoTrack(video);
          return;
        } catch (error) {
          if (error.message === 'cancelled' || /PERMISSION_DENIED|NotAllowedError/i.test(error?.code || error?.name || '')) throw error;
          // camera busy or missing — continue with voice only
          setCameraOff(true);
        }
      }
      const audio = await AgoraRTC.createMicrophoneAudioTrack(HD_AUDIO);
      keep([audio]);
      audioTrackRef.current = audio;
    } catch (error) {
      if (error.message === 'cancelled') throw error;
      closeLocalTracks();
      throw new Error(permissionMessage(error, type));
    }
  }, []);

  // Mark the remote video as stalled when no frames arrive for two checks in a row.
  const watchRemoteVideo = (client, uid) => {
    clearInterval(stallTimerRef.current);
    let idle = 0;
    stallTimerRef.current = setInterval(() => {
      if (clientRef.current !== client) {
        clearInterval(stallTimerRef.current);
        return;
      }
      const stats = client.getRemoteVideoStats?.()[uid];
      if (!stats) return;
      const receiving = (stats.receiveFrameRate || 0) > 0 || (stats.renderFrameRate || 0) > 0;
      idle = receiving ? 0 : idle + 1;
      setRemoteVideoStalled(idle >= 2);
    }, STALL_CHECK_MS);
  };

  // Wire a client's events. Kept separate so a relay reconnect can reuse it.
  const attach = (client, channelName) => {
    client.on('user-joined', () => {
      callbacks.current.onRemoteJoined?.();
      startMediaCheck(client);
    });
    client.on('user-left', (_, reason) => callbacks.current.onRemoteLeft?.(reason));
    client.on('user-published', async (remoteUser, mediaType) => {
      try {
        await client.subscribe(remoteUser, mediaType);
      } catch (error) {
        console.warn(`Call: could not receive ${mediaType}`, error?.code || error?.message);
        return;
      }
      if (clientRef.current !== client) return;
      if (mediaType === 'audio' && remoteUser.audioTrack) {
        remoteAudioRef.current = remoteUser.audioTrack;
        remoteUser.audioTrack.setVolume(speakerOffRef.current ? 0 : 100);
        remoteUser.audioTrack.play();
        setRemoteMicMuted(false);
      }
      if (mediaType === 'video' && remoteUser.videoTrack) {
        setRemoteVideoTrack(remoteUser.videoTrack);
        setRemoteCameraOff(false);
        // Poor downlink: switch to their small stream, then audio-only (Agora recovers automatically).
        try { Promise.resolve(client.setStreamFallbackOption(remoteUser.uid, 2)).catch(() => {}); } catch { /* older SDK */ }
        watchRemoteVideo(client, remoteUser.uid);
      }
    });
    client.on('user-unpublished', (_, mediaType) => {
      if (mediaType === 'video') {
        setRemoteVideoTrack(null);
        setRemoteCameraOff(true);
        setRemoteVideoStalled(false);
        clearInterval(stallTimerRef.current);
      }
    });
    client.on('stream-fallback', (_, type) => setRemoteVideoStalled(type === 'fallback'));
    // Camera state comes only from publish/unpublish above: the SDK can deliver a stale
    // "mute-video" info event after the track is already published, which would hide live video.
    client.on('user-info-updated', (_, message) => {
      if (message === 'mute-audio') setRemoteMicMuted(true);
      if (message === 'unmute-audio') setRemoteMicMuted(false);
    });
    client.on('network-quality', (stats) => {
      setNetworkQuality(Math.max(stats.uplinkNetworkQuality || 0, stats.downlinkNetworkQuality || 0));
    });
    client.on('connection-state-change', (state) => setReconnecting(state === 'RECONNECTING'));
    client.on('token-privilege-will-expire', async () => {
      try {
        const { token } = await fetchToken(channelName);
        await client.renewToken(token);
      } catch {
        // the call will drop when the token expires
      }
    });
  };

  // A few seconds after the other person joins, check their media actually arrives.
  // If not, this network path is dropping it → ask to switch both sides to the relay.
  const startMediaCheck = (client) => {
    clearTimeout(mediaCheckRef.current);
    if (relayRef.current || !relayAllowed()) return;
    mediaCheckRef.current = setTimeout(() => {
      if (clientRef.current !== client || relayRef.current) return;
      const remote = client.remoteUsers[0];
      if (!remote) return;
      const audioBytes = client.getRemoteAudioStats?.()[remote.uid]?.receiveBytes || 0;
      const videoBytes = client.getRemoteVideoStats?.()[remote.uid]?.receiveBytes || 0;
      const audioOk = remote.hasAudio && audioBytes > 0;
      const videoOk = typeRef.current !== 'video' || (remote.hasVideo && videoBytes > 0);
      if (!audioOk || !videoOk) callbacks.current.onMediaMissing?.();
    }, MEDIA_CHECK_MS);
  };

  // Create a client (direct or via the relay), join and publish the local tracks.
  const connect = async (channelName, credentials) => {
    const AgoraRTC = await loadAgora();
    const client = AgoraRTC.createClient({ mode: 'rtc', codec: 'vp8' });
    clientRef.current = client;
    if (import.meta.env.DEV) window.__agoraCall = client; // debugging aid in development only
    if (relayRef.current) client.startProxyServer(RELAY_PROXY_MODE);
    attach(client, channelName);
    const { appId, token } = credentials || await fetchToken(channelName);
    if (clientRef.current !== client) return;
    await client.join(appId, channelName, token, null);
    if (clientRef.current !== client) {
      await client.leave();
      return;
    }
    if (videoTrackRef.current) {
      try {
        client.setLowStreamParameter(LOW_STREAM);
        await client.enableDualStream();
      } catch {
        // dual stream unsupported on this browser — the single HD stream still works
      }
    }
    const tracks = [audioTrackRef.current, videoTrackRef.current].filter(Boolean);
    if (tracks.length) await client.publish(tracks);
    if (client.remoteUsers.length) startMediaCheck(client); // they were already in the channel
  };

  const join = useCallback(async ({ channelName, type }) => {
    if (clientRef.current) return;
    channelRef.current = channelName;
    typeRef.current = type;
    relayRef.current = startWithRelay();
    setRelayed(relayRef.current);
    try {
      const [credentials] = await Promise.all([
        fetchToken(channelName),
        audioTrackRef.current ? Promise.resolve() : prepare(type)
      ]);
      if (channelRef.current !== channelName) return; // hung up meanwhile
      await connect(channelName, credentials);
    } catch (error) {
      const client = clientRef.current;
      client?.removeAllListeners();
      client?.leave().catch(() => {});
      // Hung up while connecting: leave() already cleaned up, nothing to report.
      if (channelRef.current !== channelName || error.message === 'cancelled') return;
      clientRef.current = null;
      channelRef.current = null;
      closeLocalTracks();
      resetState();
      throw new Error(error.message?.startsWith('Allow') || error.message?.includes('unavailable')
        ? error.message
        : permissionMessage(error, type));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [prepare, callbacks]);

  // Reconnect this call through Agora's TCP/443 relay, keeping the same camera/mic.
  const switchToRelay = useCallback(async () => {
    const old = clientRef.current;
    const channelName = channelRef.current;
    if (!old || !channelName || relayRef.current || !relayAllowed()) return false;
    relayRef.current = true;
    setRelayed(true);
    rememberRelay();
    clearTimeout(mediaCheckRef.current);
    clearInterval(stallTimerRef.current);
    old.removeAllListeners();
    clientRef.current = null;
    remoteAudioRef.current = null;
    setRemoteVideoTrack(null);
    setRemoteVideoStalled(false);
    setReconnecting(true);
    await old.leave().catch(() => {});
    if (channelRef.current !== channelName) return false; // hung up meanwhile
    try {
      await connect(channelName);
      setReconnecting(false);
      return true;
    } catch (error) {
      console.warn('Call: relay reconnect failed', error?.code || error?.message);
      setReconnecting(false);
      return false;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const leave = useCallback(async () => {
    generationRef.current += 1;
    channelRef.current = null;
    relayRef.current = false;
    const client = clientRef.current;
    clientRef.current = null;
    closeLocalTracks();
    remoteAudioRef.current = null;
    resetState();
    if (client) {
      client.removeAllListeners();
      await client.leave().catch(() => {});
    }
  }, []);

  const toggleMic = useCallback(async () => {
    const track = audioTrackRef.current;
    if (!track) return;
    const next = !track.muted;
    await track.setMuted(next);
    setMicMuted(next);
  }, []);

  const toggleCamera = useCallback(async () => {
    const track = videoTrackRef.current;
    if (!track) return;
    const turnOff = track.enabled;
    await track.setEnabled(!turnOff); // disabling turns the camera light off too
    setCameraOff(turnOff);
  }, []);

  const toggleSpeaker = useCallback(() => {
    const next = !speakerOffRef.current;
    speakerOffRef.current = next;
    remoteAudioRef.current?.setVolume(next ? 0 : 100);
    setSpeakerOff(next);
  }, []);

  // Front/back camera on phones; cycles through webcams on desktop.
  const switchCamera = useCallback(async () => {
    const track = videoTrackRef.current;
    if (!track) return;
    const next = facingMode === 'user' ? 'environment' : 'user';
    try {
      await track.setDevice({ facingMode: next });
      setFacingMode(next);
      return;
    } catch {
      // facingMode unsupported — fall back to device ids
    }
    try {
      const AgoraRTC = await loadAgora();
      const cameras = await AgoraRTC.getCameras();
      if (cameras.length < 2) return;
      const currentLabel = track.getTrackLabel();
      const index = cameras.findIndex(c => c.label === currentLabel);
      await track.setDevice(cameras[(index + 1) % cameras.length].deviceId);
      setFacingMode(next);
    } catch {
      // keep the current camera
    }
  }, [facingMode]);

  useEffect(() => () => { leave(); }, [leave]);

  return {
    prepare,
    join,
    leave,
    switchToRelay,
    relayed,
    remoteVideoStalled,
    toggleMic,
    toggleCamera,
    toggleSpeaker,
    switchCamera,
    localVideoTrack,
    remoteVideoTrack,
    micMuted,
    cameraOff,
    speakerOff,
    remoteMicMuted,
    remoteCameraOff,
    networkQuality,
    reconnecting,
    facingMode
  };
}
