export default function IncomingCallBanner({ caller, onAccept, onReject }) {
  return (
    <div style={{
      position: 'fixed', top: '20px', right: '20px',
      zIndex: 9998, width: '320px',
      background: 'white', borderRadius: '20px',
      boxShadow: '0 8px 40px rgba(0,0,0,0.2)',
      overflow: 'hidden',
      animation: 'slideDown 0.3s ease',
      border: '1px solid #e0e0e0',
    }}>
      <style>{`
        @keyframes slideDown {
          from { transform: translateY(-100px); opacity: 0; }
          to   { transform: translateY(0);      opacity: 1; }
        }
      `}</style>

      {/* Green top bar */}
      <div style={{
        background: 'linear-gradient(135deg, #128C7E, #075E54)',
        padding: '10px 16px',
        display: 'flex', alignItems: 'center', gap: '8px'
      }}>
        <span style={{ fontSize: '16px' }}>📞</span>
        <span style={{ color: 'white', fontSize: '13px', fontWeight: 600 }}>
          Incoming Audio Call
        </span>
      </div>

      {/* Caller info */}
      <div style={{
        padding: '16px', display: 'flex',
        alignItems: 'center', gap: '14px'
      }}>
        <div style={{
          width: '52px', height: '52px', borderRadius: '50%',
          overflow: 'hidden', flexShrink: 0,
          background: 'linear-gradient(135deg, #128C7E, #075E54)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          color: 'white', fontWeight: 800, fontSize: '22px'
        }}>
          {caller?.avatar ? (
            <img src={caller.avatar} alt={caller.name}
              style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
          ) : (
            caller?.name?.[0]?.toUpperCase()
          )}
        </div>

        <div style={{ flex: 1 }}>
          <p style={{ margin: '0 0 2px', fontWeight: 700, color: '#111', fontSize: '16px' }}>
            {caller?.name}
          </p>
          <p style={{ margin: 0, color: '#888', fontSize: '13px' }}>
            is calling you...
          </p>
        </div>

        {/* Buttons */}
        <div style={{ display: 'flex', gap: '10px' }}>
          <button onClick={onReject} style={{
            width: '44px', height: '44px', borderRadius: '50%',
            background: '#fee2e2', border: 'none', cursor: 'pointer',
            fontSize: '18px', display: 'flex', alignItems: 'center',
            justifyContent: 'center', transition: 'background 0.2s'
          }}
            onMouseEnter={e => e.currentTarget.style.background = '#fecaca'}
            onMouseLeave={e => e.currentTarget.style.background = '#fee2e2'}
          >📵</button>

          <button onClick={onAccept} style={{
            width: '44px', height: '44px', borderRadius: '50%',
            background: '#dcfce7', border: 'none', cursor: 'pointer',
            fontSize: '18px', display: 'flex', alignItems: 'center',
            justifyContent: 'center', transition: 'background 0.2s',
            animation: 'pulse 1s infinite'
          }}
            onMouseEnter={e => e.currentTarget.style.background = '#bbf7d0'}
            onMouseLeave={e => e.currentTarget.style.background = '#dcfce7'}
          >📞</button>
        </div>
      </div>
    </div>
  );
}