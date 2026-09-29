import { useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import toast from 'react-hot-toast';
import { Eye, EyeOff, Lock, Mail, User } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { errorMessage, safeNextPath } from '../lib/api';
import AuthLayout from './AuthLayout';

export default function Register() {
  const [form, setForm] = useState({ name: '', email: '', password: '' });
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const { register } = useAuth();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const adding = params.get('add') === '1';

  const update = (field) => (event) => setForm(f => ({ ...f, [field]: event.target.value }));

  const handleSubmit = async (event) => {
    event.preventDefault();
    if (form.password.length < 6) return toast.error('Password must be at least 6 characters');
    setLoading(true);
    try {
      await register(form.name.trim(), form.email.trim(), form.password);
      toast.success('Account created — welcome to ChatApp!');
      navigate(safeNextPath(params.get('next')), { replace: true });
    } catch (error) {
      toast.error(errorMessage(error, 'Registration failed'));
      setLoading(false);
    }
  };

  const strength = form.password.length === 0 ? 0 : form.password.length < 6 ? 1 : form.password.length < 10 ? 2 : 3;

  return (
    <AuthLayout
      title="Create your account"
      subtitle="It takes less than a minute."
      footer={<>Already have an account? <Link to={adding ? '/login?add=1' : params.get('next') ? `/login?next=${encodeURIComponent(params.get('next'))}` : '/login'}>Sign in</Link></>}
    >
      <form className="auth-form" onSubmit={handleSubmit}>
        <label className="field with-icon">
          <span>Name</span>
          <div className="input-wrap">
            <User size={18} />
            <input value={form.name} onChange={update('name')} required maxLength={50} autoComplete="name" placeholder="How friends will find you" />
          </div>
        </label>
        <label className="field with-icon">
          <span>Email</span>
          <div className="input-wrap">
            <Mail size={18} />
            <input type="email" value={form.email} onChange={update('email')} required autoComplete="email" inputMode="email" placeholder="you@example.com" />
          </div>
        </label>
        <label className="field with-icon">
          <span>Password</span>
          <div className="input-wrap">
            <Lock size={18} />
            <input
              type={showPassword ? 'text' : 'password'}
              value={form.password}
              onChange={update('password')}
              required
              minLength={6}
              autoComplete="new-password"
              placeholder="At least 6 characters"
            />
            <button type="button" className="icon-btn icon-btn-sm" onClick={() => setShowPassword(s => !s)} aria-label={showPassword ? 'Hide password' : 'Show password'}>
              {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
            </button>
          </div>
          <span className={`strength s${strength}`} aria-hidden="true"><i /><i /><i /></span>
        </label>
        <button type="submit" className="btn btn-primary btn-block btn-lg" disabled={loading}>
          {loading ? <span className="spinner spinner-sm spinner-light" /> : 'Create account'}
        </button>
      </form>
    </AuthLayout>
  );
}
