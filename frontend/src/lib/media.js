export const attachmentKind = (file) => {
  const type = file?.type || '';
  if (type.startsWith('image/') && type !== 'image/svg+xml') return 'image';
  if (type.startsWith('video/')) return 'video';
  if (type.startsWith('audio/')) return 'audio';
  return 'file';
};

const loadImage = (file) => new Promise((resolve, reject) => {
  const url = URL.createObjectURL(file);
  const img = new Image();
  img.onload = () => { URL.revokeObjectURL(url); resolve(img); };
  img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('Could not read image')); };
  img.src = url;
});

// Resize big photos before upload (like WhatsApp) — keeps sends fast on mobile data.
export const compressImage = async (file, { maxSize = 1920, quality = 0.85 } = {}) => {
  if (file.type === 'image/gif') return { blob: file, width: 0, height: 0 };
  let img;
  try {
    img = await loadImage(file);
  } catch {
    return { blob: file, width: 0, height: 0 };
  }
  const { naturalWidth: w, naturalHeight: h } = img;
  const scale = Math.min(1, maxSize / Math.max(w, h));
  if (scale === 1 && file.size < 600 * 1024) return { blob: file, width: w, height: h };

  const canvas = document.createElement('canvas');
  canvas.width = Math.round(w * scale);
  canvas.height = Math.round(h * scale);
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
  const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/jpeg', quality));
  if (!blob || blob.size >= file.size) return { blob: file, width: w, height: h };
  const name = file.name ? file.name.replace(/\.\w+$/, '.jpg') : 'photo.jpg';
  return { blob: new File([blob], name, { type: 'image/jpeg' }), width: canvas.width, height: canvas.height };
};

export const readVideoMeta = (file) => new Promise((resolve) => {
  const url = URL.createObjectURL(file);
  const video = document.createElement('video');
  video.preload = 'metadata';
  video.onloadedmetadata = () => {
    resolve({ duration: Number.isFinite(video.duration) ? video.duration : 0, width: video.videoWidth, height: video.videoHeight });
    URL.revokeObjectURL(url);
  };
  video.onerror = () => { resolve({ duration: 0, width: 0, height: 0 }); URL.revokeObjectURL(url); };
  video.src = url;
});

// Pick a recording format every browser we care about can produce.
export const pickRecorderMimeType = () => {
  if (typeof MediaRecorder === 'undefined') return null;
  const candidates = ['audio/webm;codecs=opus', 'audio/mp4', 'audio/ogg;codecs=opus', 'audio/webm'];
  return candidates.find(type => MediaRecorder.isTypeSupported?.(type)) || '';
};
