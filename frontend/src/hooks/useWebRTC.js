import { useRef, useState, useCallback } from 'react';

const ICE_SERVERS = {
  iceServers: [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
    { urls: 'stun:stun2.l.google.com:19302' },
    // ✅ Free TURN from Metered (sign up at metered.ca for free 50GB/month)
    // { urls: 'turn:relay.metered.ca:80', username: 'YOUR_USERNAME', credential: 'YOUR_CRED' },
  ]
};

export default function useWebRTC({ socket, user }) {
  const [localStream, setLocalStream]   = useState(null);
  const [remoteStream, setRemoteStream] = useState(null);
  const [callDuration, setCallDuration] = useState(0);

  const peerRef        = useRef(null);
  const localStreamRef = useRef(null);
  const timerRef       = useRef(null);
  const ringtoneRef    = useRef(null);

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

  // ── Start call duration timer ────────────────────────────────────
  const startTimer = useCallback(() => {
    setCallDuration(0);
    timerRef.current = setInterval(() => {
      setCallDuration(prev => prev + 1);
    }, 1000);
  }, []);

  const stopTimer = useCallback(() => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
    setCallDuration(0);
  }, []);

  // ── Format duration ──────────────────────────────────────────────
  const formatDuration = useCallback((secs) => {
    const m = Math.floor(secs / 60).toString().padStart(2, '0');
    const s = (secs % 60).toString().padStart(2, '0');
    return `${m}:${s}`;
  }, []);

  // ── Get microphone ───────────────────────────────────────────────
  const getLocalStream = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
      localStreamRef.current = stream;
      setLocalStream(stream);
      return stream;
    } catch (err) {
      console.error('Mic access denied:', err);
      throw new Error('Microphone access denied. Please allow microphone access.');
    }
  }, []);

  // ── Create peer connection ───────────────────────────────────────
  const createPeer = useCallback((stream) => {
    const peer = new RTCPeerConnection(ICE_SERVERS);

    // Add local tracks
    stream.getTracks().forEach(track => peer.addTrack(track, stream));

    // Remote stream
    const remote = new MediaStream();
    setRemoteStream(remote);

    peer.ontrack = (e) => {
      e.streams[0].getTracks().forEach(track => remote.addTrack(track));
    };

    // ICE candidates
    peer.onicecandidate = (e) => {
      if (e.candidate) {
        socket.emit('sendIceCandidate', {
          receiverId: peerRef._targetUserId,
          candidate: e.candidate
        });
      }
    };

    peer.onconnectionstatechange = () => {
      console.log('Connection state:', peer.connectionState);
    };

    peerRef.current = peer;
    return peer;
  }, [socket]);

  // ── Initiate call (caller side) ──────────────────────────────────
  const initiateCall = useCallback(async (targetUserId) => {
    peerRef._targetUserId = targetUserId;
    const stream = await getLocalStream();
    const peer   = createPeer(stream);

    const offer = await peer.createOffer();
    await peer.setLocalDescription(offer);

    socket.emit('sendOffer', { receiverId: targetUserId, offer });
    startRingtone();
    return stream;
  }, [getLocalStream, createPeer, socket, startRingtone]);

  // ── Answer call (receiver side) ──────────────────────────────────
  const answerCall = useCallback(async (callerId, offer) => {
    peerRef._targetUserId = callerId;
    stopRingtone();
    const stream = await getLocalStream();
    const peer   = createPeer(stream);

    await peer.setRemoteDescription(new RTCSessionDescription(offer));
    const answer = await peer.createAnswer();
    await peer.setLocalDescription(answer);

    socket.emit('sendAnswer', { callerId, answer });
    startTimer();
    return stream;
  }, [getLocalStream, createPeer, socket, stopRingtone, startTimer]);

  // ── Handle incoming answer (caller side) ────────────────────────
  const handleAnswer = useCallback(async (answer) => {
    if (peerRef.current) {
      await peerRef.current.setRemoteDescription(new RTCSessionDescription(answer));
      stopRingtone();
      startTimer();
    }
  }, [stopRingtone, startTimer]);

  // ── Handle ICE candidate ─────────────────────────────────────────
  const handleIceCandidate = useCallback(async (candidate) => {
    if (peerRef.current && candidate) {
      try {
        await peerRef.current.addIceCandidate(new RTCIceCandidate(candidate));
      } catch (e) {
        console.error('ICE candidate error:', e);
      }
    }
  }, []);

  // ── Toggle mute ──────────────────────────────────────────────────
  const toggleMute = useCallback(() => {
    if (localStreamRef.current) {
      const track = localStreamRef.current.getAudioTracks()[0];
      if (track) {
        track.enabled = !track.enabled;
        return !track.enabled; // returns isMuted
      }
    }
    return false;
  }, []);

  // ── End call / cleanup ───────────────────────────────────────────
  const endCall = useCallback(() => {
    stopRingtone();
    stopTimer();

    if (peerRef.current) {
      peerRef.current.close();
      peerRef.current = null;
    }
    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach(t => t.stop());
      localStreamRef.current = null;
    }
    setLocalStream(null);
    setRemoteStream(null);
  }, [stopRingtone, stopTimer]);

  return {
    localStream,
    remoteStream,
    callDuration,
    formatDuration,
    initiateCall,
    answerCall,
    handleAnswer,
    handleIceCandidate,
    toggleMute,
    endCall,
    startRingtone,
    stopRingtone,
  };
}