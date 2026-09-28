import { useState } from 'react';
import { mediaUrl } from '../../lib/api';

const GRADIENTS = [
  'linear-gradient(135deg,#6366f1,#8b5cf6)',
  'linear-gradient(135deg,#0ea5e9,#6366f1)',
  'linear-gradient(135deg,#ec4899,#8b5cf6)',
  'linear-gradient(135deg,#f59e0b,#ef4444)',
  'linear-gradient(135deg,#10b981,#0ea5e9)',
  'linear-gradient(135deg,#f43f5e,#f97316)',
  'linear-gradient(135deg,#14b8a6,#22c55e)',
  'linear-gradient(135deg,#a855f7,#ec4899)'
];

const hash = (value = '') => [...String(value)].reduce((h, c) => (h * 31 + c.charCodeAt(0)) >>> 0, 7);

const initials = (name = '') =>
  name.trim().split(/\s+/).slice(0, 2).map(part => [...part][0] || '').join('').toUpperCase() || '?';

export default function Avatar({ user, name, src, size = 44, online = false, className = '', onClick, ring = false }) {
  const [failedUrl, setFailedUrl] = useState(null);
  const label = name ?? user?.name ?? '';
  const url = src ?? user?.avatar;
  const showImage = url && failedUrl !== url;
  const Tag = onClick ? 'button' : 'span';

  return (
    <Tag
      type={onClick ? 'button' : undefined}
      className={`avatar${ring ? ' avatar-ring' : ''} ${className}`}
      style={{ '--size': `${size}px` }}
      onClick={onClick}
      aria-label={onClick ? label : undefined}
    >
      {showImage ? (
        <img src={mediaUrl(url)} alt="" loading="lazy" draggable="false" onError={() => setFailedUrl(url)} />
      ) : (
        <span className="avatar-fallback" style={{ background: GRADIENTS[hash(user?._id || label) % GRADIENTS.length] }}>
          {initials(label)}
        </span>
      )}
      {online && <span className="avatar-online" aria-label="online" />}
    </Tag>
  );
}
