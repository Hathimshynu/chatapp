import { createContext, useContext, useEffect, useState, useCallback, useRef } from 'react';
import { useAuth } from './AuthContext';
import { useSocket } from './SocketContext';
import useWebRTC from '../hooks/useWebRTC';
import CallModal from '../components/CallModal';
import IncomingCallBanner from '../components/IncomingCallBanner';

const CallContext = createContext();

export const CallProvider = ({ children }) => {
  const { user }           = useAuth();
  const { socket }         = useSocket();
  const [callState, setCallState]         = useState(null);  // null | 'outgoing' | 'incoming' | 'active'
  const [callType, setCallType]           = useState('audio');
  const [otherUser, setOtherUser]         = useState(null);
  const [isMuted, setIsMuted]             = useState(false);
  const [incomingData, setIncomingData]   = useState(null);
  const [showBanner, setShowBanner]       = useState(false);
  const {
    remoteStream, callDuration, formatDuration,
    joinCall, toggleMute, endCall,
    startRingtone, stopRingtone,
  } = useWebRTC({ socket, user });

  const getChannelName = useCallback((firstId, secondId) => (
    `chatapp-${[String(firstId), String(secondId)].sort().join('-')}`
  ), []);

  // ── Socket listeners ─────────────────────────────────────────────
  useEffect(() => {
    if (!socket) return;

    // Someone is calling us
    socket.on('incomingCall', ({ callerId, callerName, callerAvatar, callType, socketId, channelName }) => {
      setIncomingData({ callerId, callerName, callerAvatar, callType, socketId, channelName });
      setOtherUser({ _id: callerId, name: callerName, avatar: callerAvatar });
      setCallType(callType);

      if (callState === 'active') {
        // Already on a call — auto reject
        socket.emit('rejectCall', { callerId });
        return;
      }

      setShowBanner(true);
      startRingtone();
    });

    socket.on('callAccepted', () => {
      stopRingtone();
      setCallState('active');
    });

    // Call was rejected
    socket.on('callRejected', ({ reason }) => {
      stopRingtone();
      endCall();
      setCallState(null);
      setOtherUser(null);
      alert(`Call ended: ${reason}`);
    });

    // Other side ended
    socket.on('callEnded', () => {
      stopRingtone();
      endCall();
      setCallState(null);
      setOtherUser(null);
      setIsMuted(false);
    });

    // Call was cancelled before pickup
    socket.on('callCancelled', () => {
      stopRingtone();
      setShowBanner(false);
      setIncomingData(null);
      setCallState(null);
    });

    return () => {
      socket.off('incomingCall');
      socket.off('callAccepted');
      socket.off('callRejected');
      socket.off('callEnded');
      socket.off('callCancelled');
    };
  }, [socket, callState, endCall, startRingtone, stopRingtone]);

  // ── Start outgoing call ──────────────────────────────────────────
  const startCall = useCallback(async (targetUser, type = 'audio') => {
    if (!socket || !targetUser?._id) return;
    setOtherUser(targetUser);
    setCallType(type);
    setCallState('outgoing');
    setIsMuted(false);

    try {
      const channelName = getChannelName(user._id, targetUser._id);
      await joinCall(channelName, type);
      startRingtone();
      socket.emit('callUser', {
        receiverId:  targetUser._id,
        callType:    type,
        callerId:    user._id,
        callerName:  user.name,
        callerAvatar: user.avatar || '',
        channelName
      });
    } catch (err) {
      alert(err.message);
      setCallState(null);
      setOtherUser(null);
      endCall();
    }
  }, [socket, user, joinCall, getChannelName, startRingtone, endCall]);

  // ── Accept call ──────────────────────────────────────────────────
  const acceptCall = useCallback(async () => {
    if (!incomingData) return;
    setShowBanner(false);
    setCallState('active');
    stopRingtone();

    try {
      const channelName = incomingData.channelName || getChannelName(incomingData.callerId, user._id);
      await joinCall(channelName, incomingData.callType);
      socket.emit('acceptCall', { callerId: incomingData.callerId });
    } catch (err) {
      alert(err.message);
      setCallState(null);
    }
  }, [incomingData, user?._id, joinCall, getChannelName, socket, stopRingtone]);

  // ── Reject call ──────────────────────────────────────────────────
  const rejectCall = useCallback(() => {
    if (!incomingData) return;
    stopRingtone();
    socket.emit('rejectCall', { callerId: incomingData.callerId });
    setShowBanner(false);
    setIncomingData(null);
    setCallState(null);
  }, [incomingData, socket, stopRingtone]);

  // ── End active call ──────────────────────────────────────────────
  const hangUp = useCallback(() => {
    if (otherUser?._id) {
      if (callState === 'outgoing') {
        socket.emit('cancelCall', { receiverId: otherUser._id });
      } else {
        socket.emit('endCall', { receiverId: otherUser._id });
      }
    }
    stopRingtone();
    endCall();
    setCallState(null);
    setOtherUser(null);
    setIsMuted(false);
    setIncomingData(null);
  }, [otherUser, callState, socket, endCall, stopRingtone]);

  // ── Toggle mute ──────────────────────────────────────────────────
  const handleToggleMute = useCallback(() => {
    const muted = toggleMute();
    setIsMuted(muted);
  }, [toggleMute]);

  return (
    <CallContext.Provider value={{ startCall }}>
      {children}

      {/* Incoming call banner (small popup) */}
      {showBanner && incomingData && !callState && (
        <IncomingCallBanner
          caller={{ name: incomingData.callerName, avatar: incomingData.callerAvatar }}
          onAccept={acceptCall}
          onReject={rejectCall}
        />
      )}

      {/* Full screen call modal */}
      {callState && (
        <CallModal
          callState={callState}
          callType={callType}
          otherUser={otherUser}
          isMuted={isMuted}
          callDuration={callDuration}
          formatDuration={formatDuration}
          remoteStream={remoteStream}
          onAccept={acceptCall}
          onReject={rejectCall}
          onEnd={hangUp}
          onToggleMute={handleToggleMute}
        />
      )}
    </CallContext.Provider>
  );
};

export const useCall = () => useContext(CallContext);