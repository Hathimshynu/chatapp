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
  const [isSpeakerOn, setIsSpeakerOn]     = useState(true);
  const [incomingData, setIncomingData]   = useState(null);
  const [showBanner, setShowBanner]       = useState(false);
  const {
    remoteStream, callDuration, formatDuration,
    joinCall, toggleMute, endCall,
    toggleSpeaker,
    startRingtone, stopRingtone,
  } = useWebRTC({ socket, user });

  const getChannelName = useCallback((firstId, secondId) => {
    if (!firstId || !secondId || firstId === 'undefined' || secondId === 'undefined') {
      throw new Error('Unable to start call: user information is incomplete.');
    }
    return `chatapp-${[String(firstId), String(secondId)].sort().join('-')}`;
  }, []);

  // ── Socket listeners ─────────────────────────────────────────────
  useEffect(() => {
    if (!socket) return;

    // Someone is calling us
    socket.on('incomingCall', ({ callerId, callerName, callerAvatar, callType, socketId, channelName }) => {
      const normalizedCallType = callType === 'video' ? 'video' : 'audio';
      setIncomingData({ callerId, callerName, callerAvatar, callType: normalizedCallType, socketId, channelName });
      setOtherUser({ _id: callerId, name: callerName, avatar: callerAvatar });
      setCallType(normalizedCallType);

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
      setIsSpeakerOn(true);
      alert(`Call ended: ${reason}`);
    });

    // Other side ended
    socket.on('callEnded', () => {
      stopRingtone();
      endCall();
      setCallState(null);
      setOtherUser(null);
      setIsMuted(false);
      setIsSpeakerOn(true);
    });

    // Call was cancelled before pickup
    socket.on('callCancelled', () => {
      stopRingtone();
      setShowBanner(false);
      setIncomingData(null);
      setCallState(null);
      setIsSpeakerOn(true);
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
    type = type === 'video' ? 'video' : 'audio';
    const callerId = user?._id || user?.id;
    const receiverId = targetUser?._id || targetUser?.id;
    if (!socket || !callerId || !receiverId) {
      throw new Error('Unable to start call: user information is incomplete.');
    }
    const callTarget = { ...targetUser, _id: receiverId };
    setOtherUser(callTarget);
    setCallType(type);
    setCallState('outgoing');
    setIsMuted(false);
    setIsSpeakerOn(true);

    try {
      const channelName = getChannelName(callerId, receiverId);
      await joinCall(channelName, type);
      startRingtone();
      socket.emit('callUser', {
        receiverId,
        callType:    type,
        callerId,
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
      const receiverId = user?._id || user?.id;
      const channelName = incomingData.channelName || getChannelName(incomingData.callerId, receiverId);
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
    setIsSpeakerOn(true);
    setIncomingData(null);
  }, [otherUser, callState, socket, endCall, stopRingtone]);

  // ── Toggle mute ──────────────────────────────────────────────────
  const handleToggleMute = useCallback(() => {
    const muted = toggleMute();
    setIsMuted(muted);
  }, [toggleMute]);

  const handleToggleSpeaker = useCallback(() => {
    setIsSpeakerOn(toggleSpeaker());
  }, [toggleSpeaker]);

  return (
    <CallContext.Provider value={{ startCall }}>
      {children}

      {/* Incoming call banner (small popup) */}
      {showBanner && incomingData && !callState && (
        <IncomingCallBanner
          caller={{ name: incomingData.callerName, avatar: incomingData.callerAvatar }}
          callType={incomingData.callType}
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
          isSpeakerOn={isSpeakerOn}
          callDuration={callDuration}
          formatDuration={formatDuration}
          remoteStream={remoteStream}
          onAccept={acceptCall}
          onReject={rejectCall}
          onEnd={hangUp}
          onToggleMute={handleToggleMute}
          onToggleSpeaker={handleToggleSpeaker}
        />
      )}
    </CallContext.Provider>
  );
};

export const useCall = () => useContext(CallContext);