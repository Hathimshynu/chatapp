import { useEffect, useRef } from 'react';

// Renders an Agora video track. Agora injects its own <video> into this div,
// so it must be a plain container (the old code nested it inside a <video>, which never displays).
export default function VideoTile({ track, mirror = false, fit = 'cover', className = '' }) {
  const ref = useRef(null);

  useEffect(() => {
    if (!track || !ref.current) return;
    track.play(ref.current, { fit, mirror });
    return () => {
      try { track.stop(); } catch { /* track already closed */ }
    };
  }, [track, mirror, fit]);

  return <div ref={ref} className={`video-tile ${className}`} />;
}
