import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { Toaster } from 'react-hot-toast';
import { AuthProvider, useAuth } from './context/AuthContext';
import { SocketProvider } from './context/SocketContext';
import { PusherProvider } from './context/PusherContext';
import { CallProvider } from './context/CallContext';
import Login from './pages/Login';
import Register from './pages/Register';
import Home from './pages/Home';

const Spinner = () => (
  <div style={{
    height: '100vh', width: '100vw', display: 'flex',
    flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
    background: 'linear-gradient(135deg, #e8f5e9, #c8e6c9)'
  }}>
    <div style={{ fontSize: '60px', marginBottom: '20px' }}>💬</div>
    <div style={{
      width: '44px', height: '44px',
      border: '4px solid #c8e6c9', borderTop: '4px solid #128C7E',
      borderRadius: '50%', animation: 'spin 0.8s linear infinite'
    }} />
    <p style={{ color: '#128C7E', marginTop: '16px', fontWeight: 700, fontSize: '16px' }}>
      Loading ChatApp...
    </p>
    <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
  </div>
);

const PrivateRoute = ({ children }) => {
  const { user, loading } = useAuth();
  if (loading) return <Spinner />;
  return user ? children : <Navigate to="/login" replace />;
};

const PublicRoute = ({ children }) => {
  const { user, loading } = useAuth();
  if (loading) return <Spinner />;
  return user ? <Navigate to="/" replace /> : children;
};

function AppRoutes() {
  return (
    <Routes>
      <Route path="/login"    element={<PublicRoute><Login /></PublicRoute>} />
      <Route path="/register" element={<PublicRoute><Register /></PublicRoute>} />
      <Route path="/"         element={<PrivateRoute><Home /></PrivateRoute>} />
      <Route path="*"         element={<Navigate to="/" replace />} />
    </Routes>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <SocketProvider>
        <PusherProvider>
          <CallProvider>
            <BrowserRouter>
              <Toaster position="top-center" toastOptions={{ duration: 3000 }} />
              <AppRoutes />
            </BrowserRouter>
          </CallProvider>
        </PusherProvider>
      </SocketProvider>
    </AuthProvider>
  );
}