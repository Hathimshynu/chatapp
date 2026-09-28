import { useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import toast from 'react-hot-toast';
import { Eye, EyeOff, Lock, Mail } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { errorMessage } from '../lib/api';
import AuthLayout from './AuthLayout';

export default function Login() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const { login } = useAuth();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const adding = params.get('add') === '1';

  const handleSubmit = async (event) => {
    event.preventDefault();
    setLoading(true);
    try {
      const account = await login(email.trim(), password);
      toast.success(`Welcome back, ${account.name.split(' ')[0]}!`);
      navigate('/', { replace: true });
    } catch (error) {
      toast.error(errorMessage(error, 'Login failed'));
      setLoading(false);
    }
  };

  return (
    <AuthLayout
      title="Welcome back"
      subtitle="Sign in to continue to your chats."
      footer={<>New here? <Link to={adding ? '/register?add=1' : '/register'}>Create an account</Link></>}
    >
      <form className="auth-form" onSubmit={handleSubmit}>
        <label className="field with-icon">
          <span>Email</span>
          <div className="input-wrap">
            <Mail size={18} />
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              autoComplete="email"
              inputMode="email"
              placeholder="you@example.com"
            />
          </div>
        </label>
        <label className="field with-icon">
          <span>Password</span>
          <div className="input-wrap">
            <Lock size={18} />
            <input
              type={showPassword ? 'text' : 'password'}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              autoComplete="current-password"
              placeholder="Your password"
            />
            <button type="button" className="icon-btn icon-btn-sm" onClick={() => setShowPassword(s => !s)} aria-label={showPassword ? 'Hide password' : 'Show password'}>
              {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
            </button>
          </div>
        </label>
        <button type="submit" className="btn btn-primary btn-block btn-lg" disabled={loading}>
          {loading ? <span className="spinner spinner-sm spinner-light" /> : 'Sign in'}
        </button>
      </form>
    </AuthLayout>
  );
}
