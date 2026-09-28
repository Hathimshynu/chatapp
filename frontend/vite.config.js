import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  const backend = env.VITE_API_URL || 'http://127.0.0.1:5000';

  return {
    plugins: [react()],
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
