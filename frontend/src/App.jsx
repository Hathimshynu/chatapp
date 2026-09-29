import { BrowserRouter, Navigate, Route, Routes, useLocation, useSearchParams } from 'react-router-dom';
import { Toaster } from 'react-hot-toast';
import { AuthProvider, useAuth } from './context/AuthContext';
import { ThemeProvider } from './context/ThemeContext';
import { SocketProvider } from './context/SocketContext';
import { ChatProvider } from './context/ChatContext';
import { CallProvider } from './context/CallContext';
import { StatusProvider } from './context/StatusContext';
import { safeNextPath } from './lib/api';
import Login from './pages/Login';
import Register from './pages/Register';
import Home from './pages/Home';
import JoinGroup from './pages/JoinGroup';

// Everything realtime is keyed by account, so switching accounts starts fresh.
function Messenger() {
  const { user } = useAuth();
  return (
    <SocketProvider key={user._id}>
      <ChatProvider>
        <StatusProvider>
          <CallProvider>
            <Home />
          </CallProvider>
        </StatusProvider>
      </ChatProvider>
    </SocketProvider>
  );
}

function PublicOnly({ children }) {
  const { user } = useAuth();
  const [params] = useSearchParams();
  // "?add=1" lets a signed-in user add another account.
  if (user && params.get('add') !== '1') return <Navigate to={safeNextPath(params.get('next'))} replace />;
  return children;
}

// Invite links work for signed-out visitors too: sign in, then come back here.
function RequireAuth({ children }) {
  const { user } = useAuth();
  const location = useLocation();
  if (!user) return <Navigate to={`/login?next=${encodeURIComponent(location.pathname)}`} replace />;
  return children;
}

function AppRoutes() {
  const { user } = useAuth();
  return (
    <Routes>
      <Route path="/login" element={<PublicOnly><Login /></PublicOnly>} />
      <Route path="/register" element={<PublicOnly><Register /></PublicOnly>} />
      <Route path="/join/:code" element={<RequireAuth><JoinGroup /></RequireAuth>} />
      <Route path="/" element={user ? <Messenger /> : <Navigate to="/login" replace />} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}

export default function App() {
  return (
    <ThemeProvider>
      <AuthProvider>
        <BrowserRouter>
          <Toaster
            position="top-center"
            toastOptions={{ duration: 3000, className: 'toast' }}
            containerStyle={{ top: 'calc(env(safe-area-inset-top) + 12px)' }}
          />
          <AppRoutes />
        </BrowserRouter>
      </AuthProvider>
    </ThemeProvider>
  );
}
