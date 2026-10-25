'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

interface FormState {
  title: string;
  date: string;
  time: string;
  venue: string;
  description: string;
  capacity: string;
  ticket_rules: string;
}

interface FormErrors {
  [key: string]: string;
}

const TICKET_RULES = ['FREE', 'RSVP', 'INVITE_ONLY'];

export default function NewEventPage() {
  const router = useRouter();
  const [form, setForm] = useState<FormState>({
    title: '',
    date: '',
    time: '18:00',
    venue: '',
    description: '',
    capacity: '50',
    ticket_rules: 'FREE',
  });
  const [errors, setErrors] = useState<FormErrors>({});
  const [submitting, setSubmitting] = useState(false);
  const [serverError, setServerError] = useState('');
  // Once the event is created we store the secret + event id here
  const [created, setCreated] = useState<{ eventId: string; secret: string; title: string } | null>(null);
  const [copied, setCopied] = useState(false);

  function set(field: keyof FormState, value: string) {
    setForm((f) => ({ ...f, [field]: value }));
    setErrors((e) => { const n = { ...e }; delete n[field]; return n; });
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setServerError('');

    try {
      const res = await fetch('/api/events', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...form, capacity: Number(form.capacity) }),
      });

      const data = await res.json();

      if (!res.ok) {
        if (data.fields) {
          setErrors(data.fields);
        } else {
          setServerError(data.error || 'Something went wrong.');
        }
        return;
      }

      // Show the secret reveal screen instead of navigating immediately
      setCreated({ eventId: data.event.id, secret: data.eventSecret, title: data.event.title });
    } catch {
      setServerError('Network error — please try again.');
    } finally {
      setSubmitting(false);
    }
  }

  function copySecret() {
    if (!created) return;
    navigator.clipboard.writeText(created.secret).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }

  // ── Secret reveal screen ─────────────────────────────────────────────
  if (created) {
    return (
      <div className="animate-in">
        <div className="page-header">
          <h1 className="page-title">Event Created 🎉</h1>
          <p className="page-subtitle">Save your event secret — it will never be shown again.</p>
        </div>

        <div className="card" style={{ marginBottom: 'var(--space-6)', borderColor: 'rgba(124,111,247,0.3)' }}>
          <div className="card-header">
            <div>
              <div className="card-title">🔑 Your Event Secret</div>
              <div className="card-subtitle">
                This secret is tied to <strong>{created.title}</strong>. Keep it safe —
                you will need it to edit or delete this event.
              </div>
            </div>
          </div>

          <div style={{
            background: 'var(--bg-elevated)',
            border: '1px solid var(--border-strong)',
            borderRadius: 'var(--radius)',
            padding: 'var(--space-5) var(--space-6)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 'var(--space-4)',
            flexWrap: 'wrap',
          }}>
            <code style={{
              fontFamily: 'JetBrains Mono, monospace',
              fontSize: '15px',
              color: 'var(--accent)',
              letterSpacing: '0.04em',
              wordBreak: 'break-all',
            }}>
              {created.secret}
            </code>
            <button className="btn btn-secondary" onClick={copySecret} style={{ flexShrink: 0 }}>
              {copied ? '✅ Copied!' : '📋 Copy'}
            </button>
          </div>

          <div className="alert alert-warn" style={{ marginTop: 'var(--space-5)' }}>
            ⚠️ <strong>This is the only time you will see this secret.</strong> It is not stored anywhere you can retrieve it.
            If you lose it, you will not be able to edit or delete this event.
          </div>
        </div>

        <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
          <button
            className="btn btn-primary btn-lg"
            onClick={() => router.push(`/events/${created.eventId}`)}
          >
            Go to Event →
          </button>
        </div>
      </div>
    );
  }

  // Minimum date: tomorrow
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  const minDate = tomorrow.toISOString().split('T')[0];

  return (
    <div className="animate-in">
      <div className="page-header">
        <h1 className="page-title">Create New Event</h1>
        <p className="page-subtitle">
          Stage 1 — Collect details. All fields are validated before the agent proceeds.
        </p>
      </div>

      {serverError && (
        <div className="alert alert-error" style={{ marginBottom: 'var(--space-6)' }}>
          ⚠️ {serverError}
        </div>
      )}

      <form onSubmit={handleSubmit} noValidate>
        <div className="card" style={{ marginBottom: 'var(--space-6)' }}>
          <div className="card-header">
            <div>
              <div className="card-title">Event Details</div>
              <div className="card-subtitle">Core information for the event page (FR-1)</div>
            </div>
          </div>

          <div className="form-group">
            <label className="form-label" htmlFor="title">
              Event Title <span className="required">*</span>
            </label>
            <input
              id="title"
              className={`form-input${errors.title ? ' error' : ''}`}
              type="text"
              placeholder="e.g. Community Tech Meetup — November 2026"
              value={form.title}
              onChange={(e) => set('title', e.target.value)}
              maxLength={200}
            />
            {errors.title && <span className="form-error">{errors.title}</span>}
          </div>

          <div className="form-row">
            <div className="form-group">
              <label className="form-label" htmlFor="date">
                Date <span className="required">*</span>
              </label>
              <input
                id="date"
                className={`form-input${errors.date ? ' error' : ''}`}
                type="date"
                min={minDate}
                value={form.date}
                onChange={(e) => set('date', e.target.value)}
              />
              {errors.date && <span className="form-error">{errors.date}</span>}
            </div>

            <div className="form-group">
              <label className="form-label" htmlFor="time">
                Time <span className="required">*</span>
              </label>
              <input
                id="time"
                className={`form-input${errors.time ? ' error' : ''}`}
                type="time"
                value={form.time}
                onChange={(e) => set('time', e.target.value)}
              />
              {errors.time && <span className="form-error">{errors.time}</span>}
            </div>
          </div>

          <div className="form-group">
            <label className="form-label" htmlFor="venue">
              Venue <span className="required">*</span>
            </label>
            <input
              id="venue"
              className={`form-input${errors.venue ? ' error' : ''}`}
              type="text"
              placeholder="e.g. TechHub, Floor 3, 22 Silicon Street"
              value={form.venue}
              onChange={(e) => set('venue', e.target.value)}
            />
            {errors.venue && <span className="form-error">{errors.venue}</span>}
          </div>

          <div className="form-group">
            <label className="form-label" htmlFor="description">Description</label>
            <textarea
              id="description"
              className="form-textarea"
              placeholder="Brief event description shown on the event page…"
              value={form.description}
              onChange={(e) => set('description', e.target.value)}
              rows={3}
            />
          </div>
        </div>

        <div className="card" style={{ marginBottom: 'var(--space-6)' }}>
          <div className="card-header">
            <div>
              <div className="card-title">Capacity &amp; Ticket Rules</div>
              <div className="card-subtitle">Controls waitlist and registration logic (FR-10 to FR-13)</div>
            </div>
          </div>

          <div className="form-row">
            <div className="form-group">
              <label className="form-label" htmlFor="capacity">
                Capacity <span className="required">*</span>
              </label>
              <input
                id="capacity"
                className={`form-input${errors.capacity ? ' error' : ''}`}
                type="number"
                min={1}
                max={10000}
                step={1}
                value={form.capacity}
                onChange={(e) => set('capacity', e.target.value)}
              />
              {errors.capacity && <span className="form-error">{errors.capacity}</span>}
              <span className="form-hint">
                Registrations above this limit are automatically waitlisted.
              </span>
            </div>

            <div className="form-group">
              <label className="form-label" htmlFor="ticket_rules">
                Ticket Rules <span className="required">*</span>
              </label>
              <select
                id="ticket_rules"
                className={`form-select${errors.ticket_rules ? ' error' : ''}`}
                value={form.ticket_rules}
                onChange={(e) => set('ticket_rules', e.target.value)}
              >
                {TICKET_RULES.map((r) => (
                  <option key={r} value={r}>{r}</option>
                ))}
              </select>
              {errors.ticket_rules && <span className="form-error">{errors.ticket_rules}</span>}
            </div>
          </div>
        </div>

        <div style={{ display: 'flex', gap: 'var(--space-3)', justifyContent: 'flex-end' }}>
          <button
            type="submit"
            className="btn btn-primary btn-lg"
            id="create-event-submit"
            disabled={submitting}
          >
            {submitting ? (
              <>
                <span className="spinner" style={{ width: 16, height: 16 }} />
                Creating…
              </>
            ) : (
              <>✨ Create Event</>
            )}
          </button>
        </div>
      </form>
    </div>
  );
}
