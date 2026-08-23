import { useState } from "react";

export default function MessageBubble({ message, isMine, onReply }) {
  const [imgExpanded, setImgExpanded] = useState(false);
  const [showActions, setShowActions] = useState(false);

  const formatTime = (date) =>
    new Date(date).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });

  return (
    <>
      {/* Full screen image viewer */}
      {imgExpanded && (
        <div onClick={() => setImgExpanded(false)} style={{
          position: "fixed", inset: 0, background: "rgba(0,0,0,0.93)",
          zIndex: 1000, display: "flex", alignItems: "center",
          justifyContent: "center", cursor: "zoom-out",
        }}>
          <img src={message.image} alt="full" style={{
            maxWidth: "92vw", maxHeight: "92vh",
            borderRadius: "10px", objectFit: "contain",
          }} />
          <button onClick={() => setImgExpanded(false)} style={{
            position: "absolute", top: "20px", right: "20px",
            background: "rgba(255,255,255,0.15)", border: "none",
            color: "white", fontSize: "20px", cursor: "pointer",
            width: "44px", height: "44px", borderRadius: "50%",
            display: "flex", alignItems: "center", justifyContent: "center",
          }}>✕</button>
        </div>
      )}

      <div style={{
        display: "flex",
        justifyContent: isMine ? "flex-end" : "flex-start",
        marginBottom: "3px", padding: "0 4px",
        position: "relative", alignItems: "flex-end", gap: "6px",
      }}
        onMouseEnter={() => setShowActions(true)}
        onMouseLeave={() => setShowActions(false)}
      >
        {/* ✅ Avatar with profile picture for received messages */}
        {!isMine && (
          <div style={{
            width: "28px", height: "28px", borderRadius: "50%",
            overflow: "hidden",
            background: "linear-gradient(135deg, #128C7E, #075E54)",
            display: "flex", alignItems: "center", justifyContent: "center",
            color: "white", fontSize: "12px", fontWeight: 700,
            flexShrink: 0, marginBottom: "2px",
          }}>
            {message.sender?.avatar ? (
              <img src={message.sender.avatar} alt={message.sender.name}
                style={{ width: "100%", height: "100%", objectFit: "cover" }} />
            ) : (
              message.sender?.name?.[0]?.toUpperCase() || "?"
            )}
          </div>
        )}

        {/* Reply button — my messages */}
        {showActions && !message.deleted && isMine && (
          <button onClick={() => onReply(message)} title="Reply" style={{
            background: "white", border: "1px solid #e0e0e0",
            borderRadius: "50%", width: "28px", height: "28px",
            cursor: "pointer", fontSize: "13px",
            display: "flex", alignItems: "center", justifyContent: "center",
            boxShadow: "0 1px 4px rgba(0,0,0,0.12)",
            flexShrink: 0, order: isMine ? -1 : 1,
          }}>↩</button>
        )}

        {/* Bubble */}
        <div style={{
          maxWidth: "62%",
          background: message.messageType === "sticker"
            ? "transparent"
            : isMine ? "#DCF8C6" : "white",
          borderRadius: isMine ? "18px 4px 18px 18px" : "4px 18px 18px 18px",
          padding: message.messageType === "sticker"
            ? "0"
            : message.image ? "4px 4px 7px" : "9px 14px 7px",
          boxShadow: message.messageType === "sticker"
            ? "none" : "0 1px 4px rgba(0,0,0,0.1)",
          position: "relative",
        }}>
          {message.deleted ? (
            <span style={{ color: "#aaa", fontStyle: "italic", fontSize: "14px" }}>
              🚫 This message was deleted
            </span>
          ) : message.messageType === "audio" && message.audio ? (
            <audio
              controls
              preload="metadata"
              src={message.audio}
              style={{ display: "block", maxWidth: "220px" }}
            />
          ) : message.image ? (
            <img
              src={message.image}
              alt={message.messageType === "sticker" ? "sticker" : "shared"}
              onClick={() => message.messageType !== "sticker" && setImgExpanded(true)}
              style={{
                maxWidth: message.messageType === "sticker" ? "160px" : "240px",
                maxHeight: message.messageType === "sticker" ? "160px" : "200px",
                borderRadius: message.messageType === "sticker" ? "0" : "12px",
                display: "block",
                cursor: message.messageType === "sticker" ? "default" : "zoom-in",
                objectFit: message.messageType === "sticker" ? "contain" : "cover",
                background: "transparent",
              }}
            />
          ) : (
            <p style={{
              margin: 0, fontSize: "14.5px",
              lineHeight: "1.45", wordBreak: "break-word", color: "#111",
            }}>
              {message.text}
            </p>
          )}

          {/* Time + ticks — hide for stickers */}
          {message.messageType !== "sticker" && message.messageType !== "audio" && (
            <div style={{
              display: "flex", alignItems: "center",
              justifyContent: "flex-end", gap: "3px",
              marginTop: "4px", paddingRight: message.image ? "6px" : "0",
            }}>
              <span style={{ fontSize: "11px", color: "#999" }}>
                {formatTime(message.createdAt)}
              </span>
              {isMine && (
                <span style={{
                  fontSize: "13px", fontWeight: 700,
                  color: message.seen?.length > 1 ? "#34B7F1" : "#aaa",
                }}>
                  {message.seen?.length > 1 ? "✓✓" : "✓"}
                </span>
              )}
            </div>
          )}
        </div>

        {/* Reply button — received messages */}
        {showActions && !message.deleted && !isMine && (
          <button onClick={() => onReply(message)} title="Reply" style={{
            background: "white", border: "1px solid #e0e0e0",
            borderRadius: "50%", width: "28px", height: "28px",
            cursor: "pointer", fontSize: "13px",
            display: "flex", alignItems: "center", justifyContent: "center",
            boxShadow: "0 1px 4px rgba(0,0,0,0.12)", flexShrink: 0,
          }}>↩</button>
        )}
      </div>
    </>
  );
}