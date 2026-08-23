export default function ConversationItem({
  conversation, currentUser, isSelected,
  isOnline, onClick, unreadCount = 0
}) {
  const other = conversation.participants?.find(
    p => String(p._id) !== String(currentUser?._id)
  );
  const lastMsg = conversation.lastMessage;

  const formatTime = (date) => {
    if (!date) return '';
    const d = new Date(date);
    const now = new Date();
    if (d.toDateString() === now.toDateString()) {
      return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    }
    return d.toLocaleDateString([], { month: 'short', day: 'numeric' });
  };

  const isMyLastMsg = lastMsg?.sender?._id === currentUser._id ||
    lastMsg?.sender === currentUser._id;

  return (
    <div onClick={onClick} style={{
      display: 'flex', alignItems: 'center', gap: '12px',
      padding: '10px 16px', cursor: 'pointer',
      background: isSelected ? '#e9f5f4' : 'white',
      borderLeft: isSelected ? '4px solid #128C7E' : '4px solid transparent',
      borderBottom: '1px solid #f5f5f5', transition: 'background 0.15s'
    }}
      onMouseEnter={e => { if (!isSelected) e.currentTarget.style.background = '#f5f5f5'; }}
      onMouseLeave={e => { if (!isSelected) e.currentTarget.style.background = 'white'; }}
    >
      {/* Avatar */}
      <div style={{ position: 'relative', flexShrink: 0 }}>
        {other?.avatar ? (
          <img src={other.avatar} alt={other.name}
            style={{
              width: '52px', height: '52px', borderRadius: '50%',
              objectFit: 'cover', border: '2px solid #e0e0e0'
            }}
          />
        ) : (
          <div style={{
            width: '52px', height: '52px', borderRadius: '50%',
            background: 'linear-gradient(135deg, #128C7E, #075E54)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            color: 'white', fontWeight: 700, fontSize: '22px'
          }}>
            {other?.name?.[0]?.toUpperCase() || '?'}
          </div>
        )}
        {isOnline && (
          <div style={{
            position: 'absolute', bottom: '2px', right: '2px',
            width: '13px', height: '13px', borderRadius: '50%',
            background: '#25D366', border: '2px solid white'
          }} />
        )}
      </div>

      {/* Info */}
      <div style={{ flex: 1, overflow: 'hidden' }}>
        <div style={{
          display: 'flex', justifyContent: 'space-between',
          alignItems: 'center', marginBottom: '3px'
        }}>
          <span style={{ fontWeight: 700, color: '#111', fontSize: '15px' }}>
            {other?.name || 'Unknown'}
          </span>
          <span style={{
            fontSize: '11px',
            color: unreadCount > 0 ? '#25D366' : '#999',
            fontWeight: unreadCount > 0 ? 700 : 400
          }}>
            {formatTime(lastMsg?.createdAt || conversation.updatedAt)}
          </span>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          {/* ✅ Show online status instead of last message */}
          <p style={{
            margin: 0, fontSize: '13px',
            color: isOnline ? '#25D366' : '#aaa',
            fontWeight: isOnline ? 600 : 400,
          }}>
            {isOnline ? '🟢 Online' : '⚪ Offline'}
          </p>

          {/* Unread badge */}
          {unreadCount > 0 && (
            <div style={{
              background: '#25D366', color: 'white',
              borderRadius: '50%', minWidth: '20px', height: '20px',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: '11px', fontWeight: 700, marginLeft: '8px',
              padding: '0 4px', flexShrink: 0
            }}>
              {unreadCount > 99 ? '99+' : unreadCount}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}