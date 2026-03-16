import { useState, useEffect, useCallback, useRef } from 'react';
import axios from 'axios';
import { useAuth } from '../context/AuthContext';
import { useSocket } from '../context/SocketContext';
import { usePusher } from '../context/PusherContext';
import ConversationItem from './ConversationItem';
import Profile from '../pages/Profile';

export default function Sidebar({ selectedConversation, onSelectConversation }) {
  const [conversations, setConversations] = useState([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [activeTab, setActiveTab] = useState('chats');
  const [fetchDone, setFetchDone] = useState(false);
  const [unreadCounts, setUnreadCounts] = useState({});
  const [showProfile, setShowProfile] = useState(false);
  const { user, logout } = useAuth();
  const { onlineUsers } = useSocket();
  const { channel } = usePusher();
  const hasFetched = useRef(false);
  const selectedConvRef = useRef(selectedConversation);

  useEffect(() => {
    selectedConvRef.current = selectedConversation;
  }, [selectedConversation]);

  const fetchConversations = useCallback(async () => {
    if (!user?.token) return;
    try {
      const { data } = await axios.get('/api/messages/conversations', {
        headers: { Authorization: `Bearer ${user.token}` },
        params: { _t: Date.now() }
      });
      setConversations(data);
      setFetchDone(true);
    } catch (err) {
      console.error(err);
      setFetchDone(true);
    }
  }, [user?.token]);

  useEffect(() => {
    if (user?.token && !hasFetched.current) {
      hasFetched.current = true;
      fetchConversations();
    }
  }, [user?.token, fetchConversations]);

  // ✅ Pusher — real-time new message
  useEffect(() => {
    if (!channel) return;

    channel.bind('new-message', ({ message, conversationId, sender }) => {
      setConversations(prev => {
        const exists = prev.find(c => c._id === conversationId);
        if (exists) {
          const updated = prev.map(c =>
            c._id === conversationId
              ? { ...c, lastMessage: message, updatedAt: new Date().toISOString() }
              : c
          );
          return [...updated].sort((a, b) =>
            new Date(b.updatedAt) - new Date(a.updatedAt)
          );
        } else {
          fetchConversations();
          return prev;
        }
      });

      const currentConv = selectedConvRef.current;
      if (currentConv?._id !== conversationId) {
        setUnreadCounts(prev => ({
          ...prev,
          [conversationId]: (prev[conversationId] || 0) + 1
        }));
        showBrowserNotification(sender.name, message.text || '📷 Photo');
      }
    });

    channel.bind('message-sent', ({ message, conversationId }) => {
      setConversations(prev => {
        const exists = prev.find(c => c._id === conversationId);
        if (exists) {
          const updated = prev.map(c =>
            c._id === conversationId
              ? { ...c, lastMessage: message, updatedAt: new Date().toISOString() }
              : c
          );
          return [...updated].sort((a, b) =>
            new Date(b.updatedAt) - new Date(a.updatedAt)
          );
        } else {
          fetchConversations();
          return prev;
        }
      });
    });

    return () => {
      channel.unbind('new-message');
      channel.unbind('message-sent');
    };
  }, [channel, fetchConversations]);

  const showBrowserNotification = (title, body) => {
    if (Notification.permission === 'granted') {
      new Notification(`💬 ${title}`, {
        body,
        icon: '/chat-icon.png',
        vibrate: [200, 100, 200]
      });
    }
  };

  useEffect(() => {
    if (Notification.permission === 'default') {
      Notification.requestPermission();
    }
  }, []);

  const handleSelectConversation = (conv) => {
    setUnreadCounts(prev => ({ ...prev, [conv._id]: 0 }));
    onSelectConversation(conv);
  };

  const totalUnread = Object.values(unreadCounts).reduce((a, b) => a + b, 0);

  const handleSearch = async (e) => {
    const q = e.target.value;
    setSearchQuery(q);
    if (!q.trim()) return setSearchResults([]);
    try {
      const { data } = await axios.get(`/api/users/search?query=${q}`, {
        headers: { Authorization: `Bearer ${user.token}` }
      });
      setSearchResults(data);
    } catch (err) {
      console.error(err);
    }
  };

  const startChat = (otherUser) => {
    setSearchQuery('');
    setSearchResults([]);
    setActiveTab('chats');

    const existing = conversations.find(c =>
      !c.isGroup && c.participants?.some(p => p._id === otherUser._id)
    );

    if (existing) {
      handleSelectConversation(existing);
      return;
    }

    const tempConversation = {
      _id: 'temp_' + otherUser._id,
      isGroup: false,
      participants: [
        {
          _id: user._id, name: user.name,
          email: user.email, avatar: user.avatar || '',
          status: user.status || ''
        },
        {
          _id: otherUser._id, name: otherUser.name,
          email: otherUser.email, avatar: otherUser.avatar || '',
          status: otherUser.status || ''
        }
      ],
      lastMessage: null,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };

    onSelectConversation(tempConversation);
  };

  const getOtherUser = (conv) => conv.participants?.find(p => p._id !== user._id);

  return (
    <div style={{
      width: '100%', background: 'white',
      borderRight: '1px solid #e9edef',
      display: 'flex', flexDirection: 'column', height: '100vh'
    }}>

      {/* ── Header ────────────────────────────────────────────────── */}
      <div style={{
        background: 'linear-gradient(135deg, #128C7E, #075E54)',
        padding: '12px 16px', display: 'flex',
        alignItems: 'center', justifyContent: 'space-between', flexShrink: 0
      }}>
        {/* ✅ Clickable avatar + name → opens profile */}
        <div
          onClick={() => setShowProfile(true)}
          style={{
            display: 'flex', alignItems: 'center', gap: '10px',
            cursor: 'pointer', flex: 1
          }}
        >
          {/* Avatar */}
          <div style={{
            width: '46px', height: '46px', borderRadius: '50%',
            overflow: 'hidden', flexShrink: 0,
            border: '2px solid rgba(255,255,255,0.6)',
            background: 'rgba(255,255,255,0.2)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            transition: 'opacity 0.2s'
          }}
            onMouseEnter={e => e.currentTarget.style.opacity = '0.85'}
            onMouseLeave={e => e.currentTarget.style.opacity = '1'}
          >
            {user?.avatar ? (
              <img
                src={user.avatar} alt="avatar"
                style={{ width: '100%', height: '100%', objectFit: 'cover' }}
              />
            ) : (
              <span style={{ fontSize: '20px', color: 'white', fontWeight: 800 }}>
                {user?.name?.[0]?.toUpperCase()}
              </span>
            )}
          </div>

          {/* Name + status */}
          <div>
            <div style={{
              color: 'white', fontWeight: 700, fontSize: '15px',
              display: 'flex', alignItems: 'center', gap: '6px'
            }}>
              {user?.name}
              <span style={{
                fontSize: '10px', background: 'rgba(255,255,255,0.2)',
                padding: '2px 7px', borderRadius: '10px',
                color: 'rgba(255,255,255,0.85)', fontWeight: 500
              }}>
                ✏️ Edit
              </span>
            </div>
            <div style={{ color: 'rgba(255,255,255,0.75)', fontSize: '12px', marginTop: '1px' }}>
              🟢 Online
            </div>
          </div>
        </div>

        {/*logout */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexShrink: 0 }}>
          <button onClick={logout} style={{
            background: 'rgba(255,255,255,0.2)',
            border: '1px solid rgba(255,255,255,0.3)',
            color: 'white', padding: '6px 14px',
            borderRadius: '20px', cursor: 'pointer',
            fontSize: '13px', fontWeight: 600,
            transition: 'background 0.2s'
          }}
            onMouseEnter={e => e.currentTarget.style.background = 'rgba(255,255,255,0.35)'}
            onMouseLeave={e => e.currentTarget.style.background = 'rgba(255,255,255,0.2)'}
          >
            Logout
          </button>
        </div>
      </div>

      {/* ── Tabs ──────────────────────────────────────────────────── */}
      <div style={{ display: 'flex', borderBottom: '1px solid #f0f2f5', flexShrink: 0 }}>
        {['chats', 'online'].map(tab => (
          <button key={tab} onClick={() => setActiveTab(tab)} style={{
            flex: 1, padding: '13px', border: 'none', background: 'white',
            color: activeTab === tab ? '#128C7E' : '#aaa',
            fontWeight: activeTab === tab ? 700 : 500,
            fontSize: '13px', cursor: 'pointer',
            textTransform: 'uppercase', letterSpacing: '0.5px',
            borderBottom: activeTab === tab ? '3px solid #128C7E' : '3px solid transparent',
            transition: 'all 0.2s'
          }}>
            {tab === 'chats' ? (
              <span>
                💬 Chats
                {totalUnread > 0 && (
                  <span style={{
                    marginLeft: '6px', background: '#25D366',
                    color: 'white', borderRadius: '10px',
                    padding: '1px 7px', fontSize: '11px', fontWeight: 700
                  }}>
                    {totalUnread}
                  </span>
                )}
              </span>
            ) : (
              `🟢 Online (${onlineUsers.filter(id => id !== user._id).length})`
            )}
          </button>
        ))}
      </div>

      {/* ── Search ────────────────────────────────────────────────── */}
      <div style={{ padding: '10px 14px', background: '#f0f2f5', flexShrink: 0 }}>
        <div style={{ position: 'relative' }}>
          <span style={{
            position: 'absolute', left: '13px', top: '50%',
            transform: 'translateY(-50%)', fontSize: '15px',
            color: '#aaa', pointerEvents: 'none'
          }}>🔍</span>
          <input
            value={searchQuery}
            onChange={handleSearch}
            placeholder="Search or start new chat"
            style={{
              width: '100%', padding: '11px 40px 11px 38px',
              background: 'white', border: '1px solid #e0e0e0',
              borderRadius: '22px', fontSize: '14px',
              outline: 'none', boxSizing: 'border-box',
              color: '#111', boxShadow: '0 1px 4px rgba(0,0,0,0.07)'
            }}
          />
          {searchQuery && (
            <button
              onClick={() => { setSearchQuery(''); setSearchResults([]); }}
              style={{
                position: 'absolute', right: '10px', top: '50%',
                transform: 'translateY(-50%)', background: '#bbb',
                border: 'none', borderRadius: '50%', width: '20px', height: '20px',
                cursor: 'pointer', fontSize: '11px', color: 'white',
                display: 'flex', alignItems: 'center', justifyContent: 'center'
              }}
            >✕</button>
          )}
        </div>
      </div>

      {/* ── List ──────────────────────────────────────────────────── */}
      <div style={{ flex: 1, overflowY: 'auto' }}>
        {searchQuery ? (
          searchResults.length > 0 ? (
            <>
              <div style={{
                padding: '8px 16px', fontSize: '11px', color: '#999',
                fontWeight: 700, textTransform: 'uppercase',
                letterSpacing: '0.8px', background: '#fafafa',
                borderBottom: '1px solid #f0f0f0'
              }}>
                Results ({searchResults.length})
              </div>
              {searchResults.map(u => (
                <div key={u._id} onClick={() => startChat(u)} style={{
                  display: 'flex', alignItems: 'center', gap: '12px',
                  padding: '12px 16px', cursor: 'pointer',
                  borderBottom: '1px solid #f5f5f5',
                  background: 'white', transition: 'background 0.15s'
                }}
                  onMouseEnter={e => e.currentTarget.style.background = '#f0faf9'}
                  onMouseLeave={e => e.currentTarget.style.background = 'white'}
                >
                  {/* Search result avatar */}
                  <div style={{ position: 'relative', flexShrink: 0 }}>
                    <div style={{
                      width: '50px', height: '50px', borderRadius: '50%',
                      overflow: 'hidden',
                      background: 'linear-gradient(135deg, #128C7E, #075E54)',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      color: 'white', fontWeight: 700, fontSize: '20px'
                    }}>
                      {u.avatar ? (
                        <img src={u.avatar} alt={u.name}
                          style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                        />
                      ) : (
                        u.name?.[0]?.toUpperCase()
                      )}
                    </div>
                    {onlineUsers.includes(u._id) && (
                      <div style={{
                        position: 'absolute', bottom: '1px', right: '1px',
                        width: '13px', height: '13px', borderRadius: '50%',
                        background: '#25D366', border: '2px solid white'
                      }} />
                    )}
                  </div>
                  <div style={{ flex: 1, overflow: 'hidden' }}>
                    <div style={{
                      fontWeight: 700, color: '#111', fontSize: '15px',
                      whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis'
                    }}>
                      {u.name}
                    </div>
                    <div style={{
                      fontSize: '13px', marginTop: '2px',
                      color: onlineUsers.includes(u._id) ? '#25D366' : '#aaa',
                      fontWeight: onlineUsers.includes(u._id) ? 600 : 400
                    }}>
                      {onlineUsers.includes(u._id) ? '🟢 Online' : '⚪ Offline'}
                    </div>
                  </div>
                  <div style={{
                    background: '#128C7E', color: 'white',
                    padding: '6px 14px', borderRadius: '16px',
                    fontSize: '12px', fontWeight: 700, flexShrink: 0
                  }}>
                    Chat →
                  </div>
                </div>
              ))}
            </>
          ) : (
            <div style={{ textAlign: 'center', color: '#999', marginTop: '70px', padding: '20px' }}>
              <div style={{ fontSize: '44px', marginBottom: '12px' }}>🔍</div>
              <p style={{ fontWeight: 600, color: '#555', margin: '0 0 6px' }}>No users found</p>
            </div>
          )
        ) : activeTab === 'online' ? (
          conversations.filter(c => onlineUsers.includes(getOtherUser(c)?._id)).length === 0 ? (
            <div style={{ textAlign: 'center', color: '#999', marginTop: '70px', padding: '20px' }}>
              <div style={{ fontSize: '44px', marginBottom: '12px' }}>🟢</div>
              <p style={{ fontWeight: 600, color: '#555' }}>No users online</p>
            </div>
          ) : (
            conversations
              .filter(c => onlineUsers.includes(getOtherUser(c)?._id))
              .map(conv => (
                <ConversationItem
                  key={conv._id}
                  conversation={conv}
                  currentUser={user}
                  isSelected={selectedConversation?._id === conv._id}
                  isOnline={true}
                  unreadCount={unreadCounts[conv._id] || 0}
                  onClick={() => handleSelectConversation(conv)}
                />
              ))
          )
        ) : !fetchDone ? (
          <div style={{
            display: 'flex', flexDirection: 'column',
            alignItems: 'center', justifyContent: 'center',
            marginTop: '60px', gap: '12px'
          }}>
            <div style={{
              width: '32px', height: '32px',
              border: '3px solid #c8e6c9', borderTop: '3px solid #128C7E',
              borderRadius: '50%', animation: 'spin 0.8s linear infinite'
            }} />
            <p style={{ color: '#999', margin: 0, fontSize: '14px' }}>Loading chats...</p>
            <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
          </div>
        ) : conversations.length === 0 ? (
          <div style={{ textAlign: 'center', color: '#999', marginTop: '70px', padding: '20px' }}>
            <div style={{ fontSize: '50px', marginBottom: '12px' }}>💬</div>
            <p style={{ fontWeight: 600, color: '#555', margin: '0 0 6px' }}>No conversations yet</p>
            <p style={{ fontSize: '13px', margin: 0 }}>Search someone to start chatting</p>
          </div>
        ) : (
          conversations.map(conv => (
            <ConversationItem
              key={conv._id}
              conversation={conv}
              currentUser={user}
              isSelected={selectedConversation?._id === conv._id}
              isOnline={onlineUsers.includes(getOtherUser(conv)?._id)}
              unreadCount={unreadCounts[conv._id] || 0}
              onClick={() => handleSelectConversation(conv)}
            />
          ))
        )}
      </div>

      {/* ── Profile Modal ─────────────────────────────────────────── */}
      {showProfile && <Profile onClose={() => setShowProfile(false)} />}
    </div>
  );
}