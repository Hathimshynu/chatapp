import axios from 'axios';

// In dev, Vite proxies /api and /socket.io to the backend (see vite.config.js),
// so everything is same-origin — this also makes testing from a phone on LAN work.
export const API_URL = import.meta.env.DEV
  ? ''
  : (import.meta.env.VITE_API_URL || '').replace(/\/$/, '');

export const SOCKET_URL = API_URL || undefined;

axios.defaults.baseURL = API_URL;

export const setAuthToken = (token) => {
  if (token) axios.defaults.headers.common.Authorization = `Bearer ${token}`;
  else delete axios.defaults.headers.common.Authorization;
};

// Media is stored on the backend as /api/media/<key>; blob:, data: and https: URLs pass through.
export const mediaUrl = (url) => {
  if (!url) return '';
  return url.startsWith('/api/') ? `${API_URL}${url}` : url;
};

export const errorMessage = (error, fallback = 'Something went wrong') =>
  error?.response?.data?.message || (error?.message === 'Network Error' ? 'No connection. Check your internet.' : fallback);

export const MAX_UPLOAD_BYTES = 15 * 1024 * 1024;

export const uploadMedia = async (blob, { name = '', onProgress } = {}) => {
  if (blob.size > MAX_UPLOAD_BYTES) throw new Error('File is too large (max 15 MB)');
  const { data } = await axios.post('/api/media', blob, {
    headers: {
      'Content-Type': blob.type || 'application/octet-stream',
      'X-File-Name': encodeURIComponent(name || blob.name || 'file')
    },
    transformRequest: [(body) => body],
    onUploadProgress: (event) => {
      if (onProgress && event.total) onProgress(event.loaded / event.total);
    }
  });
  return data;
};
