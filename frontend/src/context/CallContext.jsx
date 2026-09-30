import { createContext, useCallback, useContext, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import toast from 'react-hot-toast';
import { useAuth } from './AuthContext';
import { useSocket, useSocketEvent } from './SocketContext';
import useAgoraCall from '../hooks/useAgoraCall';
import CallScreen from '../components/call/CallScreen';
import IncomingCallBanner from '../components/call/IncomingCallBanner';
import MinimizedCall from '../components/call/MinimizedCall';
import { playEndTone, startRingtone } from '../lib/sounds';
import { showNotification } from '../lib/notify';
import { callsUnavailableReason } from '../lib/media';

const CallContext = createContext(null);

const ENDED_SCREEN_MS = 1800;
// If the other person drops out of the media channel (network blip, or reconnecting
// through the relay), wait this long for them to come back before ending the call.
// Hanging up is instant: it goes through the server ("call:end").
const REMOTE_GONE_GRACE_MS = 10000;

const describeEnd = ({ status, endedBy }, myId, direction) => {
  if (status === 'completed') return 'Call ended';
  if (status === 'declined') return direction === 'outgoing' ? 'Call declined' : 'Call ended';
  if (status === 'busy') return 'Busy on another call';
  if (!endedBy) return direction === 'outgoing' ? 'No answer' : 'Missed call';
  return String(endedBy) === String(myId) ? 'Call cancelled' : 'Call ended';
};

const isDesktop = () => window.matchMedia('(min-width: 768px) and (pointer: fine)').matches;

// call.status: 'outgoing' (ringing them) | 'incoming' (ringing me) | 'connecting' | 'active' | 'ended'
export const CallProvider = ({ children }) => {
  const { user } = useAuth();
  const { socket } = useSocket();
  const [call, setCall] = useState(null);
  const [minimized, setMinimized] = useState(false);
  const callRef = useRef(null);
  const stopRingRef = useRef(null);
  const wakeLockRef = useRef(null);
  const clearTimerRef = useRef(null);

  const updateCall = useCallback((patch) => {
    const next = patch === null ? null : { ...callRef.current, ...patch };
    callRef.current = next;
    setCall(next);
    if (!next) setMinimized(false);
  }, []);

  const stopRing = useCallback(() => {
    stopRingRef.current?.();
    stopRingRef.current = null;
  }, []);

  const ring = useCallback((kind) => {
    stopRing();
    stopRingRef.current = startRingtone(kind);
  }, [stopRing]);

  const releaseWakeLock = () => {
    wakeLockRef.current?.release?.().catch?.(() => {});
    wakeLockRef.current = null;
  };

  const markActive = useCallback(() => {
    const current = callRef.current;
    if (!current || current.status === 'active' || current.status === 'ended') return;
    stopRing();
    updateCall({ status: 'active', startedAt: Date.now() });
    // Keep the phone screen awake during the call.
    navigator.wakeLock?.request('screen').then(lock => { wakeLockRef.current = lock; }).catch(() => {});
  }, [stopRing, updateCall]);

  const onRemoteLeftRef = useRef(() => {});
  const onMediaMissingRef = useRef(() => {});
  const remoteGoneTimer = useRef(null);
  const agora = useAgoraCall({
    onRemoteJoined: () => {
      clearTimeout(remoteGoneTimer.current);
      markActive();
    },
    onRemoteLeft: (reason) => onRemoteLeftRef.current(reason),
    onMediaMissing: () => onMediaMissingRef.current()
  });
  const { leave, switchToRelay } = agora;

  const finish = useCallback((reason, { notifyServer = false, showEndedScreen = true } = {}) => {
    const current = callRef.current;
    if (!current || current.status === 'ended') return;
    clearTimeout(remoteGoneTimer.current);
    stopRing();
    releaseWakeLock();
    if (notifyServer && current.callId) socket?.emit('call:end', { callId: current.callId });
    leave();
    const wasConnected = current.status === 'active' || current.status === 'connecting';
    if (wasConnected || current.status === 'outgoing') playEndTone();

    if (!showEndedScreen || current.status === 'incoming') {
      updateCall(null);
      return;
    }
    updateCall({
      status: 'ended',
      endReason: reason,
      duration: current.startedAt ? Math.round((Date.now() - current.startedAt) / 1000) : 0
    });
    setMinimized(false);
    clearTimeout(clearTimerRef.current);
    clearTimerRef.current = setTimeout(() => {
      if (callRef.current?.status === 'ended') updateCall(null);
    }, ENDED_SCREEN_MS);
  }, [socket, leave, stopRing, updateCall]);

  useLayoutEffect(() => {
    onRemoteLeftRef.current = () => {
      const current = callRef.current;
      if (!current || (current.status !== 'active' && current.status !== 'connecting')) return;
      clearTimeout(remoteGoneTimer.current);
      remoteGoneTimer.current = setTimeout(() => {
        const now = callRef.current;
        if (now?.callId === current.callId && (now.status === 'active' || now.status === 'connecting')) {
          finish('Call ended', { notifyServer: true });
        }
      }, REMOTE_GONE_GRACE_MS);
    };
    // Their media isn't reaching us: move both sides to Agora's TCP relay.
    onMediaMissingRef.current = () => {
      const current = callRef.current;
      if (!current?.callId || current.status === 'ended') return;
      socket?.emit('call:relay', { callId: current.callId });
      switchToRelay();
    };
  }, [finish, socket, switchToRelay]);

  // ── Outgoing ─────────────────────────────────────────────────────
  const startCall = useCallback((peer, type = 'audio') => {
    const callType = type === 'video' ? 'video' : 'audio';
    const current = callRef.current;
    if (current && current.status !== 'ended') {
      toast('You are already on a call');
      return;
    }
    if (!socket?.connected) {
      toast.error('You are offline. Check your connection.');
      return;
    }
    const unavailable = callsUnavailableReason();
    if (unavailable) {
      toast.error(unavailable, { duration: 6000 });
      return;
    }
    clearTimeout(clearTimerRef.current);
    updateCall({ status: 'outgoing', direction: 'outgoing', type: callType, peer, callId: null, startedAt: null });

    // Start the camera/mic right away so the preview shows while ringing.
    const prepared = agora.prepare(callType).then(() => null, error => error);

    socket.emit('call:start', { receiverId: peer._id, type: callType }, async (response = {}) => {
      if (callRef.current?.status !== 'outgoing' || callRef.current.callId) {
        // Hung up before the server answered — make sure the other side stops ringing.
        if (response.callId) socket.emit('call:end', { callId: response.callId });
        return;
      }
      if (response.error) {
        leave();
        updateCall({ status: 'ended', endReason: response.error, duration: 0 });
        clearTimerRef.current = setTimeout(() => updateCall(null), 2600);
        return;
      }
      updateCall({ callId: response.callId, channelName: response.channelName, peer: { ...peer, ...response.peer, avatar: peer.avatar || response.peer?.avatar } });
      ring('outgoing');

      const prepareError = await prepared;
      if (callRef.current?.callId !== response.callId) return; // hung up while the camera started
      try {
        if (prepareError) throw prepareError;
        await agora.join({ channelName: response.channelName, type: callType });
      } catch (error) {
        if (error.message === 'cancelled') return;
        toast.error(error.message);
        finish('Call failed', { notifyServer: true });
      }
    });
  }, [socket, agora, leave, ring, finish, updateCall]);

  // ── Incoming ─────────────────────────────────────────────────────
  const acceptCall = useCallback(() => {
    const current = callRef.current;
    if (!current || current.status !== 'incoming') return;
    const unavailable = callsUnavailableReason();
    if (unavailable) {
      toast.error(unavailable, { duration: 6000 });
      return; // keep ringing so it can still be answered on another device
    }
    stopRing();
    updateCall({ status: 'connecting' });
    socket.emit('call:accept', { callId: current.callId }, async (response = {}) => {
      if (response.error) {
        toast(response.error);
        updateCall(null);
        return;
      }
      try {
        await agora.join({ channelName: current.channelName, type: current.type });
      } catch (error) {
        toast.error(error.message);
        finish('Call failed', { notifyServer: true });
      }
    });
  }, [socket, agora, stopRing, updateCall, finish]);

  const rejectCall = useCallback(() => {
    const current = callRef.current;
    if (!current || current.status !== 'incoming') return;
    stopRing();
    socket?.emit('call:reject', { callId: current.callId });
    updateCall(null);
  }, [socket, stopRing, updateCall]);

  const hangUp = useCallback(() => {
    const current = callRef.current;
    if (!current) return;
    if (current.status === 'ended') {
      updateCall(null);
      return;
    }
    finish(current.status === 'outgoing' ? 'Call cancelled' : 'Call ended', { notifyServer: true });
  }, [finish, updateCall]);

  // ── Socket events ────────────────────────────────────────────────
  const onIncoming = useCallback(({ callId, channelName, type, caller }) => {
    const current = callRef.current;
    if (current && current.status !== 'ended') {
      socket?.emit('call:reject', { callId });
      return;
    }
    clearTimeout(clearTimerRef.current);
    updateCall({ status: 'incoming', direction: 'incoming', callId, channelName, type, peer: caller, startedAt: null });
    ring('incoming');
    if (document.visibilityState !== 'visible') {
      showNotification(`Incoming ${type === 'video' ? 'video' : 'voice'} call`, { body: caller.name, tag: 'incoming-call' });
    }
  }, [socket, ring, updateCall]);

  const onAccepted = useCallback(({ callId }) => {
    const current = callRef.current;
    if (current?.callId !== callId || current.status !== 'outgoing') return;
    stopRing();
    updateCall({ status: 'connecting' });
  }, [stopRing, updateCall]);

  const onEnded = useCallback((payload) => {
    const current = callRef.current;
    if (!current || current.callId !== payload.callId) return;
    finish(describeEnd(payload, user?._id, current.direction));
  }, [finish, user?._id]);

  const onHandledElsewhere = useCallback(({ callId }) => {
    const current = callRef.current;
    if (current?.callId === callId && current.status === 'incoming') {
      stopRing();
      updateCall(null);
    }
  }, [stopRing, updateCall]);

  useSocketEvent('call:incoming', onIncoming);
  useSocketEvent('call:accepted', onAccepted);
  useSocketEvent('call:ended', onEnded);
  useSocketEvent('call:handled', onHandledElsewhere);
  // The other side asked to reconnect through the relay.
  useSocketEvent('call:relay', useCallback(({ callId }) => {
    if (callRef.current?.callId === callId && callRef.current.status !== 'ended') switchToRelay();
  }, [switchToRelay]));

  useEffect(() => () => {
    stopRing();
    releaseWakeLock();
    clearTimeout(clearTimerRef.current);
    clearTimeout(remoteGoneTimer.current);
  }, [stopRing]);

  const value = useMemo(() => ({ startCall, call }), [startCall, call]);

  const showBanner = call?.status === 'incoming' && isDesktop();

  return (
    <CallContext.Provider value={value}>
      {children}
      {call && showBanner && (
        <IncomingCallBanner call={call} onAccept={acceptCall} onReject={rejectCall} />
      )}
      {call && !showBanner && minimized && call.status !== 'ended' && call.status !== 'incoming' && (
        <MinimizedCall call={call} onRestore={() => setMinimized(false)} onEnd={hangUp} />
      )}
      {call && !showBanner && !(minimized && call.status !== 'ended' && call.status !== 'incoming') && (
        <CallScreen
          call={call}
          agora={agora}
          onAccept={acceptCall}
          onReject={rejectCall}
          onEnd={hangUp}
          onMinimize={() => setMinimized(true)}
        />
      )}
    </CallContext.Provider>
  );
};

export const useCall = () => useContext(CallContext);
