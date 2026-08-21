import { useState, useEffect, useRef } from "react";
import axios from "axios";
import { useAuth } from "../context/AuthContext";
import { useSocket } from "../context/SocketContext";
import { usePusher } from "../context/PusherContext";
import MessageBubble from "./MessageBubble";
import StickerPicker from "./StickerPicker";
import { useCall } from "../context/CallContext";

export default function ChatBox({ conversation, onBack }) {
  const [messages, setMessages] = useState([]);
  const [text, setText] = useState("");
  const [isTyping, setIsTyping] = useState(false);
  const [loading, setLoading] = useState(false);
  const [showAttachMenu, setShowAttachMenu] = useState(false);
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const [callState, setCallState] = useState(null);
  const [showProfile, setShowProfile] = useState(false);
  const [replyTo, setReplyTo] = useState(null);
  const [showStickerPicker, setShowStickerPicker] = useState(false);
  const [showAvatarModal, setShowAvatarModal] = useState(false);
  const messagesEndRef = useRef(null);
  const typingTimeoutRef = useRef(null);
  const fileInputRef = useRef(null);
  const inputRef = useRef(null);
  const { user } = useAuth();
  const { socket, onlineUsers } = useSocket();
  const { channel } = usePusher();
  const { startCall } = useCall();

  const handleCall = (type) => {
    startCall(otherUser, type);
  };

  const emojis = [
    "😀",
    "😂",
    "❤️",
    "👍",
    "🔥",
    "🎉",
    "😍",
    "🥰",
    "😎",
    "🤔",
    "👋",
    "🙏",
    "💪",
    "✅",
    "🎯",
    "💬",
    "😊",
    "🥳",
    "😭",
    "🤣",
    "🫡",
    "🤝",
    "👏",
    "🎊",
    "💯",
  ];

  const currentUserId = user?._id || user?.id;
  const otherUser = conversation?.participants
    ?.map(participant => ({ ...participant, _id: participant._id || participant.id }))
    ?.find((participant) => String(participant._id) !== String(currentUserId));
  const isOnline = onlineUsers.includes(otherUser?._id);

  useEffect(() => {
    setMessages([]);
    setReplyTo(null);
    setShowEmojiPicker(false);
    setShowAttachMenu(false);
    setShowStickerPicker(false);
    if (conversation?._id && !conversation._id.startsWith("temp")) {
      fetchMessages();
    }
  }, [conversation?._id]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // ✅ Pusher — receive messages + seen ticks
useEffect(() => {
  if (!channel || !conversation) return;

  channel.bind('new-message', async (payload) => {
    const {
      messageId, conversationId, hasImage,
      text, sender, createdAt, seen, messageType
    } = payload;

    // Only handle if this conversation
    if (
      conversation._id !== conversationId &&
      !conversation._id?.startsWith('temp')
    ) return;

    if (hasImage) {
      // ✅ Fetch full message with image from API
      try {
        const { data } = await axios.get(`/api/messages/single/${messageId}`, {
          headers: { Authorization: `Bearer ${user.token}` }
        });
        setMessages(prev => {
          if (prev.find(m => m._id === data._id)) return prev;
          return [...prev, data];
        });
      } catch (err) {
        console.error('fetch single message error:', err);
      }
    } else {
      // ✅ Text message — use payload directly
      setMessages(prev => {
        if (prev.find(m => m._id === messageId)) return prev;
        return [...prev, {
          _id: messageId,
          conversationId,
          text,
          sender,
          createdAt,
          seen,
          messageType: messageType || 'text',
        }];
      });
    }
  });

  // ✅ Double tick — messages seen
  channel.bind('messages-seen', ({ conversationId, messageIds = [] }) => {
    if (conversation._id === conversationId) {
      setMessages(prev =>
        prev.map(msg =>
          (messageIds.includes(msg._id) || msg.sender?._id === user._id || msg.sender === user._id)
            ? { ...msg, seen: [user._id, 'receiver'] }
            : msg
        )
      );
    }
  });

  return () => {
    channel.unbind('new-message');
    channel.unbind('messages-seen');
  };
}, [channel, conversation?._id]);

  // ✅ Socket — typing only
  useEffect(() => {
    if (!socket) return;
    socket.on("userTyping", () => setIsTyping(true));
    socket.on("userStopTyping", () => setIsTyping(false));
    socket.on("messages-seen", ({ conversationId, messageIds = [] }) => {
      if (conversation?._id !== conversationId) return;
      setMessages(prev => prev.map(msg =>
        messageIds.includes(String(msg._id))
          ? { ...msg, seen: [user._id, 'receiver'] }
          : msg
      ));
    });
    return () => {
      socket.off("userTyping");
      socket.off("userStopTyping");
      socket.off("messages-seen");
    };
  }, [socket, conversation?._id, user?._id]);

  const fetchMessages = async (showLoader = true) => {
    if (showLoader) setLoading(true);
    try {
      const { data } = await axios.get(`/api/messages/${conversation._id}`, {
        headers: { Authorization: `Bearer ${user.token}` },
      });
      setMessages(data);
    } catch (err) {
      console.error(err);
    } finally {
      if (showLoader) setLoading(false);
    }
  };

  // Keep read receipts current if a realtime event is missed during reconnect.
  useEffect(() => {
    if (!conversation?._id || conversation._id.startsWith('temp') || !user?.token) return;

    const statusSync = window.setInterval(() => fetchMessages(false), 1500);
    return () => window.clearInterval(statusSync);
  }, [conversation?._id, user?.token]);

  const handleTyping = (e) => {
    setText(e.target.value);
    socket?.emit("typing", { receiverId: otherUser?._id });
    clearTimeout(typingTimeoutRef.current);
    typingTimeoutRef.current = setTimeout(() => {
      socket?.emit("stopTyping", { receiverId: otherUser?._id });
    }, 1500);
  };

 const sendMessage = async () => {
  if (!text.trim() || !otherUser?._id) return;
  const msgText = text.trim();
  setText('');
  setReplyTo(null);

  try {
    const { data } = await axios.post(
      '/api/messages/send',
      {
        receiverId: otherUser._id,
        text: msgText,
        replyTo: replyTo?._id || null
      },
      { headers: { Authorization: `Bearer ${user.token}` } }
    );

    // ✅ data.message contains the full populated message
    if (data.message) {
      setMessages(prev => {
        if (prev.find(m => m._id === data.message._id)) return prev;
        return [...prev, data.message];
      });
    }

    socket?.emit('stopTyping', { receiverId: otherUser._id });
  } catch (err) {
    console.error('sendMessage error:', err);
    setText(msgText); // restore text on error
  }
};

  const handleImageUpload = async (e) => {
  const file = e.target.files[0];
  if (!file || !otherUser?._id) return;
  setShowAttachMenu(false);
  const reader = new FileReader();
  reader.onloadend = async () => {
    try {
      const { data } = await axios.post(
        '/api/messages/send',
        { receiverId: otherUser._id, text: '', image: reader.result },
        { headers: { Authorization: `Bearer ${user.token}` } }
      );
      // ✅ data.message
      if (data.message) {
        setMessages(prev => {
          if (prev.find(m => m._id === data.message._id)) return prev;
          return [...prev, data.message];
        });
      }
    } catch (err) {
      console.error(err);
    }
  };
  reader.readAsDataURL(file);
  e.target.value = '';
};

const sendSticker = async (sticker) => {
  setShowStickerPicker(false);
  if (!otherUser?._id) return;
  try {
    const { data } = await axios.post(
      '/api/messages/send',
      {
        receiverId: otherUser._id,
        text: '',
        image: sticker.url,
        messageType: 'sticker'
      },
      { headers: { Authorization: `Bearer ${user.token}` } }
    );
    // ✅ data.message
    if (data.message) {
      setMessages(prev => {
        if (prev.find(m => m._id === data.message._id)) return prev;
        return [...prev, data.message];
      });
    }
  } catch (err) {
    console.error(err);
  }
};

  const handleEmojiClick = (emoji) => {
    setText((prev) => prev + emoji);
    inputRef.current?.focus();
  };

  // ── Empty / Welcome state ──────────────────────────────────────────
  if (!conversation) {
    return (
      <div
        style={{
          flex: 1,
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          background: "linear-gradient(160deg, #e8f5e9 0%, #f0f4f0 100%)",
        }}
      >
        <div
          style={{
            textAlign: "center",
            padding: "48px 40px",
            background: "white",
            borderRadius: "24px",
            boxShadow: "0 8px 32px rgba(18,140,126,0.12)",
            maxWidth: "400px",
            width: "90%",
          }}
        >
          <div style={{ fontSize: "72px", marginBottom: "16px" }}>💬</div>
          <h2
            style={{
              color: "#128C7E",
              margin: "0 0 10px",
              fontSize: "24px",
              fontWeight: 800,
            }}
          >
            Welcome to ChatApp
          </h2>
          <p
            style={{
              color: "#888",
              margin: "0 0 6px",
              lineHeight: 1.6,
              fontSize: "15px",
            }}
          >
            Send and receive messages privately.
          </p>
          <p style={{ color: "#bbb", margin: "0 0 28px", fontSize: "13px" }}>
            🔒 Your messages are private & secure
          </p>
          <div
            style={{
              display: "flex",
              gap: "16px",
              justifyContent: "center",
              padding: "20px",
              background: "#f8fffe",
              borderRadius: "16px",
              flexWrap: "wrap",
            }}
          >
            {[
              ["💬", "Chat"],
              ["📷", "Photos"],
              ["😊", "Emoji"],
              ["📹", "Video"],
              ["📞", "Call"],
            ].map(([icon, label]) => (
              <div key={label} style={{ textAlign: "center" }}>
                <div style={{ fontSize: "28px" }}>{icon}</div>
                <div
                  style={{
                    fontSize: "11px",
                    color: "#aaa",
                    marginTop: "4px",
                    fontWeight: 600,
                  }}
                >
                  {label}
                </div>
              </div>
            ))}
          </div>
          <p
            style={{
              color: "#ccc",
              fontSize: "12px",
              marginTop: "20px",
              marginBottom: 0,
            }}
          >
            ← Search a contact to begin
          </p>
        </div>
      </div>
    );
  }

  // ── Safety check ───────────────────────────────────────────────────
  if (!otherUser) {
    return (
      <div
        style={{
          flex: 1,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "#f0f2f5",
        }}
      >
        <div
          style={{
            background: "white",
            padding: "36px 40px",
            borderRadius: "20px",
            textAlign: "center",
            boxShadow: "0 4px 20px rgba(0,0,0,0.08)",
          }}
        >
          <div style={{ fontSize: "48px", marginBottom: "14px" }}>⚠️</div>
          <p style={{ color: "#555", margin: "0 0 18px", fontWeight: 600 }}>
            Could not load this conversation
          </p>
          <button
            onClick={onBack}
            style={{
              padding: "11px 28px",
              background: "#128C7E",
              color: "white",
              border: "none",
              borderRadius: "12px",
              cursor: "pointer",
              fontWeight: 700,
              fontSize: "15px",
            }}
          >
            ← Go Back
          </button>
        </div>
      </div>
    );
  }

  return (
    <div
      style={{
        flex: 1,
        display: "flex",
        height: "100vh",
        position: "relative",
        overflow: "hidden",
      }}
    >
      {/* ── Call Overlay ── */}
      {callState && (
        <div
          style={{
            position: "absolute",
            inset: 0,
            zIndex: 200,
            background:
              callState === "video"
                ? "linear-gradient(135deg, #0d2137, #1a3a5c)"
                : "linear-gradient(135deg, #075E54, #128C7E)",
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            gap: "16px",
          }}
        >
          {/* ✅ Call overlay avatar with profile pic */}
          <div
            style={{
              width: "110px",
              height: "110px",
              borderRadius: "50%",
              overflow: "hidden",
              background: "rgba(255,255,255,0.15)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              border: "3px solid rgba(255,255,255,0.35)",
              animation: "callPulse 2s infinite",
            }}
          >
            {otherUser.avatar ? (
              <img
                src={otherUser.avatar}
                alt={otherUser.name}
                style={{ width: "100%", height: "100%", objectFit: "cover" }}
              />
            ) : (
              <span
                style={{ fontSize: "48px", color: "white", fontWeight: 800 }}
              >
                {otherUser.name?.[0]?.toUpperCase()}
              </span>
            )}
          </div>
          <div style={{ color: "white", fontSize: "26px", fontWeight: 800 }}>
            {otherUser.name}
          </div>
          <div style={{ color: "rgba(255,255,255,0.65)", fontSize: "15px" }}>
            {callState === "video" ? "📹 Video calling..." : "📞 Calling..."}
          </div>
          <button
            onClick={() => setCallState(null)}
            style={{
              marginTop: "28px",
              width: "68px",
              height: "68px",
              borderRadius: "50%",
              background: "#f44336",
              border: "none",
              fontSize: "26px",
              cursor: "pointer",
              boxShadow: "0 6px 24px rgba(244,67,54,0.55)",
              color: "white",
            }}
          >
            📵
          </button>
          <style>{`@keyframes callPulse {0%,100%{box-shadow:0 0 0 0 rgba(255,255,255,0.3)}50%{box-shadow:0 0 0 24px rgba(255,255,255,0)}}`}</style>
        </div>
      )}

      {/* ── Main Chat ── */}
      <div
        style={{
          flex: 1,
          display: "flex",
          flexDirection: "column",
          height: "100vh",
          minWidth: 0,
        }}
      >
        {/* Header */}
        <div
          style={{
            background: "linear-gradient(135deg, #128C7E, #075E54)",
            padding: "0 16px",
            height: "64px",
            display: "flex",
            alignItems: "center",
            gap: "10px",
            boxShadow: "0 2px 12px rgba(0,0,0,0.2)",
            flexShrink: 0,
            zIndex: 10,
          }}
        >
          <button
            onClick={onBack}
            style={{
              background: "none",
              border: "none",
              color: "white",
              fontSize: "22px",
              cursor: "pointer",
              padding: "6px",
              borderRadius: "50%",
              width: "38px",
              height: "38px",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              transition: "background 0.2s",
              flexShrink: 0,
            }}
            onMouseEnter={(e) =>
              (e.currentTarget.style.background = "rgba(255,255,255,0.15)")
            }
            onMouseLeave={(e) => (e.currentTarget.style.background = "none")}
          >
            ←
          </button>

          <div
            onClick={() => setShowProfile(!showProfile)}
            style={{
              display: "flex",
              alignItems: "center",
              gap: "10px",
              flex: 1,
              cursor: "pointer",
            }}
          >
            {/* ✅ Header avatar with profile pic */}
            <div style={{ position: "relative", flexShrink: 0 }}>
              <div
                style={{
                  width: "44px",
                  height: "44px",
                  borderRadius: "50%",
                  overflow: "hidden",
                  background: "rgba(255,255,255,0.25)",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  border: "2px solid rgba(255,255,255,0.5)",
                }}
              >
                {otherUser.avatar ? (
                  <img
                    src={otherUser.avatar}
                    alt={otherUser.name}
                    style={{
                      width: "100%",
                      height: "100%",
                      objectFit: "cover",
                    }}
                  />
                ) : (
                  <span
                    style={{
                      color: "white",
                      fontWeight: 800,
                      fontSize: "18px",
                    }}
                  >
                    {otherUser.name?.[0]?.toUpperCase()}
                  </span>
                )}
              </div>
              <div
                style={{
                  position: "absolute",
                  bottom: "1px",
                  right: "1px",
                  width: "12px",
                  height: "12px",
                  borderRadius: "50%",
                  background: isOnline ? "#25D366" : "#aaa",
                  border: "2px solid #128C7E",
                }}
              />
            </div>

            <div>
              <div
                style={{ color: "white", fontWeight: 700, fontSize: "16px" }}
              >
                {otherUser.name}
              </div>
              <div style={{ color: "rgba(255,255,255,0.8)", fontSize: "12px" }}>
                {isTyping
                  ? "✏️ typing..."
                  : isOnline
                    ? "🟢 Online"
                    : "⚪ Offline"}
              </div>
            </div>
          </div>

          <div style={{ display: "flex", gap: "6px", flexShrink: 0 }}>
            {[
              {
                icon: "phone",
                title: "Audio call",
                action: () => handleCall("audio"),
              },
              {
                icon: "video",
                title: "Video call",
                action: () => handleCall("video"),
              },
            ].map(({ icon, title, action }) => (
              <button
                key={title}
                onClick={action}
                title={title}
                style={{
                  background: icon === "video" ? "#dbe7ff" : "#dff2d2",
                  border: "none",
                  color: icon === "video" ? "#315ba6" : "#39752e",
                  width: "40px",
                  height: "40px",
                  borderRadius: "50%",
                  cursor: "pointer",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  transition: "background 0.2s",
                }}
                onMouseEnter={(e) => { e.currentTarget.style.transform = "translateY(-2px)"; }}
                onMouseLeave={(e) => { e.currentTarget.style.transform = "translateY(0)"; }}
              >
                {icon === "video" ? (
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="m16 13 5 3V8l-5 3"/><rect x="3" y="6" width="13" height="12" rx="2"/></svg>
                ) : (
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.8 19.8 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6A19.8 19.8 0 0 1 2.12 4.18 2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.12.9.33 1.78.62 2.63a2 2 0 0 1-.45 2.11L8 9.73a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.85.29 1.73.5 2.63.62A2 2 0 0 1 22 16.92z"/></svg>
                )}
              </button>
            ))}
          </div>
        </div>

        {/* Messages */}
        <div
          style={{
            flex: 1,
            overflowY: "auto",
            padding: "12px 16px",
            background: "#ECE5DD",
            backgroundImage: `url("data:image/svg+xml,%3Csvg width='80' height='80' viewBox='0 0 80 80' xmlns='http://www.w3.org/2000/svg'%3E%3Cg fill='%23c8bfb3' fill-opacity='0.15'%3E%3Cpath d='M40 0L0 40h80zM0 40l40 40 40-40z'/%3E%3C/g%3E%3C/svg%3E")`,
          }}
        >
          <div style={{ textAlign: "center", marginBottom: "14px" }}>
            <span
              style={{
                background: "rgba(255,255,255,0.85)",
                padding: "5px 16px",
                borderRadius: "12px",
                fontSize: "12px",
                color: "#888",
                boxShadow: "0 1px 3px rgba(0,0,0,0.1)",
                fontWeight: 500,
              }}
            >
              {new Date().toLocaleDateString([], {
                weekday: "long",
                month: "long",
                day: "numeric",
              })}
            </span>
          </div>

          {loading ? (
            <div style={{ textAlign: "center", padding: "50px 0" }}>
              <div
                style={{
                  width: "36px",
                  height: "36px",
                  border: "4px solid #c8e6c9",
                  borderTop: "4px solid #128C7E",
                  borderRadius: "50%",
                  animation: "spin 0.8s linear infinite",
                  margin: "0 auto 12px",
                }}
              />
              <p style={{ color: "#888", margin: 0 }}>Loading messages...</p>
              <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
            </div>
          ) : messages.length === 0 ? (
            <div style={{ textAlign: "center", padding: "40px 0" }}>
              <div
                style={{
                  background: "rgba(255,255,255,0.88)",
                  borderRadius: "16px",
                  padding: "20px 32px",
                  display: "inline-block",
                  boxShadow: "0 2px 8px rgba(0,0,0,0.08)",
                }}
              >
                <div style={{ fontSize: "34px", marginBottom: "8px" }}>🔒</div>
                <p
                  style={{ margin: "0 0 4px", color: "#555", fontWeight: 700 }}
                >
                  End-to-end encrypted
                </p>
                <p style={{ margin: 0, color: "#999", fontSize: "13px" }}>
                  Say hi to {otherUser.name}! 👋
                </p>
              </div>
            </div>
          ) : (
            messages.map((msg, idx) => (
              <MessageBubble
                key={msg._id || idx}
                message={msg}
                isMine={msg.sender?._id === user._id || msg.sender === user._id}
                onReply={() => setReplyTo(msg)}
              />
            ))
          )}

          {/* Typing indicator */}
          {isTyping && (
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: "8px",
                margin: "4px 0 8px",
              }}
            >
              {/* ✅ Typing avatar with profile pic */}
              <div
                style={{
                  width: "30px",
                  height: "30px",
                  borderRadius: "50%",
                  overflow: "hidden",
                  background: "linear-gradient(135deg, #128C7E, #075E54)",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  color: "white",
                  fontSize: "12px",
                  fontWeight: 700,
                }}
              >
                {otherUser.avatar ? (
                  <img
                    src={otherUser.avatar}
                    alt={otherUser.name}
                    style={{
                      width: "100%",
                      height: "100%",
                      objectFit: "cover",
                    }}
                  />
                ) : (
                  otherUser.name?.[0]?.toUpperCase()
                )}
              </div>
              <div
                style={{
                  background: "white",
                  borderRadius: "18px 18px 18px 4px",
                  padding: "12px 18px",
                  boxShadow: "0 1px 4px rgba(0,0,0,0.1)",
                  display: "flex",
                  gap: "5px",
                  alignItems: "center",
                }}
              >
                {[0, 1, 2].map((i) => (
                  <div
                    key={i}
                    style={{
                      width: "8px",
                      height: "8px",
                      borderRadius: "50%",
                      background: "#128C7E",
                      opacity: 0.7,
                      animation: `typingDot 1.4s infinite ${i * 0.2}s`,
                    }}
                  />
                ))}
              </div>
            </div>
          )}
          <style>{`@keyframes typingDot {0%,60%,100%{transform:translateY(0);opacity:0.5}30%{transform:translateY(-8px);opacity:1}}`}</style>
          <div ref={messagesEndRef} />
        </div>

        {/* Reply preview */}
        {replyTo && (
          <div
            style={{
              background: "white",
              padding: "10px 16px",
              borderTop: "3px solid #128C7E",
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              flexShrink: 0,
            }}
          >
            <div
              style={{ borderLeft: "4px solid #128C7E", paddingLeft: "10px" }}
            >
              <div
                style={{
                  fontSize: "12px",
                  color: "#128C7E",
                  fontWeight: 700,
                  marginBottom: "2px",
                }}
              >
                ↩ Replying to {replyTo.sender?.name || "message"}
              </div>
              <div style={{ fontSize: "13px", color: "#777" }}>
                {replyTo.image ? "📷 Photo" : replyTo.text?.slice(0, 60)}
              </div>
            </div>
            <button
              onClick={() => setReplyTo(null)}
              style={{
                background: "#f0f2f5",
                border: "none",
                borderRadius: "50%",
                width: "28px",
                height: "28px",
                cursor: "pointer",
                fontSize: "14px",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                color: "#666",
              }}
            >
              ✕
            </button>
          </div>
        )}

        {/* Emoji picker */}
        {showEmojiPicker && (
          <div
            style={{
              background: "white",
              padding: "12px 16px",
              borderTop: "1px solid #e0e0e0",
              flexShrink: 0,
              display: "flex",
              flexWrap: "wrap",
              gap: "4px",
            }}
          >
            {emojis.map((emoji) => (
              <button
                key={emoji}
                onClick={() => handleEmojiClick(emoji)}
                style={{
                  background: "none",
                  border: "none",
                  fontSize: "22px",
                  cursor: "pointer",
                  padding: "5px 7px",
                  borderRadius: "8px",
                  transition: "background 0.15s",
                  lineHeight: 1,
                }}
                onMouseEnter={(e) =>
                  (e.currentTarget.style.background = "#f0f2f5")
                }
                onMouseLeave={(e) =>
                  (e.currentTarget.style.background = "none")
                }
              >
                {emoji}
              </button>
            ))}
          </div>
        )}

        {/* Attach menu */}
        {showAttachMenu && (
          <div
            style={{
              background: "white",
              padding: "16px 20px",
              borderTop: "1px solid #e0e0e0",
              flexShrink: 0,
              display: "flex",
              gap: "24px",
              justifyContent: "center",
            }}
          >
            {[
              {
                icon: "📷",
                label: "Photo/Video",
                color: "#e91e8c",
                accept: "image/*,video/*",
              },
              {
                icon: "📄",
                label: "Document",
                color: "#5c6bc0",
                accept: ".pdf,.doc,.docx,.txt",
              },
              {
                icon: "🎵",
                label: "Audio",
                color: "#ff7043",
                accept: "audio/*",
              },
            ].map(({ icon, label, color, accept }) => (
              <div
                key={label}
                style={{ textAlign: "center", cursor: "pointer" }}
                onClick={() => {
                  fileInputRef.current.accept = accept;
                  fileInputRef.current.click();
                  setShowAttachMenu(false);
                }}
              >
                <div
                  style={{
                    width: "60px",
                    height: "60px",
                    borderRadius: "50%",
                    background: color + "18",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    fontSize: "28px",
                    margin: "0 auto 8px",
                    border: `2px solid ${color}30`,
                    transition: "transform 0.2s",
                  }}
                  onMouseEnter={(e) =>
                    (e.currentTarget.style.transform = "scale(1.1)")
                  }
                  onMouseLeave={(e) =>
                    (e.currentTarget.style.transform = "scale(1)")
                  }
                >
                  {icon}
                </div>
                <span
                  style={{ fontSize: "12px", color: "#666", fontWeight: 600 }}
                >
                  {label}
                </span>
              </div>
            ))}
          </div>
        )}

        {/* Input bar */}
        <div
          style={{
            background: "#f0f2f5",
            padding: "10px 12px",
            display: "flex",
            gap: "8px",
            alignItems: "center",
            borderTop: "1px solid #e0e0e0",
            flexShrink: 0,
            position: "relative",
          }}
        >
          <input
            ref={fileInputRef}
            type="file"
            style={{ display: "none" }}
            onChange={handleImageUpload}
          />

          <button
            onClick={() => {
              setShowEmojiPicker(!showEmojiPicker);
              setShowAttachMenu(false);
              setShowStickerPicker(false);
            }}
            style={{
              width: "42px",
              height: "42px",
              borderRadius: "50%",
              background: showEmojiPicker ? "#128C7E" : "white",
              border: "1px solid #e0e0e0",
              fontSize: "20px",
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              transition: "all 0.2s",
              flexShrink: 0,
              color: showEmojiPicker ? "white" : "inherit",
              boxShadow: "0 1px 3px rgba(0,0,0,0.08)",
            }}
          >
            😊
          </button>

          <button
            onClick={() => {
              setShowStickerPicker(!showStickerPicker);
              setShowEmojiPicker(false);
              setShowAttachMenu(false);
            }}
            style={{
              width: "42px",
              height: "42px",
              borderRadius: "50%",
              background: showStickerPicker ? "#128C7E" : "white",
              border: "1px solid #e0e0e0",
              fontSize: "20px",
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              transition: "all 0.2s",
              flexShrink: 0,
              boxShadow: "0 1px 3px rgba(0,0,0,0.08)",
            }}
          >
            🎭
          </button>

          {/* Sticker picker */}
          {showStickerPicker && (
            <StickerPicker
              onSelect={sendSticker}
              onClose={() => setShowStickerPicker(false)}
            />
          )}

          <button
            onClick={() => {
              setShowAttachMenu(!showAttachMenu);
              setShowEmojiPicker(false);
              setShowStickerPicker(false);
            }}
            style={{
              width: "42px",
              height: "42px",
              borderRadius: "50%",
              background: showAttachMenu ? "#128C7E" : "white",
              border: "1px solid #e0e0e0",
              fontSize: "20px",
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              transition: "all 0.2s",
              flexShrink: 0,
              color: showAttachMenu ? "white" : "inherit",
              boxShadow: "0 1px 3px rgba(0,0,0,0.08)",
            }}
          >
            📎
          </button>

          <input
            ref={inputRef}
            value={text}
            onChange={handleTyping}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                sendMessage();
              }
            }}
            placeholder="Type a message..."
            style={{
              flex: 1,
              padding: "12px 18px",
              borderRadius: "24px",
              border: "1px solid #e0e0e0",
              background: "white",
              fontSize: "15px",
              outline: "none",
              color: "#111",
              boxShadow: "0 1px 3px rgba(0,0,0,0.06)",
            }}
          />

          <button
            onClick={sendMessage}
            disabled={!text.trim()}
            style={{
              width: "44px",
              height: "44px",
              borderRadius: "50%",
              background: text.trim()
                ? "linear-gradient(135deg, #128C7E, #075E54)"
                : "#e0e0e0",
              border: "none",
              color: "white",
              fontSize: "18px",
              cursor: text.trim() ? "pointer" : "default",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              transition: "all 0.25s",
              flexShrink: 0,
              boxShadow: text.trim()
                ? "0 3px 12px rgba(18,140,126,0.45)"
                : "none",
              transform: text.trim() ? "scale(1.05)" : "scale(1)",
            }}
          >
            {text.trim() ? "➤" : "🎤"}
          </button>
        </div>
      </div>

      {/* ── Profile Panel ── */}
      {showProfile && (
        <div
          style={{
            width: "300px",
            background: "white",
            borderLeft: "1px solid #e0e0e0",
            display: "flex",
            flexDirection: "column",
            height: "100vh",
            flexShrink: 0,
            animation: "slideIn 0.25s ease",
          }}
        >
          <style>{`@keyframes slideIn {from{transform:translateX(100%);opacity:0}to{transform:translateX(0);opacity:1}}`}</style>

          <div
            style={{
              background: "linear-gradient(135deg, #128C7E, #075E54)",
              padding: "24px 20px",
              textAlign: "center",
              color: "white",
              position: "relative",
            }}
          >
            <button
              onClick={() => setShowProfile(false)}
              style={{
                position: "absolute",
                top: "14px",
                right: "14px",
                background: "rgba(255,255,255,0.2)",
                border: "none",
                color: "white",
                fontSize: "16px",
                cursor: "pointer",
                width: "30px",
                height: "30px",
                borderRadius: "50%",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              ✕
            </button>

            {/* ✅ Clickable profile avatar */}
            <div
              onClick={() => otherUser.avatar && setShowAvatarModal(true)}
              style={{
                width: "80px",
                height: "80px",
                borderRadius: "50%",
                overflow: "hidden",
                background: "rgba(255,255,255,0.25)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                margin: "0 auto 14px",
                border: "3px solid rgba(255,255,255,0.5)",
                cursor: otherUser.avatar ? "zoom-in" : "default",
                transition: "transform 0.2s, opacity 0.2s",
              }}
              onMouseEnter={(e) => {
                if (otherUser.avatar)
                  e.currentTarget.style.transform = "scale(1.08)";
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.transform = "scale(1)";
              }}
            >
              {otherUser.avatar ? (
                <img
                  src={otherUser.avatar}
                  alt={otherUser.name}
                  style={{ width: "100%", height: "100%", objectFit: "cover" }}
                />
              ) : (
                <span style={{ fontSize: "36px", fontWeight: 800 }}>
                  {otherUser.name?.[0]?.toUpperCase()}
                </span>
              )}
            </div>

            <div style={{ fontWeight: 800, fontSize: "20px" }}>
              {otherUser.name}
            </div>
            <div style={{ fontSize: "13px", opacity: 0.8, marginTop: "5px" }}>
              {isOnline ? "🟢 Online" : "⚪ Offline"}
            </div>
          </div>

          <div style={{ padding: "20px", flex: 1, overflowY: "auto" }}>
            {[
              {
                label: "About",
                value: otherUser.status || "Hey there! I am using ChatApp",
              },
              { label: "Email", value: otherUser.email },
            ].map(({ label, value }) => (
              <div
                key={label}
                style={{
                  background: "#f8f9fa",
                  borderRadius: "14px",
                  padding: "14px 16px",
                  marginBottom: "12px",
                }}
              >
                <div
                  style={{
                    fontSize: "11px",
                    color: "#128C7E",
                    fontWeight: 700,
                    marginBottom: "6px",
                    textTransform: "uppercase",
                    letterSpacing: "0.5px",
                  }}
                >
                  {label}
                </div>
                <div
                  style={{
                    color: "#333",
                    fontSize: "14px",
                    wordBreak: "break-word",
                  }}
                >
                  {value}
                </div>
              </div>
            ))}
            <div style={{ display: "flex", gap: "10px", marginTop: "16px" }}>
              <button
                onClick={() => {
                  handleCall("audio");
                  setShowProfile(false);
                }}
                style={{
                  flex: 1,
                  padding: "13px",
                  background: "#e8f5e9",
                  border: "1px solid #c8e6c9",
                  borderRadius: "14px",
                  color: "#2e7d32",
                  fontWeight: 700,
                  cursor: "pointer",
                  fontSize: "14px",
                }}
              >
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M22 16.92v3a2 2 0 0 1-2.18 2A19.8 19.8 0 0 1 3.1 5.18 2 2 0 0 1 5.1 3h3a2 2 0 0 1 2 1.72c.12.9.33 1.78.62 2.63a2 2 0 0 1-.45 2.11L9 10a16 16 0 0 0 5 5l.54-1.27a2 2 0 0 1 2.11-.45c.85.29 1.73.5 2.63.62A2 2 0 0 1 22 16.92Z" /></svg>
                Voice
              </button>

              <button
                onClick={() => {
                  handleCall("video");
                  setShowProfile(false);
                }}
                style={{
                  flex: 1,
                  padding: "13px",
                  background: "#e3f2fd",
                  border: "1px solid #bbdefb",
                  borderRadius: "14px",
                  color: "#1565c0",
                  fontWeight: 700,
                  cursor: "pointer",
                  fontSize: "14px",
                }}
              >
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="m22 8-6 4 6 4V8Z" /><rect x="2" y="5" width="14" height="14" rx="2" /></svg>
                Video
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ✅ Avatar full screen modal */}
      {showAvatarModal && otherUser.avatar && (
        <div
          onClick={() => setShowAvatarModal(false)}
          style={{
            position: "fixed",
            inset: 0,
            zIndex: 999,
            background: "rgba(0,0,0,0.85)",
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            cursor: "zoom-out",
            animation: "fadeIn 0.2s ease",
          }}
        >
          <style>{`@keyframes fadeIn{from{opacity:0}to{opacity:1}}`}</style>

          {/* Close button */}
          <button
            onClick={() => setShowAvatarModal(false)}
            style={{
              position: "absolute",
              top: "20px",
              right: "20px",
              background: "rgba(255,255,255,0.15)",
              border: "none",
              color: "white",
              fontSize: "20px",
              cursor: "pointer",
              width: "44px",
              height: "44px",
              borderRadius: "50%",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              zIndex: 1000,
            }}
          >
            ✕
          </button>

          {/* Name */}
          <p
            style={{
              color: "white",
              fontSize: "18px",
              fontWeight: 700,
              marginBottom: "16px",
              margin: "0 0 16px",
            }}
          >
            {otherUser.name}
          </p>

          {/* Full size image */}
          <img
            src={otherUser.avatar}
            alt={otherUser.name}
            onClick={(e) => e.stopPropagation()}
            style={{
              width: "280px",
              height: "280px",
              borderRadius: "50%",
              objectFit: "cover",
              border: "4px solid rgba(255,255,255,0.3)",
              boxShadow: "0 8px 40px rgba(0,0,0,0.5)",
              cursor: "default",
              animation: "zoomIn 0.25s ease",
            }}
          />

          {/* Online status */}
          <p
            style={{
              color: isOnline ? "#25D366" : "#aaa",
              fontSize: "14px",
              fontWeight: 600,
              marginTop: "16px",
            }}
          >
            {isOnline ? "🟢 Online now" : "⚪ Offline"}
          </p>

          <style>{`
            @keyframes zoomIn {
              from { transform: scale(0.7); opacity: 0; }
              to   { transform: scale(1);   opacity: 1; }
            }
          `}</style>
        </div>
      )}
    </div>
  );
}
