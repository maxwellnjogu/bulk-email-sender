import { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { Mail, Eye, EyeOff, UserPlus } from 'lucide-react';
import { register as apiRegister } from '../api';
import { useAuth } from '../contexts/AuthContext';
import { useToast } from '../contexts/ToastContext';

export default function Register() {
  const [form, setForm] = useState({ username: '', email: '', password: '', confirm: '' });
  const [showPw, setShowPw] = useState(false);
  const [loading, setLoading] = useState(false);
  const { loginWithTokens } = useAuth();
  const toast = useToast();
  const navigate = useNavigate();

  const set = (field) => (e) => setForm((f) => ({ ...f, [field]: e.target.value }));

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (form.password !== form.confirm) {
      toast.error('Passwords do not match.');
      return;
    }
    setLoading(true);
    try {
      const { data } = await apiRegister(form.username, form.email, form.password);
      loginWithTokens(data.access, data.refresh, data.username);
      toast.success('Account created! Welcome 🎉');
      navigate('/');
    } catch (err) {
      const errors = err.response?.data;
      if (errors) {
        // Show first validation error found
        const first = Object.values(errors).flat()[0];
        toast.error(typeof first === 'string' ? first : 'Registration failed.');
      } else {
        toast.error('Registration failed. Please try again.');
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="login-page">
      {/* Background orbs */}
      <div className="login-bg-orb" style={{
        width: 400, height: 400, top: -100, left: -100,
        background: 'radial-gradient(circle, rgba(124,58,237,0.3), transparent)'
      }} />
      <div className="login-bg-orb" style={{
        width: 300, height: 300, bottom: -80, right: -80,
        background: 'radial-gradient(circle, rgba(59,130,246,0.2), transparent)'
      }} />

      <div className="login-card animate-slide-up">
        <div className="login-logo">
          <div className="login-logo-icon">
            <Mail size={22} color="white" />
          </div>
          <span className="login-logo-text">MailFlow</span>
        </div>

        <div className="login-title">Create your account</div>
        <div className="login-subtitle">Start sending campaigns in minutes</div>

        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div className="form-group">
            <label className="form-label">Username</label>
            <input
              id="reg-username"
              className="form-input"
              placeholder="Choose a username"
              value={form.username}
              onChange={set('username')}
              autoComplete="username"
              required
            />
          </div>

          <div className="form-group">
            <label className="form-label">Email</label>
            <input
              id="reg-email"
              type="email"
              className="form-input"
              placeholder="you@example.com"
              value={form.email}
              onChange={set('email')}
              autoComplete="email"
              required
            />
          </div>

          <div className="form-group">
            <label className="form-label">Password</label>
            <div style={{ position: 'relative' }}>
              <input
                id="reg-password"
                type={showPw ? 'text' : 'password'}
                className="form-input"
                placeholder="At least 8 characters"
                value={form.password}
                onChange={set('password')}
                autoComplete="new-password"
                style={{ paddingRight: 42 }}
                required
                minLength={8}
              />
              <button
                type="button"
                className="btn btn-ghost"
                onClick={() => setShowPw((v) => !v)}
                style={{ position: 'absolute', right: 6, top: '50%', transform: 'translateY(-50%)' }}
              >
                {showPw ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
            </div>
          </div>

          <div className="form-group">
            <label className="form-label">Confirm Password</label>
            <input
              id="reg-confirm"
              type={showPw ? 'text' : 'password'}
              className="form-input"
              placeholder="Repeat your password"
              value={form.confirm}
              onChange={set('confirm')}
              autoComplete="new-password"
              required
            />
          </div>

          <button
            type="submit"
            id="reg-submit"
            className="btn btn-primary btn-lg"
            disabled={loading}
            style={{ width: '100%', justifyContent: 'center', marginTop: 8 }}
          >
            {loading ? <span className="spinner" /> : <UserPlus size={16} />}
            {loading ? 'Creating account…' : 'Create account'}
          </button>
        </form>

        <p style={{ marginTop: 20, textAlign: 'center', fontSize: 13, color: 'var(--text-muted)' }}>
          Already have an account?{' '}
          <Link to="/login" style={{ color: 'var(--accent)', textDecoration: 'none', fontWeight: 600 }}>
            Sign in
          </Link>
        </p>
      </div>
    </div>
  );
}
