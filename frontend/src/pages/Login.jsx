import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import toast from 'react-hot-toast';

export default function Login() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const { login } = useAuth();
  const navigate = useNavigate();

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      await login(email, password);
      toast.success('Welcome back! 👋');
      navigate('/');
    } catch (err) {
      toast.error(err.response?.data?.message || 'Login failed');
    } finally {
      setLoading(false);
    }
  };

  const inputStyle = {
    width: '100%',
    padding: '13px 16px',
    border: '2px solid #c8e6c9',
    borderRadius: '12px',
    fontSize: '15px',
    outline: 'none',
    boxSizing: 'border-box',
    background: '#f1f8f1',
    color: '#222',
    transition: 'border-color 0.2s, background 0.2s'
  };

  return (
    <div style={{
      minHeight: '100vh',
      width: '100vw',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      background: 'linear-gradient(160deg, #e8f5e9 0%, #c8e6c9 50%, #a5d6a7 100%)',
      margin: 0,
      padding: '20px',
      boxSizing: 'border-box'
    }}>

      {/* Decorative circles */}
      <div style={{
        position: 'fixed', top: '-80px', left: '-80px',
        width: '300px', height: '300px', borderRadius: '50%',
        background: 'rgba(56, 142, 60, 0.12)', pointerEvents: 'none'
      }} />
      <div style={{
        position: 'fixed', bottom: '-100px', right: '-60px',
        width: '350px', height: '350px', borderRadius: '50%',
        background: 'rgba(56, 142, 60, 0.10)', pointerEvents: 'none'
      }} />

      {/* Card */}
      <div style={{
        background: 'white',
        borderRadius: '20px',
        padding: '44px 40px',
        width: '100%',
        maxWidth: '420px',
        boxShadow: '0 8px 40px rgba(56, 142, 60, 0.18)',
        position: 'relative',
        zIndex: 1
      }}>

        {/* Logo */}
        <div style={{ textAlign: 'center', marginBottom: '32px' }}>
          <div style={{
            width: '70px', height: '70px', borderRadius: '50%',
            background: 'linear-gradient(135deg, #43a047, #1b5e20)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: '32px', margin: '0 auto 14px',
            boxShadow: '0 4px 16px rgba(56,142,60,0.3)'
          }}>
            💬
          </div>
          <h1 style={{ color: '#2e7d32', margin: '0 0 6px', fontSize: '26px', fontWeight: 700 }}>
            ChatApp
          </h1>
          <p style={{ color: '#888', margin: 0, fontSize: '14px' }}>Sign in to continue</p>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit}>

          {/* Email */}
          <div style={{ marginBottom: '18px' }}>
            <label style={{
              display: 'block', marginBottom: '7px', color: '#444',
              fontWeight: 600, fontSize: '13px',
              textTransform: 'uppercase', letterSpacing: '0.5px'
            }}>
              Email
            </label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              placeholder="you@example.com"
              style={inputStyle}
              onFocus={e => {
                e.target.style.borderColor = '#43a047';
                e.target.style.background = '#e8f5e9';
              }}
              onBlur={e => {
                e.target.style.borderColor = '#c8e6c9';
                e.target.style.background = '#f1f8f1';
              }}
            />
          </div>

          {/* Password */}
          <div style={{ marginBottom: '28px' }}>
            <label style={{
              display: 'block', marginBottom: '7px', color: '#444',
              fontWeight: 600, fontSize: '13px',
              textTransform: 'uppercase', letterSpacing: '0.5px'
            }}>
              Password
            </label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              placeholder="••••••••"
              style={inputStyle}
              onFocus={e => {
                e.target.style.borderColor = '#43a047';
                e.target.style.background = '#e8f5e9';
              }}
              onBlur={e => {
                e.target.style.borderColor = '#c8e6c9';
                e.target.style.background = '#f1f8f1';
              }}
            />
          </div>

          {/* Submit */}
          <button
            type="submit"
            disabled={loading}
            style={{
              width: '100%', padding: '14px',
              background: loading
                ? '#a5d6a7'
                : 'linear-gradient(135deg, #43a047, #2e7d32)',
              color: 'white', border: 'none', borderRadius: '12px',
              fontSize: '16px', fontWeight: 700,
              cursor: loading ? 'not-allowed' : 'pointer',
              boxShadow: loading ? 'none' : '0 4px 14px rgba(56,142,60,0.35)',
              transition: 'all 0.2s'
            }}
          >
            {loading ? '⏳ Signing in...' : 'Sign In →'}
          </button>
        </form>

        <p style={{ textAlign: 'center', marginTop: '22px', color: '#888', fontSize: '14px' }}>
          Don't have an account?{' '}
          <Link to="/register" style={{ color: '#2e7d32', fontWeight: 700, textDecoration: 'none' }}>
            Sign Up
          </Link>
        </p>
      </div>
    </div>
  );
}