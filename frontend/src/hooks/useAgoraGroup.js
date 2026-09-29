import { useCallback, useEffect, useRef, useState } from 'react';
import axios from 'axios';
import { HD_AUDIO, loadAgora, permissionMessage } from './useAgoraCall';

// Group calls send 640×360 @ 24fps per person (not HD): with up to 8 people every
// device decodes up to 7 streams, which mid-range phones handle at this size.
const GROUP_VIDEO = {
  encoderConfig: { width: 640, height: 360, frameRate: 24, bitrateMin: 250, bitrateMax: 900 },
  optimizationMode: 'balanced'
};

const fetchToken = async (channelName) => (await axios.get('/api/calls/token', { params: { channel: channelName } })).data;

// Multi-party Agora engine. Remote participants are keyed by their user id
// (the server issues account-bound tokens, so uid === user id).
export default function useAgoraGroup() {
  const clientRef = useRef(null);
  const audioRef = useRef(null);
  const videoRef = useRef(null);
  const remoteAudio = useRef(new Map());
  const speakerOffRef = useRef(false);
  const generationRef = useRef(0);

  const [localVideoTrack, setLocalVideoTrack] = useState(null);
  const [remotes, setRemotes] = useState({}); // uid -> { uid, videoTrack, micMuted, cameraOff }
  const [micMuted, setMicMuted] = useState(false);
  const [cameraOff, setCameraOff] = useState(false);
  const [speakerOff, setSpeakerOff] = useState(false);
  const [activeSpeaker, setActiveSpeaker] = useState(null);
  const [facingMode, setFacingMode] = useState('user');
  const [reconnecting, setReconnecting] = useState(false);

  const patchRemote = (uid, patch) => setRemotes(prev => ({
    ...prev,
    [uid]: { uid, videoTrack: null, micMuted: false, cameraOff: true, ...prev[uid], ...patch }
  }));

  const closeLocal = () => {
    [audioRef.current, videoRef.current].forEach(t => { try { t?.stop(); t?.close(); } catch { /* closed */ } });
    audioRef.current = null;
    videoRef.current = null;
  };

  const reset = () => {
    setLocalVideoTrack(null);
    setRemotes({});
    setMicMuted(false);
    setCameraOff(false);
    setSpeakerOff(false);
    setActiveSpeaker(null);
    setFacingMode('user');
    setReconnecting(false);
    speakerOffRef.current = false;
    remoteAudio.current.clear();
  };

  const join = useCallback(async ({ channelName, type }) => {
    if (clientRef.current) return;
    const generation = ++generationRef.current;
    const AgoraRTC = await loadAgora();
    const stale = () => generation !== generationRef.current;

    // Local tracks first (permission prompt), then the channel.
    try {
      if (type === 'video') {
        try {
          const [audio, video] = await AgoraRTC.createMicrophoneAndCameraTracks(HD_AUDIO, { ...GROUP_VIDEO, facingMode: 'user' });
          if (stale()) { audio.close(); video.close(); return; }
          audioRef.current = audio;
          videoRef.current = video;
          setLocalVideoTrack(video);
        } catch (error) {
          if (/PERMISSION_DENIED|NotAllowedError/i.test(error?.code || error?.name || '')) throw error;
          setCameraOff(true); // no camera — join with voice only
        }
      }
      if (!audioRef.current) {
        const audio = await AgoraRTC.createMicrophoneAudioTrack(HD_AUDIO);
        if (stale()) { audio.close(); return; }
        audioRef.current = audio;
      }
    } catch (error) {
      closeLocal();
      throw new Error(permissionMessage(error, type));
    }

    const client = AgoraRTC.createClient({ mode: 'rtc', codec: 'vp8' });
    clientRef.current = client;
    client.on('user-joined', (u) => patchRemote(String(u.uid), {}));
    client.on('user-left', (u) => {
      remoteAudio.current.delete(String(u.uid));
      setRemotes(prev => { const next = { ...prev }; delete next[String(u.uid)]; return next; });
    });
    client.on('user-published', async (u, mediaType) => {
      try { await client.subscribe(u, mediaType); } catch { return; }
      const uid = String(u.uid);
      if (mediaType === 'audio' && u.audioTrack) {
        remoteAudio.current.set(uid, u.audioTrack);
        u.audioTrack.setVolume(speakerOffRef.current ? 0 : 100);
        u.audioTrack.play();
        patchRemote(uid, { micMuted: false });
      }
      if (mediaType === 'video' && u.videoTrack) patchRemote(uid, { videoTrack: u.videoTrack, cameraOff: false });
    });
    client.on('user-unpublished', (u, mediaType) => {
      const uid = String(u.uid);
      if (mediaType === 'video') patchRemote(uid, { videoTrack: null, cameraOff: true });
      if (mediaType === 'audio') patchRemote(uid, { micMuted: true });
    });
    client.on('user-info-updated', (uid, message) => {
      if (message === 'mute-audio') patchRemote(String(uid), { micMuted: true });
      if (message === 'unmute-audio') patchRemote(String(uid), { micMuted: false });
    });
    // Active speaker: loudest participant above a small threshold.
    client.enableAudioVolumeIndicator();
    client.on('volume-indicator', (volumes) => {
      const loudest = volumes.reduce((best, v) => (v.level > (best?.level || 0) ? v : best), null);
      setActiveSpeaker(loudest && loudest.level > 5 ? String(loudest.uid) : null);
    });
    client.on('connection-state-change', (state) => setReconnecting(state === 'RECONNECTING'));
    client.on('token-privilege-will-expire', async () => {
      try {
        const { token } = await fetchToken(channelName);
        await client.renewToken(token);
      } catch {
        // No longer allowed (e.g. removed from the group) — the SDK disconnects at expiry.
      }
    });

    try {
      const { appId, token, uid } = await fetchToken(channelName);
      if (clientRef.current !== client) return;
      await client.join(appId, channelName, token, uid);
      if (clientRef.current !== client) { await client.leave(); return; }
      const tracks = [audioRef.current, videoRef.current].filter(Boolean);
      if (tracks.length) await client.publish(tracks);
    } catch (error) {
      client.removeAllListeners();
      client.leave().catch(() => {});
      if (clientRef.current !== client) return;
      clientRef.current = null;
      closeLocal();
      reset();
      throw new Error(error.response?.data?.message || permissionMessage(error, type));
    }
  }, []);

  const leave = useCallback(async () => {
    generationRef.current += 1;
    const client = clientRef.current;
    clientRef.current = null;
    closeLocal();
    reset();
    if (client) {
      client.removeAllListeners();
      await client.leave().catch(() => {});
    }
  }, []);

  const toggleMic = useCallback(async () => {
    const track = audioRef.current;
    if (!track) return;
    const next = !track.muted;
    await track.setMuted(next);
    setMicMuted(next);
  }, []);

  const toggleCamera = useCallback(async () => {
    const track = videoRef.current;
    if (!track) return;
    const turnOff = track.enabled;
    await track.setEnabled(!turnOff);
    setCameraOff(turnOff);
  }, []);

  const toggleSpeaker = useCallback(() => {
    const next = !speakerOffRef.current;
    speakerOffRef.current = next;
    remoteAudio.current.forEach(track => track.setVolume(next ? 0 : 100));
    setSpeakerOff(next);
  }, []);

  const switchCamera = useCallback(async () => {
    const track = videoRef.current;
    if (!track) return;
    const next = facingMode === 'user' ? 'environment' : 'user';
    try {
      await track.setDevice({ facingMode: next });
      setFacingMode(next);
    } catch {
      // single camera — nothing to switch to
    }
  }, [facingMode]);

  useEffect(() => () => { leave(); }, [leave]);

  return {
    join, leave, toggleMic, toggleCamera, toggleSpeaker, switchCamera,
    localVideoTrack, remotes, micMuted, cameraOff, speakerOff, activeSpeaker, facingMode, reconnecting
  };
}
