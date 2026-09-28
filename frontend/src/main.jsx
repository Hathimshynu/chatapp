import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './styles/base.css'
import './styles/auth.css'
import './styles/sidebar.css'
import './styles/chat.css'
import './styles/call.css'
import App from './App.jsx'
import { registerServiceWorker, trackViewportHeight } from './lib/pwa'

trackViewportHeight();
registerServiceWorker();

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
  </StrictMode>
)
