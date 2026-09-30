import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import basicSsl from '@vitejs/plugin-basic-ssl'

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  const backend = env.VITE_API_URL || 'http://127.0.0.1:5000';
  // `npm run dev:https`: self-signed HTTPS so phones on the same Wi-Fi can use the
  // camera and microphone (browsers block them on plain http:// except localhost).
  const https = mode === 'https' || env.VITE_DEV_HTTPS === '1';

  return {
    plugins: [react(), ...(https ? [basicSsl()] : [])],
    server: {
      // Reachable from phones on the same Wi-Fi (http://<your-ip>:5173).
      host: true,
      proxy: {
        '/api': { target: backend, changeOrigin: true },
        '/socket.io': { target: backend, changeOrigin: true, ws: true }
      }
    },
    build: {
      rollupOptions: {
        output: {
          manualChunks: {
            agora: ['agora-rtc-sdk-ng'],
            vendor: ['react', 'react-dom', 'react-router-dom', 'axios', 'socket.io-client']
          }
        }
      }
    }
  };
})
