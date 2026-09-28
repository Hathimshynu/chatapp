import { useCallback, useEffect, useRef, useState } from 'react';
import axios from 'axios';
import useLatest from './useLatest';

// HD: 1280×720 @ 30fps. Agora adapts the bitrate between these bounds to the
// network, and "detail" keeps the picture sharp rather than dropping resolution.
const HD_VIDEO = {
  encoderConfig: { width: 1280, height: 720, frameRate: 30, bitrateMin: 600, bitrateMax: 2260 },
  optimizationMode: 'detail'
};

// Wideband voice with echo cancellation, noise suppression and auto gain.
const HD_AUDIO = {
  AEC: true,
  ANS: true,
  AGC: true,
  encoderConfig: { sampleRate: 48000, stereo: false, bitrate: 64 }
};

let agoraPromise = null;
// The SDK is large; load it only when a call actually starts.
const loadAgora = () => {
  if (!agoraPromise) {
    agoraPromise = import('agora-rtc-sdk-ng').then(({ default: AgoraRTC }) => {
      AgoraRTC.setLogLevel(3);
      return AgoraRTC;
    });
  }
  return agoraPromise;
};

const permissionMessage = (error, type) => {
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

const fetchToken = async (channelName) => {
  const { data } = await axios.get('/api/calls/token', { params: { channel: channelName } });
  return data;
};

export default function useAgoraCall({ onRemoteJoined, onRemoteLeft } = {}) {
  const clientRef = useRef(null);
  const audioTrackRef = useRef(null);
  const videoTrackRef = useRef(null);
  const remoteAudioRef = useRef(null);
  const speakerOffRef = useRef(false);
  const generationRef = useRef(0); // bumped by leave() so late async work can bail out
  const callbacks = useLatest({ onRemoteJoined, onRemoteLeft });

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

  const join = useCallback(async ({ channelName, type }) => {
    if (clientRef.current) return;
    const AgoraRTC = await loadAgora();
    const client = AgoraRTC.createClient({ mode: 'rtc', codec: 'vp8' });
    clientRef.current = client;

    client.on('user-joined', () => callbacks.current.onRemoteJoined?.());
    client.on('user-left', (_, reason) => callbacks.current.onRemoteLeft?.(reason));
    client.on('user-published', async (remoteUser, mediaType) => {
      try {
        await client.subscribe(remoteUser, mediaType);
      } catch {
        return;
      }
      if (mediaType === 'audio' && remoteUser.audioTrack) {
        remoteAudioRef.current = remoteUser.audioTrack;
        remoteUser.audioTrack.setVolume(speakerOffRef.current ? 0 : 100);
        remoteUser.audioTrack.play();
        setRemoteMicMuted(false);
      }
      if (mediaType === 'video' && remoteUser.videoTrack) {
        setRemoteVideoTrack(remoteUser.videoTrack);
        setRemoteCameraOff(false);
      }
    });
    client.on('user-unpublished', (_, mediaType) => {
      if (mediaType === 'video') {
        setRemoteVideoTrack(null);
        setRemoteCameraOff(true);
      }
    });
    client.on('user-info-updated', (_, message) => {
      if (message === 'mute-audio') setRemoteMicMuted(true);
      if (message === 'unmute-audio') setRemoteMicMuted(false);
      if (message === 'mute-video' || message === 'disable-local-video') setRemoteCameraOff(true);
      if (message === 'unmute-video' || message === 'enable-local-video') setRemoteCameraOff(false);
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

    try {
      const [{ appId, token }] = await Promise.all([
        fetchToken(channelName),
        audioTrackRef.current ? Promise.resolve() : prepare(type)
      ]);
      if (clientRef.current !== client) return; // hung up meanwhile
      await client.join(appId, channelName, token, null);
      if (clientRef.current !== client) {
        await client.leave();
        return;
      }
      const tracks = [audioTrackRef.current, videoTrackRef.current].filter(Boolean);
      if (tracks.length) await client.publish(tracks);
    } catch (error) {
      client.removeAllListeners();
      client.leave().catch(() => {});
      // Hung up while connecting: leave() already cleaned up, nothing to report.
      if (clientRef.current !== client || error.message === 'cancelled') return;
      clientRef.current = null;
      closeLocalTracks();
      resetState();
      throw new Error(error.message?.startsWith('Allow') || error.message?.includes('unavailable')
        ? error.message
        : permissionMessage(error, type));
    }
  }, [prepare, callbacks]);

  const leave = useCallback(async () => {
    generationRef.current += 1;
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
