import React, { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useAuth } from '../AuthContext';

export default function RegisterPage() {
  const { register } = useAuth();
  const navigate = useNavigate();
  const [form, setForm] = useState({ email: '', password: '', firstName: '', lastName: '' });
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (form.password.length < 8) {
      setError('Password must be at least 8 characters');
      return;
    }

    setIsLoading(true);
    try {
      await register(form.email, form.password, form.firstName, form.lastName);
      navigate('/dashboard');
    } catch (err: any) {
      setError(err?.error?.message ?? 'Registration failed. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  const set = (field: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm({ ...form, [field]: e.target.value });

  return (
    <div className="auth-container">
      <div className="auth-card">
        <div className="auth-logo">
          <div className="auth-logo-icon">₿</div>
          <div className="auth-logo-text">NexBank</div>
        </div>

        <h1 className="auth-title">Create your account</h1>
        <p className="auth-subtitle">Start managing your finances securely</p>

        <form onSubmit={handleSubmit}>
          {error && (
            <div className="alert alert-error mb-4">
              <span>⚠</span>
              <span>{error}</span>
            </div>
          )}

          <div className="grid-2" style={{ gap: '12px', marginBottom: '0' }}>
            <div className="form-group">
              <label className="form-label" htmlFor="firstName">First name</label>
              <input
                id="firstName"
                type="text"
                className="form-input"
                placeholder="John"
                value={form.firstName}
                onChange={set('firstName')}
                required
                disabled={isLoading}
              />
            </div>
            <div className="form-group">
              <label className="form-label" htmlFor="lastName">Last name</label>
              <input
                id="lastName"
                type="text"
                className="form-input"
                placeholder="Doe"
                value={form.lastName}
                onChange={set('lastName')}
                required
                disabled={isLoading}
              />
            </div>
          </div>

          <div className="form-group">
            <label className="form-label" htmlFor="email">Email address</label>
            <input
              id="email"
              type="email"
              className="form-input"
              placeholder="you@example.com"
              value={form.email}
              onChange={set('email')}
              required
              disabled={isLoading}
            />
          </div>

          <div className="form-group">
            <label className="form-label" htmlFor="password">Password</label>
            <input
              id="password"
              type="password"
              className="form-input"
              placeholder="Min 8 characters"
              value={form.password}
              onChange={set('password')}
              minLength={8}
              required
              disabled={isLoading}
            />
          </div>

          <button
            id="register-submit"
            type="submit"
            className="btn btn-primary btn-lg btn-full mt-4"
            disabled={isLoading}
          >
            {isLoading ? <><div className="spinner" /> Creating account...</> : 'Create account'}
          </button>
        </form>

        <div className="auth-divider">or</div>

        <p style={{ textAlign: 'center', fontSize: '0.875rem', color: 'var(--color-text-muted)' }}>
          Already have an account?{' '}
          <Link to="/login" style={{ color: 'var(--color-primary-hover)' }}>
            Sign in
          </Link>
        </p>
      </div>
    </div>
  );
}
