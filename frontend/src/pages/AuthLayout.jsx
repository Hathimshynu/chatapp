import { Link, useSearchParams } from 'react-router-dom';
import { ArrowLeft, Lock, Phone, Smartphone, Zap } from 'lucide-react';
import { useAuth } from '../context/AuthContext';

export default function AuthLayout({ title, subtitle, children, footer }) {
  const { user } = useAuth();
  const [params] = useSearchParams();
  const adding = !!user && params.get('add') === '1';

  return (
    <div className="auth">
      <aside className="auth-brand">
        <div className="auth-brand-inner">
          <div className="auth-logo">
            <img src="/favicon.png" alt="" />
            <span>ChatApp</span>
          </div>
          <h1>Stay close to the people who matter.</h1>
          <ul className="auth-points">
            <li><Zap size={18} /> Instant messages with typing & read receipts</li>
            <li><Phone size={18} /> Crystal-clear HD voice and video calls</li>
            <li><Smartphone size={18} /> Install on any phone, tablet or desktop</li>
            <li><Lock size={18} /> Multiple accounts, one app</li>
          </ul>
        </div>
        <span className="auth-glow g1" /><span className="auth-glow g2" />
      </aside>

      <main className="auth-main">
        <div className="auth-card">
          {adding && (
            <Link to="/" className="auth-back"><ArrowLeft size={18} /> Back to chats</Link>
          )}
          <div className="auth-logo is-mobile">
            <img src="/favicon.png" alt="" />
            <span>ChatApp</span>
          </div>
          <h2>{adding ? 'Add another account' : title}</h2>
          <p className="auth-subtitle">{adding ? 'Sign in to switch between accounts instantly.' : subtitle}</p>
          {children}
          {footer && <p className="auth-footer">{footer}</p>}
        </div>
      </main>
    </div>
  );
}
