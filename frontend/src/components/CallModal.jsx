import { useEffect, useRef, useState } from 'react';

export default function CallModal({
  // Call state
  callState,        // 'outgoing' | 'incoming' | 'active'
  callType,         // 'audio'
  otherUser,        // { name, avatar }
  isMuted,
  callDuration,
  formatDuration,
  remoteStream,

  // Actions
  onAccept,
  onReject,
  onEnd,
  onToggleMute,
}) {
  const remoteAudioRef = useRef(null);
  const remoteVideoRef = useRef(null);
  const [ripple, setRipple] = useState(0);

  // ✅ Attach remote stream to audio element
  useEffect(() => {
    if (remoteStream && callType === 'video' && remoteVideoRef.current) {
      remoteStream.play(remoteVideoRef.current);
    }
  }, [remoteStream, callType]);

  // ✅ Ripple animation for ringing
  useEffect(() => {
    if (callState === 'incoming' || callState === 'outgoing') {
      const t = setInterval(() => setRipple(r => r + 1), 1500);
      return () => clearInterval(t);
    }
  }, [callState]);

  const getStatusText = () => {
    if (callState === 'outgoing') return 'Calling...';
    if (callState === 'incoming') return 'Incoming call...';
    if (callState === 'active')   return formatDuration(callDuration);
    return '';
  };

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 9999,
      background: 'linear-gradient(160deg, #064e3b 0%, #065f46 40%, #047857 100%)',
      display: 'flex', flexDirection: 'column',
      alignItems: 'center', justifyContent: 'center',
      animation: 'fadeIn 0.3s ease',
    }}>
      <style>{`
        @keyframes fadeIn    { from{opacity:0;transform:scale(0.97)} to{opacity:1;transform:scale(1)} }
        @keyframes rippleOut { 0%{transform:scale(1);opacity:0.6} 100%{transform:scale(2.2);opacity:0} }
        @keyframes pulse     { 0%,100%{transform:scale(1)} 50%{transform:scale(1.05)} }
      `}</style>

      {/* Hidden audio for remote stream */}
      <audio ref={remoteAudioRef} autoPlay playsInline style={{ display: 'none' }} />
      {callType === 'video' && remoteStream && (
        <video ref={remoteVideoRef} autoPlay playsInline style={{
          position: 'absolute', inset: 0, width: '100%', height: '100%',
          objectFit: 'cover', zIndex: -1, opacity: 0.72
        }} />
      )}

      {/* Top — name + status */}
      <div style={{ textAlign: 'center', marginBottom: '48px' }}>
        <p style={{
          color: 'rgba(255,255,255,0.6)', fontSize: '14px',
          margin: '0 0 8px', letterSpacing: '1px', textTransform: 'uppercase'
        }}>
          {callType === 'audio' ? 'Audio Call' : 'Video Call'}
        </p>
        <h2 style={{
          color: 'white', fontSize: '28px', fontWeight: 800,
          margin: '0 0 10px', letterSpacing: '0.5px'
        }}>
          {otherUser?.name}
        </h2>
        <p style={{
          color: callState === 'active' ? '#6ee7b7' : 'rgba(255,255,255,0.7)',
          fontSize: '16px', margin: 0, fontWeight: callState === 'active' ? 700 : 400,
          minHeight: '24px'
        }}>
          {getStatusText()}
        </p>
      </div>

      {/* Avatar with ripple */}
      <div style={{ position: 'relative', marginBottom: '64px' }}>
        {/* Ripple rings */}
        {(callState === 'incoming' || callState === 'outgoing') && (
          <>
            {[0, 1, 2].map(i => (
              <div key={`${ripple}-${i}`} style={{
                position: 'absolute',
                top: '50%', left: '50%',
                transform: 'translate(-50%, -50%)',
                width: '130px', height: '130px',
                borderRadius: '50%',
                border: '2px solid rgba(255,255,255,0.3)',
                animation: `rippleOut 2s ease-out ${i * 0.4}s infinite`,
                pointerEvents: 'none',
              }} />
            ))}
          </>
        )}

        {/* Avatar */}
        <div style={{
          width: '130px', height: '130px', borderRadius: '50%',
          overflow: 'hidden',
          border: '4px solid rgba(255,255,255,0.4)',
          boxShadow: '0 8px 32px rgba(0,0,0,0.4)',
          background: 'rgba(255,255,255,0.15)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          animation: callState === 'active' ? 'pulse 2s infinite' : 'none',
        }}>
          {otherUser?.avatar ? (
            <img src={otherUser.avatar} alt={otherUser.name}
              style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
          ) : (
            <span style={{ fontSize: '56px', color: 'white', fontWeight: 800 }}>
              {otherUser?.name?.[0]?.toUpperCase()}
            </span>
          )}
        </div>

        {/* Active indicator */}
        {callState === 'active' && (
          <div style={{
            position: 'absolute', bottom: '6px', right: '6px',
            width: '20px', height: '20px', borderRadius: '50%',
            background: '#25D366', border: '3px solid white',
            boxShadow: '0 2px 8px rgba(0,0,0,0.3)',
          }} />
        )}
      </div>

      {/* Mute indicator */}
      {callState === 'active' && isMuted && (
        <div style={{
          background: 'rgba(239,68,68,0.2)',
          border: '1px solid rgba(239,68,68,0.4)',
          borderRadius: '20px', padding: '6px 16px',
          color: '#fca5a5', fontSize: '13px', fontWeight: 600,
          marginBottom: '24px', display: 'flex', alignItems: 'center', gap: '6px'
        }}>
          🔇 Microphone muted
        </div>
      )}

      {/* ── Buttons ── */}
      {callState === 'incoming' && (
        <div style={{ display: 'flex', gap: '48px', alignItems: 'center' }}>
          {/* Reject */}
          <div style={{ textAlign: 'center' }}>
            <button onClick={onReject} style={{
              width: '72px', height: '72px', borderRadius: '50%',
              background: '#ef4444', border: 'none', cursor: 'pointer',
              fontSize: '28px', color: 'white',
              boxShadow: '0 6px 24px rgba(239,68,68,0.5)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              transition: 'transform 0.15s',
            }}
              onMouseEnter={e => e.currentTarget.style.transform = 'scale(1.1)'}
              onMouseLeave={e => e.currentTarget.style.transform = 'scale(1)'}
            >📵</button>
            <p style={{ color: 'rgba(255,255,255,0.6)', fontSize: '12px', marginTop: '8px' }}>Decline</p>
          </div>

          {/* Accept */}
          <div style={{ textAlign: 'center' }}>
            <button onClick={onAccept} style={{
              width: '72px', height: '72px', borderRadius: '50%',
              background: '#22c55e', border: 'none', cursor: 'pointer',
              fontSize: '28px', color: 'white',
              boxShadow: '0 6px 24px rgba(34,197,94,0.5)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              transition: 'transform 0.15s',
              animation: 'pulse 1s infinite',
            }}
              onMouseEnter={e => e.currentTarget.style.transform = 'scale(1.1)'}
              onMouseLeave={e => e.currentTarget.style.transform = 'scale(1)'}
            >📞</button>
            <p style={{ color: 'rgba(255,255,255,0.6)', fontSize: '12px', marginTop: '8px' }}>Accept</p>
          </div>
        </div>
      )}

      {callState === 'outgoing' && (
        <div style={{ textAlign: 'center' }}>
          <button onClick={onEnd} style={{
            width: '72px', height: '72px', borderRadius: '50%',
            background: '#ef4444', border: 'none', cursor: 'pointer',
            fontSize: '28px', color: 'white',
            boxShadow: '0 6px 24px rgba(239,68,68,0.5)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            transition: 'transform 0.15s',
          }}
            onMouseEnter={e => e.currentTarget.style.transform = 'scale(1.1)'}
            onMouseLeave={e => e.currentTarget.style.transform = 'scale(1)'}
          >📵</button>
          <p style={{ color: 'rgba(255,255,255,0.6)', fontSize: '12px', marginTop: '8px' }}>Cancel</p>
        </div>
      )}

      {callState === 'active' && (
        <div style={{ display: 'flex', gap: '32px', alignItems: 'center' }}>
          {/* Mute */}
          <div style={{ textAlign: 'center' }}>
            <button onClick={onToggleMute} style={{
              width: '60px', height: '60px', borderRadius: '50%',
              background: isMuted ? '#ef4444' : 'rgba(255,255,255,0.15)',
              border: '2px solid rgba(255,255,255,0.2)',
              cursor: 'pointer', fontSize: '22px', color: 'white',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              transition: 'all 0.2s',
            }}
              onMouseEnter={e => e.currentTarget.style.background = isMuted ? '#dc2626' : 'rgba(255,255,255,0.25)'}
              onMouseLeave={e => e.currentTarget.style.background = isMuted ? '#ef4444' : 'rgba(255,255,255,0.15)'}
            >{isMuted ? '🔇' : '🎙️'}</button>
            <p style={{ color: 'rgba(255,255,255,0.6)', fontSize: '12px', marginTop: '8px' }}>
              {isMuted ? 'Unmute' : 'Mute'}
            </p>
          </div>

          {/* Speaker (visual only) */}
          <div style={{ textAlign: 'center' }}>
            <button style={{
              width: '60px', height: '60px', borderRadius: '50%',
              background: 'rgba(255,255,255,0.15)',
              border: '2px solid rgba(255,255,255,0.2)',
              cursor: 'pointer', fontSize: '22px', color: 'white',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>🔊</button>
            <p style={{ color: 'rgba(255,255,255,0.6)', fontSize: '12px', marginTop: '8px' }}>Speaker</p>
          </div>

          {/* End call */}
          <div style={{ textAlign: 'center' }}>
            <button onClick={onEnd} style={{
              width: '72px', height: '72px', borderRadius: '50%',
              background: '#ef4444', border: 'none', cursor: 'pointer',
              fontSize: '28px', color: 'white',
              boxShadow: '0 6px 24px rgba(239,68,68,0.5)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              transition: 'transform 0.15s',
            }}
              onMouseEnter={e => e.currentTarget.style.transform = 'scale(1.1)'}
              onMouseLeave={e => e.currentTarget.style.transform = 'scale(1)'}
            >📵</button>
            <p style={{ color: 'rgba(255,255,255,0.6)', fontSize: '12px', marginTop: '8px' }}>End Call</p>
          </div>
        </div>
      )}
    </div>
  );
}