'use client';

import { useState } from 'react';
import { createClient } from '@/lib/supabase/client';

export default function LoginPage() {
  const [email, setEmail] = useState('');
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setLoading(true);

    const supabase = createClient();
    const redirectTo =
      typeof window !== 'undefined'
        ? `${window.location.origin}/api/auth/callback`
        : '/api/auth/callback';

    const { error: authError } = await supabase.auth.signInWithOtp({
      email: email.trim().toLowerCase(),
      options: { emailRedirectTo: redirectTo },
    });

    setLoading(false);

    if (authError) {
      setError(authError.message);
    } else {
      setSubmitted(true);
    }
  }

  return (
    <div
      style={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: 'var(--bg-base)',
        padding: 'var(--space-6)',
      }}
    >
      <div
        className="card"
        style={{
          width: '100%',
          maxWidth: '400px',
          padding: 'var(--space-8)',
        }}
      >
        {/* Logo */}
        <div style={{ textAlign: 'center', marginBottom: 'var(--space-8)' }}>
          <div style={{ fontSize: '40px', marginBottom: 'var(--space-3)' }}>🎫</div>
          <div
            style={{
              fontSize: '20px',
              fontWeight: 700,
              color: 'var(--text-primary)',
              marginBottom: 'var(--space-1)',
            }}
          >
            ERM Agent
          </div>
          <div style={{ fontSize: '13px', color: 'var(--text-muted)' }}>
            Event Registration Manager
          </div>
        </div>

        {submitted ? (
          <div
            className="alert alert-warn"
            style={{ textAlign: 'center', lineHeight: 1.7 }}
          >
            <div style={{ fontSize: '24px', marginBottom: 'var(--space-3)' }}>📬</div>
            <div style={{ fontWeight: 600, marginBottom: 'var(--space-2)', color: 'var(--text-primary)' }}>
              Check your email
            </div>
            <div style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>
              We sent a magic link to <strong>{email}</strong>.
              Click it to sign in — no password needed.
            </div>
          </div>
        ) : (
          <form onSubmit={handleSubmit} noValidate>
            <div className="form-group">
              <label htmlFor="email" className="form-label">
                Email address
              </label>
              <input
                id="email"
                type="email"
                className="form-input"
                placeholder="you@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                autoFocus
                autoComplete="email"
              />
            </div>

            {error && <div className="form-error" style={{ marginBottom: 'var(--space-4)' }}>{error}</div>}

            <button
              type="submit"
              className="btn btn-primary"
              style={{ width: '100%' }}
              disabled={loading || !email.trim()}
            >
              {loading ? (
                <span className="spinner" style={{ width: '16px', height: '16px' }} />
              ) : (
                'Send magic link'
              )}
            </button>

            <p
              style={{
                marginTop: 'var(--space-6)',
                fontSize: '12px',
                color: 'var(--text-muted)',
                textAlign: 'center',
                lineHeight: 1.6,
              }}
            >
              A one-time sign-in link will be emailed to you.
              <br />
              No password required.
            </p>
          </form>
        )}
      </div>
    </div>
  );
}
