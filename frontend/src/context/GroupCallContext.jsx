import { createContext, lazy, Suspense, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import axios from 'axios';
import toast from 'react-hot-toast';
import { useSocket, useSocketEvent } from './SocketContext';
import { useChat } from './ChatContext';
import { useCall } from './CallContext';
import useAgoraGroup from '../hooks/useAgoraGroup';
import IncomingCallBanner from '../components/call/IncomingCallBanner';
import MinimizedCall from '../components/call/MinimizedCall';
import { playEndTone, startRingtone } from '../lib/sounds';
import { showNotification } from '../lib/notify';
import { callsUnavailableReason } from '../lib/media';

const GroupCallScreen = lazy(() => import('../components/call/GroupCallScreen'));

const GroupCallContext = createContext(null);
const RING_MS = 45 * 1000;

const END_TEXT = {
  removed: 'You were removed from the group',
  deleted: 'The group was deleted',
  no_answer: 'No one joined',
  ended: 'Call ended'
};

// groupCall.status: 'incoming' (ringing me) | 'connecting' | 'active'
export const GroupCallProvider = ({ children }) => {
  const { socket, connected } = useSocket();
  const { conversations } = useChat();
  const { call: directCall } = useCall();
  // Someone's media isn't reaching us → everyone in the call moves to Agora's TCP relay.
  const onMediaMissing = () => {
    const current = callRef.current;
    if (!current?.callId || current.status === 'incoming') return;
    socket?.emit('groupcall:relay', { callId: current.callId });
    agora.switchToRelay();
  };
  const agora = useAgoraGroup({ onMediaMissing });
  const { switchToRelay } = agora;
  const [groupCall, setGroupCall] = useState(null);
  const [activeCalls, setActiveCalls] = useState({}); // conversationId -> public call
  const [minimized, setMinimized] = useState(false);
  const callRef = useRef(null);
  const stopRingRef = useRef(null);
  const ringTimer = useRef(null);

  const update = useCallback((next) => {
    callRef.current = next;
    setGroupCall(next);
    if (!next) setMinimized(false);
  }, []);

  const stopRing = useCallback(() => {
    stopRingRef.current?.();
    stopRingRef.current = null;
    clearTimeout(ringTimer.current);
  }, []);

  const groupOf = useCallback(
    (conversationId) => conversations.find(c => String(c._id) === String(conversationId)),
    [conversations]
  );

  // Calls already running when this tab loads (or after a reconnect).
  useEffect(() => {
    if (!connected) return;
    axios.get('/api/calls/group/active')
      .then(({ data }) => setActiveCalls(Object.fromEntries((data.calls || []).map(c => [c.conversationId, c]))))
      .catch(() => {});
  }, [connected]);

  const finish = useCallback((message) => {
    const current = callRef.current;
    if (!current) return;
    stopRing();
    if (current.status !== 'incoming') {
      socket?.emit('groupcall:leave', { callId: current.callId });
      agora.leave();
      playEndTone();
      if (message) toast(message);
    }
    update(null);
  }, [socket, agora, stopRing, update]);

  const connect = useCallback(async (response, type) => {
    update({ ...callRef.current, ...response, status: 'connecting' });
    try {
      await agora.join({ channelName: response.channelName, type: response.type || type });
      if (callRef.current?.callId !== response.callId) return;
      update({ ...callRef.current, status: 'active', joinedAt: Date.now() });
    } catch (error) {
      toast.error(error.message);
      finish();
    }
  }, [agora, update, finish]);

  const busy = () => {
    if (callRef.current && callRef.current.status !== 'incoming') {
      toast('You are already on a call');
      return true;
    }
    if (directCall && directCall.status !== 'ended') {
      toast('You are already on a call');
      return true;
    }
    if (!socket?.connected) {
      toast.error('You are offline. Check your connection.');
      return true;
    }
    const unavailable = callsUnavailableReason();
    if (unavailable) {
      toast.error(unavailable, { duration: 6000 });
      return true;
    }
    return false;
  };

  const startGroupCall = useCallback((conversation, type = 'audio') => {
    if (busy()) return;
    stopRing();
    const callType = type === 'video' ? 'video' : 'audio';
    update({ status: 'connecting', conversationId: String(conversation._id), groupName: conversation.name, type: callType });
    socket.emit('groupcall:start', { conversationId: conversation._id, type: callType }, (response = {}) => {
      if (response.error) {
        toast.error(response.error);
        update(null);
        return;
      }
      connect(response, callType);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [socket, directCall, connect, stopRing, update]);

  const joinGroupCall = useCallback((conversationId) => {
    const target = callRef.current?.status === 'incoming' && callRef.current.conversationId === String(conversationId)
      ? callRef.current
      : activeCalls[String(conversationId)];
    if (!target) return toast('This call has ended');
    if (callRef.current?.callId === target.callId && callRef.current.status !== 'incoming') {
      setMinimized(false);
      return;
    }
    if (busy()) return;
    stopRing();
    const group = groupOf(conversationId);
    update({ status: 'connecting', conversationId: String(conversationId), groupName: group?.name || target.groupName, type: target.type, callId: target.callId });
    socket.emit('groupcall:join', { callId: target.callId }, (response = {}) => {
      if (response.error) {
        toast.error(response.error);
        update(null);
        return;
      }
      connect(response, target.type);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [socket, activeCalls, directCall, groupOf, connect, stopRing, update]);

  const decline = useCallback(() => {
    const current = callRef.current;
    if (current?.status !== 'incoming') return;
    socket?.emit('groupcall:decline', { callId: current.callId });
    stopRing();
    update(null);
  }, [socket, stopRing, update]);

  const leave = useCallback(() => finish(), [finish]);

  // ── Socket events ────────────────────────────────────────────────
  useSocketEvent('groupcall:updated', useCallback(({ conversationId, call }) => {
    setActiveCalls(prev => {
      const next = { ...prev };
      if (call) next[conversationId] = call;
      else delete next[conversationId];
      return next;
    });
    if (call && callRef.current?.callId === call.callId) {
      update({ ...callRef.current, participants: call.participants });
    }
  }, [update]));

  useSocketEvent('groupcall:incoming', useCallback((payload) => {
    const busyNow = (callRef.current && callRef.current.status !== 'incoming') || (directCall && directCall.status !== 'ended');
    if (busyNow) return; // the "Join" pill in the chat stays available
    const group = groupOf(payload.conversationId);
    update({ ...payload, status: 'incoming', groupName: group?.name || payload.groupName, avatar: group?.avatar });
    stopRing();
    stopRingRef.current = startRingtone('incoming');
    ringTimer.current = setTimeout(() => {
      if (callRef.current?.callId === payload.callId && callRef.current.status === 'incoming') {
        stopRing();
        update(null);
      }
    }, RING_MS);
    if (document.visibilityState !== 'visible') {
      showNotification(`Incoming group ${payload.type === 'video' ? 'video' : 'voice'} call`, {
        body: `${payload.startedBy?.name || 'Someone'} · ${payload.groupName}`,
        tag: 'incoming-call'
      });
    }
  }, [directCall, groupOf, stopRing, update]));

  useSocketEvent('groupcall:ended', useCallback(({ callId, conversationId, reason }) => {
    setActiveCalls(prev => {
      if (prev[conversationId]?.callId !== callId) return prev;
      const next = { ...prev };
      delete next[conversationId];
      return next;
    });
    if (callRef.current?.callId !== callId) return;
    finish(callRef.current.status === 'incoming' ? null : END_TEXT[reason] || END_TEXT.ended);
  }, [finish]));

  useSocketEvent('groupcall:relay', useCallback(({ callId }) => {
    if (callRef.current?.callId === callId && callRef.current.status !== 'incoming') switchToRelay();
  }, [switchToRelay]));

  useSocketEvent('groupcall:handled', useCallback(({ callId }) => {
    if (callRef.current?.callId === callId && callRef.current.status === 'incoming') {
      stopRing();
      update(null);
    }
  }, [stopRing, update]));

  useEffect(() => () => stopRing(), [stopRing]);

  const value = useMemo(() => ({
    groupCall, activeCalls, startGroupCall, joinGroupCall, leaveGroupCall: leave
  }), [groupCall, activeCalls, startGroupCall, joinGroupCall, leave]);

  const incoming = groupCall?.status === 'incoming';
  const banner = incoming && {
    type: groupCall.type,
    peer: { name: groupCall.groupName, avatar: groupCall.avatar, isGroup: true },
    subtitle: `${groupCall.startedBy?.name || 'Someone'} is calling the group`
  };
  const pill = groupCall && !incoming && {
    type: groupCall.type,
    status: groupCall.status,
    startedAt: groupCall.joinedAt,
    peer: { name: groupCall.groupName }
  };

  return (
    <GroupCallContext.Provider value={value}>
      {children}
      {incoming && (
        <IncomingCallBanner
          call={banner}
          group
          onAccept={() => joinGroupCall(groupCall.conversationId)}
          onReject={decline}
        />
      )}
      {pill && minimized && <MinimizedCall call={pill} onRestore={() => setMinimized(false)} onEnd={leave} />}
      {pill && !minimized && (
        <Suspense fallback={null}>
          <GroupCallScreen
            call={groupCall}
            group={groupOf(groupCall.conversationId)}
            agora={agora}
            onLeave={leave}
            onMinimize={() => setMinimized(true)}
          />
        </Suspense>
      )}
    </GroupCallContext.Provider>
  );
};

export const useGroupCall = () => useContext(GroupCallContext);
