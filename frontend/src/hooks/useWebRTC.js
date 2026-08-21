import { useRef, useState, useCallback } from 'react';
import AgoraRTC from 'agora-rtc-sdk-ng';
import axios from 'axios';

export default function useWebRTC({ user }) {
  const [remoteStream, setRemoteStream] = useState(null);
  const [callDuration, setCallDuration] = useState(0);
  const clientRef = useRef(null);
  const localTracksRef = useRef([]);
  const timerRef = useRef(null);
  const ringtoneRef = useRef(null);

  // ── Start ringtone ───────────────────────────────────────────────
  const startRingtone = useCallback(() => {
    try {
      const ctx  = new AudioContext();
      const gain = ctx.createGain();
      gain.gain.value = 0.3;
      gain.connect(ctx.destination);

      const playBeep = () => {
        const osc = ctx.createOscillator();
        osc.connect(gain);
        osc.frequency.value = 440;
        osc.type = 'sine';
        osc.start();
        osc.stop(ctx.currentTime + 0.4);
      };

      playBeep();
      const interval = setInterval(playBeep, 1500);
      ringtoneRef.current = { ctx, interval };
    } catch (e) {
      console.log('Ringtone not supported:', e);
    }
  }, []);

  const stopRingtone = useCallback(() => {
    if (ringtoneRef.current) {
      clearInterval(ringtoneRef.current.interval);
      try { ringtoneRef.current.ctx.close(); } catch (e) {}
      ringtoneRef.current = null;
    }
  }, []);

  const startTimer = useCallback(() => {
    if (timerRef.current) return;
    setCallDuration(0);
    timerRef.current = setInterval(() => setCallDuration(value => value + 1), 1000);
  }, []);

  const stopTimer = useCallback(() => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
    setCallDuration(0);
  }, []);

  const formatDuration = useCallback((secs) => {
    const m = Math.floor(secs / 60).toString().padStart(2, '0');
    const s = (secs % 60).toString().padStart(2, '0');
    return `${m}:${s}`;
  }, []);

  const joinCall = useCallback(async (channelName, callType) => {
    if (clientRef.current) return;
    const { data } = await axios.get(`/api/calls/token?channel=${encodeURIComponent(channelName)}`, {
      headers: { Authorization: `Bearer ${user.token}` }
    });
    const client = AgoraRTC.createClient({ mode: 'rtc', codec: 'vp8' });
    clientRef.current = client;
    client.on('user-published', async (remoteUser, mediaType) => {
      await client.subscribe(remoteUser, mediaType);
      if (mediaType === 'audio' && remoteUser.audioTrack) {
        remoteUser.audioTrack.play();
      }
      if (mediaType === 'video') setRemoteStream(remoteUser.videoTrack);
    });
    client.on('user-unpublished', (remoteUser, mediaType) => {
      if (mediaType === 'video') setRemoteStream(null);
    });
    await client.join(data.appId, channelName, data.token, null);
    const tracks = await AgoraRTC.createMicrophoneAndCameraTracks({}, { encoderConfig: '480p_1' });
    localTracksRef.current = callType === 'video' ? tracks : [tracks[0]];
    if (callType !== 'video') tracks[1].close();
    await client.publish(localTracksRef.current);
    startTimer();
  }, [startTimer, user?.token]);

  // ── Toggle mute ──────────────────────────────────────────────────
  const toggleMute = useCallback(() => {
    const microphone = localTracksRef.current.find(track => track.trackMediaType === 'audio');
    if (!microphone) return false;
    microphone.setEnabled(!microphone.enabled);
    return !microphone.enabled;
  }, []);

  // ── End call / cleanup ───────────────────────────────────────────
  const endCall = useCallback(async () => {
    stopRingtone();
    stopTimer();

    localTracksRef.current.forEach(track => track.close());
    localTracksRef.current = [];
    if (clientRef.current) {
      await clientRef.current.leave();
      clientRef.current.removeAllListeners();
      clientRef.current = null;
    }
    setRemoteStream(null);
  }, [stopRingtone, stopTimer]);

  return {
    remoteStream,
    callDuration,
    formatDuration,
    joinCall,
    toggleMute,
    endCall,
    startRingtone,
    stopRingtone,
  };
}