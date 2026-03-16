import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import toast from 'react-hot-toast';

export default function Register() {
  const [form, setForm] = useState({ name: '', email: '', password: '' });
  const [loading, setLoading] = useState(false);
  const { register } = useAuth();
  const navigate = useNavigate();

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (form.password.length < 6) return toast.error('Password must be at least 6 characters');
    setLoading(true);
    try {
      await register(form.name, form.email, form.password);
      toast.success('Account created! 🎉');
      navigate('/');
    } catch (err) {
      toast.error(err.response?.data?.message || 'Registration failed');
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
          <p style={{ color: '#888', margin: 0, fontSize: '14px' }}>Create your account</p>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit}>
          {['name', 'email', 'password'].map((field) => (
            <div key={field} style={{ marginBottom: '18px' }}>
              <label style={{
                display: 'block', marginBottom: '7px', color: '#444',
                fontWeight: 600, fontSize: '13px',
                textTransform: 'uppercase', letterSpacing: '0.5px'
              }}>
                {field}
              </label>
              <input
                type={field === 'password' ? 'password' : field === 'email' ? 'email' : 'text'}
                value={form[field]}
                onChange={(e) => setForm({ ...form, [field]: e.target.value })}
                required
                placeholder={
                  field === 'name' ? 'John Doe' :
                  field === 'email' ? 'you@example.com' : '••••••••'
                }
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
          ))}

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
              marginTop: '8px',
              boxShadow: loading ? 'none' : '0 4px 14px rgba(56,142,60,0.35)',
              transition: 'all 0.2s'
            }}
          >
            {loading ? '⏳ Creating...' : 'Create Account →'}
          </button>
        </form>

        <p style={{ textAlign: 'center', marginTop: '22px', color: '#888', fontSize: '14px' }}>
          Already have an account?{' '}
          <Link to="/login" style={{ color: '#2e7d32', fontWeight: 700, textDecoration: 'none' }}>
            Sign In
          </Link>
        </p>
      </div>
    </div>
  );
}