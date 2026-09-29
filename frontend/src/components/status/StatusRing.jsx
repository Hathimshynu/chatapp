// Segmented ring around an avatar — one arc per status, bright for unseen.
export default function StatusRing({ total, seen = 0, size = 58, children }) {
  const stroke = 3;
  const radius = (size - stroke) / 2;
  const circumference = 2 * Math.PI * radius;
  const gap = total > 1 ? 4 : 0;
  const segment = circumference / Math.max(total, 1);
  return (
    <span className="status-ring" style={{ width: size, height: size }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} aria-hidden="true">
        <defs>
          <linearGradient id="status-ring-gradient" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stopColor="#2f6bff" />
            <stop offset="1" stopColor="#8b3dff" />
          </linearGradient>
        </defs>
        {Array.from({ length: Math.max(total, 1) }).map((_, i) => (
          <circle
            key={i}
            cx={size / 2}
            cy={size / 2}
            r={radius}
            fill="none"
            strokeWidth={stroke}
            strokeLinecap="round"
            className={i < seen ? 'is-seen' : 'is-new'}
            strokeDasharray={`${Math.max(segment - gap, 1)} ${circumference}`}
            strokeDashoffset={-i * segment}
            transform={`rotate(-90 ${size / 2} ${size / 2})`}
          />
        ))}
      </svg>
      <span className="status-ring-inner">{children}</span>
    </span>
  );
}
