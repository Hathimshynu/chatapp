export default function IncomingCallBanner({ caller, callType = 'audio', onAccept, onReject }) {
  const isVideo = callType === 'video';

  return (
    <div style={{
      position: 'fixed', top: '24px', right: '24px',
      zIndex: 9998, width: 'min(370px, calc(100vw - 32px))',
      background: 'rgba(12, 35, 31, 0.96)', borderRadius: '24px',
      boxShadow: '0 18px 55px rgba(0,0,0,0.3)',
      overflow: 'hidden',
      animation: 'slideDown 0.35s cubic-bezier(.2,.8,.2,1)',
      border: '1px solid rgba(167,243,208,0.22)',
      color: 'white',
    }}>
      <style>{`
        @keyframes slideDown {
          from { transform: translateY(-100px); opacity: 0; }
          to   { transform: translateY(0);      opacity: 1; }
        }
        @keyframes callPulse {
          0%, 100% { box-shadow: 0 0 0 0 rgba(110,231,183,0.35); }
          50% { box-shadow: 0 0 0 10px rgba(110,231,183,0); }
        }
      `}</style>

      <div style={{
        background: 'linear-gradient(135deg, #195e54, #123e39)',
        padding: '16px 20px',
        display: 'flex', alignItems: 'center', gap: '8px'
      }}>
        <span style={{
          width: '34px', height: '34px', borderRadius: '12px',
          display: 'grid', placeItems: 'center',
          background: 'rgba(110,231,183,0.16)', color: '#a7f3d0'
        }}>
          {isVideo ? (
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m16 13 5 3V8l-5 3"/><rect x="3" y="6" width="13" height="12" rx="2"/></svg>
          ) : (
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.8 19.8 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6A19.8 19.8 0 0 1 2.12 4.18 2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.12.9.33 1.78.62 2.63a2 2 0 0 1-.45 2.11L8 9.73a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.85.29 1.73.5 2.63.62A2 2 0 0 1 22 16.92z"/></svg>
          )}
        </span>
        <span style={{ color: '#d1fae5', fontSize: '13px', fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase' }}>
          Incoming {isVideo ? 'Video' : 'Audio'} Call
        </span>
      </div>

      <div style={{
        padding: '20px', display: 'flex', alignItems: 'center', gap: '14px'
      }}>
        <div style={{
          width: '58px', height: '58px', borderRadius: '19px',
          overflow: 'hidden', flexShrink: 0,
          background: 'linear-gradient(135deg, #3b8275, #1d5b52)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          color: 'white', fontWeight: 800, fontSize: '23px',
          border: '2px solid rgba(167,243,208,0.5)'
        }}>
          {caller?.avatar ? (
            <img src={caller.avatar} alt={caller.name}
              style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
          ) : (
            caller?.name?.[0]?.toUpperCase()
          )}
        </div>

        <div style={{ flex: 1 }}>
          <p style={{ margin: '0 0 4px', fontWeight: 800, color: '#f0fdf4', fontSize: '17px' }}>
            {caller?.name}
          </p>
          <p style={{ margin: 0, color: 'rgba(226,252,238,0.62)', fontSize: '13px' }}>
            is calling you...
          </p>
        </div>

        <div style={{ display: 'flex', gap: '10px' }}>
          <button onClick={onReject} aria-label="Decline call" title="Decline call" style={{
            width: '46px', height: '46px', borderRadius: '16px',
            background: '#fb7185', border: 'none', cursor: 'pointer',
            color: 'white', display: 'grid', placeItems: 'center', transition: 'transform 0.2s'
          }}
            onMouseEnter={e => e.currentTarget.style.transform = 'translateY(-2px)'}
            onMouseLeave={e => e.currentTarget.style.transform = 'translateY(0)'}
          ><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><path d="M10.7 13.3a15.8 15.8 0 0 0 3.1 3.1l1.4-1.4a2 2 0 0 1 2.1-.45c.85.29 1.73.5 2.63.62A2 2 0 0 1 21.7 17v2.8a2 2 0 0 1-2.18 2A19.8 19.8 0 0 1 2.2 4.48 2 2 0 0 1 4.2 2.3H7a2 2 0 0 1 1.83 1.24"/><path d="m3 3 18 18"/></svg></button>

          <button onClick={onAccept} aria-label="Accept call" title="Accept call" style={{
            width: '46px', height: '46px', borderRadius: '16px',
            background: '#6ee7b7', border: 'none', cursor: 'pointer',
            color: '#064e3b', display: 'grid', placeItems: 'center', transition: 'transform 0.2s',
            animation: 'callPulse 1.8s infinite'
          }}
            onMouseEnter={e => e.currentTarget.style.transform = 'translateY(-2px)'}
            onMouseLeave={e => e.currentTarget.style.transform = 'translateY(0)'}
          ><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.8 19.8 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6A19.8 19.8 0 0 1 2.12 4.18 2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.12.9.33 1.78.62 2.63a2 2 0 0 1-.45 2.11L8 9.73a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.85.29 1.73.5 2.63.62A2 2 0 0 1 22 16.92z"/></svg></button>
        </div>
      </div>
    </div>
  );
}