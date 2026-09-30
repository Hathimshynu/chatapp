import { useCallback, useEffect, useRef, useState } from 'react';
import axios from 'axios';
import { HD_AUDIO, loadAgora, permissionMessage } from './useAgoraCall';
import useLatest from './useLatest';
import { MEDIA_CHECK_MS, RELAY_PROXY_MODE, relayAllowed, rememberRelay, startWithRelay } from '../lib/callTransport';

// Group calls send 640×360 @ 24fps per person (not HD): with up to 8 people every
// device decodes up to 7 streams, which mid-range phones handle at this size.
const GROUP_VIDEO = {
  encoderConfig: { width: 640, height: 360, frameRate: 24, bitrateMin: 250, bitrateMax: 900 },
  optimizationMode: 'balanced'
};

const fetchToken = async (channelName) => (await axios.get('/api/calls/token', { params: { channel: channelName } })).data;

// Multi-party Agora engine. Remote participants are keyed by their user id
// (the server issues account-bound tokens, so uid === user id).
export default function useAgoraGroup({ onMediaMissing } = {}) {
  const clientRef = useRef(null);
  const audioRef = useRef(null);
  const videoRef = useRef(null);
  const remoteAudio = useRef(new Map());
  const speakerOffRef = useRef(false);
  const generationRef = useRef(0);
  const channelRef = useRef(null);
  const typeRef = useRef('audio');
  const relayRef = useRef(false); // this call goes through Agora's TCP relay
  const mediaChecks = useRef(new Map()); // uid -> timer
  const callbacks = useLatest({ onMediaMissing });

  const [localVideoTrack, setLocalVideoTrack] = useState(null);
  const [remotes, setRemotes] = useState({}); // uid -> { uid, videoTrack, micMuted, cameraOff }
  const [micMuted, setMicMuted] = useState(false);
  const [cameraOff, setCameraOff] = useState(false);
  const [speakerOff, setSpeakerOff] = useState(false);
  const [activeSpeaker, setActiveSpeaker] = useState(null);
  const [facingMode, setFacingMode] = useState('user');
  const [reconnecting, setReconnecting] = useState(false);
  const [relayed, setRelayed] = useState(false);

  const patchRemote = (uid, patch) => setRemotes(prev => ({
    ...prev,
    [uid]: { uid, videoTrack: null, micMuted: false, cameraOff: true, ...prev[uid], ...patch }
  }));

  const clearMediaChecks = () => {
    mediaChecks.current.forEach(clearTimeout);
    mediaChecks.current.clear();
  };

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
    setRelayed(false);
    clearMediaChecks();
    speakerOffRef.current = false;
    remoteAudio.current.clear();
  };

  // After someone joins, check their media actually reaches us; if not, the
  // network is dropping it → ask everyone to move to the relay.
  const checkMedia = (client, uid) => {
    clearTimeout(mediaChecks.current.get(uid));
    if (relayRef.current || !relayAllowed()) return;
    mediaChecks.current.set(uid, setTimeout(() => {
      mediaChecks.current.delete(uid);
      if (clientRef.current !== client || relayRef.current) return;
      const remote = client.remoteUsers.find(u => String(u.uid) === uid);
      if (!remote) return;
      // Same rule as 1:1 calls. Someone with their camera off also trips it in a video
      // call; the only cost is one extra reconnect through the relay, which still works.
      const audioOk = remote.hasAudio && (client.getRemoteAudioStats?.()[remote.uid]?.receiveBytes || 0) > 0;
      const videoOk = typeRef.current !== 'video'
        || (remote.hasVideo && (client.getRemoteVideoStats?.()[remote.uid]?.receiveBytes || 0) > 0);
      if (!audioOk || !videoOk) callbacks.current.onMediaMissing?.();
    }, MEDIA_CHECK_MS));
  };

  const attach = (client, channelName) => {
    client.on('user-joined', (u) => {
      patchRemote(String(u.uid), {});
      checkMedia(client, String(u.uid));
    });
    client.on('user-left', (u) => {
      const uid = String(u.uid);
      clearTimeout(mediaChecks.current.get(uid));
      remoteAudio.current.delete(uid);
      setRemotes(prev => { const next = { ...prev }; delete next[uid]; return next; });
    });
    client.on('user-published', async (u, mediaType) => {
      try { await client.subscribe(u, mediaType); } catch (error) {
        console.warn(`Group call: could not receive ${mediaType}`, error?.code || error?.message);
        return;
      }
      if (clientRef.current !== client) return;
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
  };

  // Create a client (direct or via the relay), join with my account uid and publish.
  const connect = async (channelName) => {
    const AgoraRTC = await loadAgora();
    const client = AgoraRTC.createClient({ mode: 'rtc', codec: 'vp8' });
    clientRef.current = client;
    if (relayRef.current) client.startProxyServer(RELAY_PROXY_MODE);
    attach(client, channelName);
    const { appId, token, uid } = await fetchToken(channelName);
    if (clientRef.current !== client) return;
    await client.join(appId, channelName, token, uid);
    if (clientRef.current !== client) { await client.leave(); return; }
    const tracks = [audioRef.current, videoRef.current].filter(Boolean);
    if (tracks.length) await client.publish(tracks);
    client.remoteUsers.forEach(u => { patchRemote(String(u.uid), {}); checkMedia(client, String(u.uid)); });
  };

  const join = useCallback(async ({ channelName, type }) => {
    if (clientRef.current) return;
    const generation = ++generationRef.current;
    const AgoraRTC = await loadAgora();
    const stale = () => generation !== generationRef.current;
    channelRef.current = channelName;
    typeRef.current = type;
    relayRef.current = startWithRelay();
    setRelayed(relayRef.current);

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

    try {
      await connect(channelName);
    } catch (error) {
      const client = clientRef.current;
      client?.removeAllListeners();
      client?.leave().catch(() => {});
      if (stale()) return;
      clientRef.current = null;
      channelRef.current = null;
      closeLocal();
      reset();
      throw new Error(error.response?.data?.message || permissionMessage(error, type));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Reconnect through Agora's TCP/443 relay, keeping the same camera/mic.
  const switchToRelay = useCallback(async () => {
    const old = clientRef.current;
    const channelName = channelRef.current;
    if (!old || !channelName || relayRef.current || !relayAllowed()) return false;
    const generation = generationRef.current;
    relayRef.current = true;
    setRelayed(true);
    rememberRelay();
    clearMediaChecks();
    old.removeAllListeners();
    clientRef.current = null;
    remoteAudio.current.clear();
    setRemotes({});
    setReconnecting(true);
    await old.leave().catch(() => {});
    if (generation !== generationRef.current) return false; // left meanwhile
    try {
      await connect(channelName);
      return true;
    } catch (error) {
      console.warn('Group call: relay reconnect failed', error?.code || error?.message);
      return false;
    } finally {
      setReconnecting(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const leave = useCallback(async () => {
    generationRef.current += 1;
    channelRef.current = null;
    relayRef.current = false;
    const client = clientRef.current;
    clientRef.current = null;
    closeLocal();
    reset();
    if (client) {
      client.removeAllListeners();
      await client.leave().catch(() => {});
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
    join, leave, switchToRelay, toggleMic, toggleCamera, toggleSpeaker, switchCamera,
    localVideoTrack, remotes, micMuted, cameraOff, speakerOff, activeSpeaker, facingMode, reconnecting, relayed
  };
}
