'use client';

import { useEffect, useState, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';

function tryJson(s: string | null | undefined): Record<string, unknown> | null {
  if (!s) return null;
  try { return JSON.parse(s); } catch { return null; }
}

function StateGrid({ raw }: { raw: string | null }) {
  const data = tryJson(raw);
  if (!data) return <span style={{ color: 'var(--text-muted)', fontSize: 12 }}>N/A</span>;
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
      {Object.entries(data).map(([k, v]) => (
        <div key={k} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span style={{ fontSize: '10.5px', fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', minWidth: 60, flexShrink: 0 }}>{k}</span>
          <span style={{ fontSize: '12px', color: 'var(--text-secondary)', background: 'var(--bg-elevated)', borderRadius: 4, padding: '1px 7px', border: '1px solid var(--border)', maxWidth: 160, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={String(v)}>{String(v)}</span>
        </div>
      ))}
    </div>
  );
}

/* ── Types ─────────────────────────────────────────────────────────── */
interface Event {
  id: string; title: string; date: string; time: string; venue: string;
  description: string; capacity: number; ticket_rules: string;
  status: string; public_url: string | null; created_at: string;
}
interface Registration {
  id: string; name: string; email: string; email_normalized: string;
  status: string; created_at: string;
}
interface Action {
  id: string; type: string; proposed_change: string | null;
  approved_version: string | null; status: string; idempotency_key: string;
  approved_at: string | null; executed_at: string | null; created_at: string;
}
interface Verification {
  id: string; action_id: string; intended_state: string;
  observed_state: string | null; result: string; checked_at: string;
}
interface Evidence {
  id: string; field: string; value: string; source_url: string; retrieved_at: string;
}

/* ── Helpers ───────────────────────────────────────────────────────── */
function StatusBadge({ status }: { status: string }) {
  return <span className={`badge badge-${status.toLowerCase().replace('_', '-')}`}>{status}</span>;
}

function parseJson(s: string | null | undefined) {
  if (!s) return null;
  try { return JSON.parse(s); } catch { return s; }
}

/* ── Approval Panel ─────────────────────────────────────────────────── */
function ApprovalPanel({ action, onApprove, onReject, onExecute, loading }:
  { action: Action; onApprove: () => void; onReject: () => void; onExecute: () => void; loading: boolean }) {
  const proposed = parseJson(action.proposed_change);

  return (
    <div className="approval-panel animate-in">
      <div className="approval-panel-header">
        <span className="approval-icon">⚠️</span>
        <div>
          <div style={{ fontWeight: 600, color: 'var(--text-primary)', fontSize: '15px' }}>
            Action Requires Approval
          </div>
          <div style={{ fontSize: '13px', color: 'var(--text-secondary)', marginTop: '2px' }}>
            {action.type} — {action.status} — ID: <code style={{ fontSize: '11.5px' }}>{action.id.slice(0, 12)}…</code>
          </div>
        </div>
      </div>

      {proposed && (
        <div style={{ marginBottom: 'var(--space-4)' }}>
          <div className="section-title" style={{ marginBottom: 'var(--space-3)' }}>Proposed Change</div>
          {proposed.from && proposed.to ? (
            <div>
              <div className="diff-row">
                <div className="diff-label">Field</div>
                <div style={{ color: 'var(--text-primary)' }}>{proposed.field || 'venue'}</div>
              </div>
              <div className="diff-row">
                <div className="diff-label">From</div>
                <div className="diff-from">{proposed.from}</div>
              </div>
              <div className="diff-row">
                <div className="diff-label">To</div>
                <div className="diff-to">{proposed.to}</div>
              </div>
            </div>
          ) : (
            <div className="json-block">{JSON.stringify(proposed, null, 2)}</div>
          )}
        </div>
      )}

      <div style={{ fontSize: '12.5px', color: 'var(--text-muted)', marginBottom: 'var(--space-4)' }}>
        ℹ️ Once approved, the action will be stored as-is. Execution will match the approved version exactly (FR-17).
      </div>

      <div className="approval-actions">
        {action.status === 'PENDING_APPROVAL' && (
          <>
            <button
              id={`approve-action-${action.id}`}
              className="btn btn-success"
              onClick={onApprove}
              disabled={loading}
            >
              ✅ Approve
            </button>
            <button
              id={`reject-action-${action.id}`}
              className="btn btn-danger"
              onClick={onReject}
              disabled={loading}
            >
              ❌ Reject
            </button>
          </>
        )}
        {action.status === 'APPROVED' && (
          <button
            id={`execute-action-${action.id}`}
            className="btn btn-primary"
            onClick={onExecute}
            disabled={loading}
          >
            {loading ? <><span className="spinner" style={{ width: 14, height: 14 }} /> Executing…</> : '▶ Execute'}
          </button>
        )}
        {(action.status === 'EXECUTED' || action.status === 'FAILED') && (
          <span style={{ color: 'var(--text-muted)', fontSize: '13px' }}>
            {action.status === 'EXECUTED' ? '✅ Executed' : '❌ Failed'} at {action.executed_at ? new Date(action.executed_at).toLocaleString() : '—'}
          </span>
        )}
        {action.status === 'REJECTED' && (
          <span style={{ color: 'var(--status-rejected)', fontSize: '13px' }}>❌ This action was REJECTED and will not execute.</span>
        )}
      </div>
    </div>
  );
}

/* ── Add Registration Form ─────────────────────────────────────────── */
function AddRegistrationForm({ eventId, onAdded }: { eventId: string; onAdded: () => void }) {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<{ status: string; reason: string } | null>(null);
  const [error, setError] = useState('');

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setResult(null);
    setError('');

    const res = await fetch('/api/registrations', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ eventId, name, email }),
    });
    const data = await res.json();
    setLoading(false);

    if (!res.ok) { setError(data.error || 'Error'); return; }

    setResult({ status: data.registration.status, reason: data.decision?.reason || '' });
    setName(''); setEmail('');
    onAdded();
  }

  return (
    <form onSubmit={submit} style={{ display: 'flex', gap: 'var(--space-3)', flexWrap: 'wrap', alignItems: 'flex-end' }}>
      <div className="form-group" style={{ flex: '1 1 160px', marginBottom: 0 }}>
        <label className="form-label">Name</label>
        <input id="reg-name" className="form-input" value={name} onChange={(e) => setName(e.target.value)} placeholder="Attendee name" required />
      </div>
      <div className="form-group" style={{ flex: '1 1 200px', marginBottom: 0 }}>
        <label className="form-label">Email</label>
        <input id="reg-email" className="form-input" type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="attendee@example.com" required />
      </div>
      <button id="add-registration-btn" type="submit" className="btn btn-primary" disabled={loading} style={{ flexShrink: 0 }}>
        {loading ? <span className="spinner" style={{ width: 14, height: 14 }} /> : '+ Register'}
      </button>
      {result && (
        <div className="alert alert-info" style={{ width: '100%', marginTop: 'var(--space-2)' }}>
          <StatusBadge status={result.status} /> {result.reason}
        </div>
      )}
      {error && <div className="alert alert-error" style={{ width: '100%' }}>{error}</div>}
    </form>
  );
}

/* ── Main Page ─────────────────────────────────────────────────────── */
export default function EventDetailPage() {
  const { id } = useParams() as { id: string };
  const router = useRouter();
  const [data, setData] = useState<{
    event: Event;
    registrations: Registration[];
    actions: Action[];
    verifications: Verification[];
    evidence: Evidence[];
  } | null>(null);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);
  const [scraping, setScraping] = useState(false);
  const [scrapeResult, setScrapeResult] = useState<Record<string, unknown> | null>(null);
  const [deleteModal, setDeleteModal] = useState(false);
  const [republishModal, setRepublishModal] = useState(false);
  const [eventSecret, setEventSecret] = useState('');
  const [newVenueInput, setNewVenueInput] = useState('');
  const [deleteError, setDeleteError] = useState('');
  const [republishError, setRepublishError] = useState('');

  const load = useCallback(async () => {
    const res = await fetch(`/api/events/${id}`);
    const d = await res.json();
    setData(d);
    setLoading(false);
  }, [id]);

  useEffect(() => { load(); }, [load]);

  async function createAction(type: string, proposedChange?: Record<string, unknown>) {
    setActionLoading(true);
    await fetch('/api/actions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ eventId: id, type, proposedChange }),
    });
    setActionLoading(false);
    await load();
  }

  async function approveAction(actionId: string) {
    setActionLoading(true);
    await fetch(`/api/actions/${actionId}/approve`, { method: 'POST' });
    setActionLoading(false);
    await load();
  }

  async function rejectAction(actionId: string) {
    setActionLoading(true);
    await fetch(`/api/actions/${actionId}/reject`, { method: 'POST' });
    setActionLoading(false);
    await load();
  }

  async function executeAction(actionId: string) {
    setActionLoading(true);
    await fetch(`/api/actions/${actionId}/execute`, { method: 'POST' });
    setActionLoading(false);
    await load();
  }

  async function scrapeEvidence() {
    setScraping(true);
    const res = await fetch('/api/evidence', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ eventId: id }),
    });
    const d = await res.json();
    setScrapeResult(d.scrapeResult);
    setScraping(false);
    await load();
  }

  async function downloadCsv() {
    window.open(`/api/export?eventId=${id}`, '_blank');
  }

  async function reverifyAction(actionId: string) {
    setActionLoading(true);
    await fetch(`/api/actions/${actionId}/reverify`, { method: 'POST' });
    setActionLoading(false);
    await load();
  }

  function openDeleteModal() {
    setEventSecret('');
    setDeleteError('');
    setDeleteModal(true);
  }

  async function confirmDelete() {
    if (!eventSecret.trim()) {
      setDeleteError('Event secret is required.');
      return;
    }
    setActionLoading(true);
    setDeleteError('');
    const res = await fetch(`/api/events/${id}`, {
      method: 'DELETE',
      headers: { 'x-event-secret': eventSecret },
    });
    const json = await res.json();
    setActionLoading(false);
    if (!res.ok) {
      setDeleteError(json.error ?? 'Delete failed.');
      return;
    }
    setDeleteModal(false);
    router.push('/events');
  }

  function openRepublishModal() {
    setEventSecret('');
    setNewVenueInput(data?.event.venue ?? '');
    setRepublishError('');
    setRepublishModal(true);
  }

  async function confirmRepublish() {
    if (!eventSecret.trim()) {
      setRepublishError('Event secret is required.');
      return;
    }
    if (!newVenueInput.trim() || newVenueInput.trim() === data?.event.venue) {
      setRepublishError('Please enter a new venue different from the current one.');
      return;
    }
    setActionLoading(true);
    setRepublishError('');
    // First verify the secret by doing a no-op PUT — reuse the same secret check
    const verifyRes = await fetch(`/api/events/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', 'x-event-secret': eventSecret },
      body: JSON.stringify({}),
    });
    if (!verifyRes.ok) {
      const json = await verifyRes.json();
      setActionLoading(false);
      setRepublishError(json.error ?? 'Invalid secret.');
      return;
    }
    // Secret is valid — create the REPUBLISH action
    await fetch('/api/actions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        eventId: id,
        type: 'REPUBLISH',
        proposedChange: { field: 'venue', from: data?.event.venue, to: newVenueInput.trim(), venue: newVenueInput.trim() },
      }),
    });
    setActionLoading(false);
    setRepublishModal(false);
    await load();
  }

  if (loading || !data) {
    return (
      <div className="animate-in">
        <div className="page-header"><h1 className="page-title">Loading…</h1></div>
        <div className="loading-bar" />
      </div>
    );
  }

  const { event, registrations, actions, verifications, evidence } = data;

  const registered = registrations.filter((r) => r.status === 'REGISTERED').length;
  const waitlisted = registrations.filter((r) => r.status === 'WAITLISTED').length;
  const duplicates = registrations.filter((r) => r.status === 'DUPLICATE').length;
  const uncertain  = registrations.filter((r) => r.status === 'UNCERTAIN').length;

  const pendingActions = actions.filter((a) => ['PENDING_APPROVAL', 'APPROVED'].includes(a.status));
  const pastActions    = actions.filter((a) => !['PENDING_APPROVAL', 'APPROVED'].includes(a.status));

  const latestVerification = verifications[0] ?? null;

  const hasExportApproval = actions.some(
    (a) => a.type === 'EXPORT' && ['APPROVED', 'EXECUTED'].includes(a.status)
  );

  return (
    <div className="animate-in">
      {/* Page Header */}
      <div className="page-header">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 'var(--space-4)' }}>
          <div>
            <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginBottom: 'var(--space-2)' }}>
              <Link href="/events">← Events</Link>
            </div>
            <h1 className="page-title" style={{ fontSize: '22px' }}>{event.title}</h1>
            <div style={{ display: 'flex', gap: 'var(--space-3)', alignItems: 'center', marginTop: 'var(--space-2)', flexWrap: 'wrap' }}>
              <StatusBadge status={event.status} />
              <span style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>
                📅 {event.date} {event.time}
              </span>
              <span style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>
                📍 {event.venue}
              </span>
              <span style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>
                🎟 {event.ticket_rules}
              </span>
            </div>
          </div>
          <div style={{ display: 'flex', gap: 'var(--space-3)', flexWrap: 'wrap' }}>
            {event.status === 'DRAFT' && (
              <button
                id="create-publish-action"
                className="btn btn-primary"
                onClick={() => createAction('PUBLISH', { publicUrl: `https://lu.ma/mock-${id.slice(0,8)}` })}
                disabled={actionLoading}
              >
                🚀 Publish Event
              </button>
            )}
            {event.status === 'PUBLISHED' && (
              <button
                id="create-republish-action"
                className="btn btn-secondary"
                onClick={openRepublishModal}
                disabled={actionLoading}
              >
                ✏️ Edit &amp; Republish
              </button>
            )}
            <button
              id="create-export-action"
              className="btn btn-secondary"
              onClick={() => createAction('EXPORT')}
              disabled={actionLoading}
            >
              📤 Export Attendees
            </button>
            {event.status === 'PUBLISHED' && verifications.some((v) => v.result === 'VERIFIED') && (
              <button
                id="delete-event-btn"
                className="btn btn-danger"
                onClick={openDeleteModal}
                disabled={actionLoading}
              >
                🗑 Delete Event
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Stats */}
      <div className="stats-row">
        <div className="stat-card">
          <div className="stat-label">Registered</div>
          <div className="stat-value" style={{ color: 'var(--status-registered)' }}>{registered}</div>
          <div className="stat-sub">of {event.capacity} capacity</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Waitlisted</div>
          <div className="stat-value" style={{ color: 'var(--status-waitlisted)' }}>{waitlisted}</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Duplicates</div>
          <div className="stat-value" style={{ color: 'var(--status-duplicate)' }}>{duplicates}</div>
          <div className="stat-sub">not counted</div>
        </div>
        {uncertain > 0 && (
          <div className="stat-card" style={{ borderColor: 'rgba(251,191,36,0.3)' }}>
            <div className="stat-label">Uncertain</div>
            <div className="stat-value" style={{ color: 'var(--status-uncertain)' }}>{uncertain}</div>
            <div className="stat-sub">needs review</div>
          </div>
        )}
        {latestVerification && (() => {
          // Find the action that owns this verification so we can reverify
          const ownerAction = pastActions.find((a) => a.status === 'EXECUTED') ?? null;
          return (
            <div className="stat-card" style={latestVerification.result === 'FAILED' ? { borderColor: 'rgba(248,113,113,0.3)' } : undefined}>
              <div className="stat-label">Verification</div>
              <div style={{ marginTop: 'var(--space-2)' }}>
                <StatusBadge status={latestVerification.result} />
              </div>
              <div className="stat-sub">{new Date(latestVerification.checked_at).toLocaleString()}</div>
              {latestVerification.result === 'FAILED' && ownerAction && (
                <button
                  id="reverify-btn"
                  className="btn btn-secondary"
                  style={{ marginTop: 'var(--space-3)', fontSize: '11.5px', padding: '4px 10px' }}
                  onClick={() => reverifyAction(ownerAction.id)}
                  disabled={actionLoading}
                >
                  🔄 Re-verify
                </button>
              )}
            </div>
          );
        })()}
      </div>

      {/* Unresolved items alert (FR-28) */}
      {(uncertain > 0 || verifications.some((v) => v.result !== 'VERIFIED')) && (
        <div className="alert alert-warn" style={{ marginBottom: 'var(--space-6)' }}>
          ⚠️ <strong>Unresolved items:</strong>{' '}
          {uncertain > 0 && `${uncertain} UNCERTAIN registration(s). `}
          {verifications.filter((v) => v.result === 'FAILED').length > 0 &&
            `${verifications.filter((v) => v.result === 'FAILED').length} verification(s) FAILED. `}
          {verifications.filter((v) => v.result === 'PENDING').length > 0 &&
            `${verifications.filter((v) => v.result === 'PENDING').length} verification(s) PENDING. `}
        </div>
      )}

      {/* Pending Actions (approval gate) */}
      {pendingActions.length > 0 && (
        <div className="section">
          <div className="section-title">🔐 Approval Gate</div>
          {pendingActions.map((action) => (
            <div key={action.id} style={{ marginBottom: 'var(--space-4)' }}>
              <ApprovalPanel
                action={action}
                onApprove={() => approveAction(action.id)}
                onReject={() => rejectAction(action.id)}
                onExecute={() => executeAction(action.id)}
                loading={actionLoading}
              />
            </div>
          ))}
        </div>
      )}

      <div className="grid-2" style={{ marginBottom: 'var(--space-6)' }}>
        {/* Registrations */}
        <div className="card">
          <div className="card-header">
            <div>
              <div className="card-title">Registrations</div>
              <div className="card-subtitle">All registration attempts with decision reasoning</div>
            </div>
          </div>

          <div style={{ marginBottom: 'var(--space-5)' }}>
            <AddRegistrationForm eventId={id} onAdded={load} />
          </div>

          {registrations.length === 0 ? (
            <div className="empty-state" style={{ padding: 'var(--space-8)' }}>
              <div className="empty-state-icon">📝</div>
              <div className="empty-state-title">No registrations yet</div>
            </div>
          ) : (
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Name</th>
                    <th>Email</th>
                    <th>Status</th>
                    <th>Time</th>
                  </tr>
                </thead>
                <tbody>
                  {registrations.map((r) => (
                    <tr key={r.id}>
                      <td style={{ color: 'var(--text-primary)' }}>{r.name}</td>
                      <td style={{ fontSize: '12px', fontFamily: 'var(--font-mono)' }}>{r.email}</td>
                      <td><StatusBadge status={r.status} /></td>
                      <td style={{ fontSize: '11.5px' }}>{new Date(r.created_at).toLocaleTimeString()}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {registered + waitlisted > 0 && (
            <div style={{ marginTop: 'var(--space-4)', paddingTop: 'var(--space-4)', borderTop: '1px solid var(--border)' }}>
              <button
                id="download-csv-btn"
                className="btn btn-secondary btn-sm"
                onClick={downloadCsv}
                disabled={!hasExportApproval}
                title={!hasExportApproval ? 'Create and approve an EXPORT action first (FR-15)' : 'Download check-in sheet'}
              >
                📥 Download Check-In Sheet {!hasExportApproval && '(needs export approval)'}
              </button>
            </div>
          )}
        </div>

        {/* Evidence View */}
        <div className="card">
          <div className="card-header">
            <div>
              <div className="card-title">Evidence</div>
              <div className="card-subtitle">Platform data with source URL and timestamp (FR-6)</div>
            </div>
            <button
              id="fetch-evidence-btn"
              className="btn btn-sm btn-secondary"
              onClick={scrapeEvidence}
              disabled={scraping}
            >
              {scraping ? <><span className="spinner" style={{ width: 12, height: 12 }} /> Fetching…</> : '🔍 Fetch'}
            </button>
          </div>

          {scrapeResult && (
            <div className={`alert ${(scrapeResult as { source: string }).source === 'mock' ? 'alert-warn' : 'alert-success'}`} style={{ marginBottom: 'var(--space-4)' }}>
              {(scrapeResult as { source: string }).source === 'mock'
                ? `⚠️ Mock fallback: ${(scrapeResult as { blockReason?: string }).blockReason || 'Platform not accessible'}`
                : '✅ Live data retrieved from platform'}
            </div>
          )}

          {evidence.length === 0 ? (
            <div className="empty-state" style={{ padding: 'var(--space-8)' }}>
              <div className="empty-state-icon">🔎</div>
              <div className="empty-state-title">No evidence collected</div>
              <div className="empty-state-desc">Click Fetch to read from the event platform.</div>
            </div>
          ) : (
            <div>
              {evidence.map((ev) => (
                <div key={ev.id} className="evidence-item">
                  <div className="evidence-field">{ev.field}</div>
                  <div>
                    <div className="evidence-value">{ev.value}</div>
                    <div className="evidence-meta">
                      Source: {ev.source_url} · {new Date(ev.retrieved_at).toLocaleString()}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Verifications */}
      {verifications.length > 0 && (
        <div className="section">
          <div className="section-title">🔬 Verifications (FR-21 to FR-25)</div>
          <div className="card">
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Action ID</th>
                    <th>Result</th>
                    <th>Intended State</th>
                    <th>Observed State</th>
                    <th>Checked At</th>
                  </tr>
                </thead>
                <tbody>
                  {verifications.map((v) => (
                    <tr key={v.id}>
                      <td style={{ fontSize: '11.5px', fontFamily: 'monospace' }}>{v.action_id.slice(0, 12)}…</td>
                      <td><StatusBadge status={v.result} /></td>
                      <td><StateGrid raw={v.intended_state} /></td>
                      <td><StateGrid raw={v.observed_state} /></td>
                      <td style={{ fontSize: '11.5px' }}>{new Date(v.checked_at).toLocaleString()}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* Action History */}
      {pastActions.length > 0 && (
        <div className="section">
          <div className="section-title">📋 Action History</div>
          <div className="card">
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Type</th>
                    <th>Status</th>
                    <th>Idempotency Key</th>
                    <th>Approved</th>
                    <th>Executed</th>
                    <th>Created</th>
                  </tr>
                </thead>
                <tbody>
                  {pastActions.map((a) => (
                    <tr key={a.id}>
                      <td style={{ fontWeight: 600, color: 'var(--text-primary)' }}>{a.type}</td>
                      <td><StatusBadge status={a.status} /></td>
                      <td style={{ fontSize: '11.5px', fontFamily: 'monospace' }}>{a.idempotency_key.slice(0, 24)}…</td>
                      <td style={{ fontSize: '11.5px' }}>{a.approved_at ? new Date(a.approved_at).toLocaleString() : '—'}</td>
                      <td style={{ fontSize: '11.5px' }}>{a.executed_at ? new Date(a.executed_at).toLocaleString() : '—'}</td>
                      <td style={{ fontSize: '11.5px' }}>{new Date(a.created_at).toLocaleString()}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* Public URL */}
      {event.public_url && (
        <div className="section">
          <div className="section-title">🌐 Result View (FR-26)</div>
          <div className="card">
            <div style={{ display: 'flex', gap: 'var(--space-4)', flexWrap: 'wrap', marginBottom: 'var(--space-4)' }}>
              <div>
                <div style={{ fontSize: '11.5px', color: 'var(--text-muted)', marginBottom: 'var(--space-1)' }}>Public URL</div>
                <a href={event.public_url} target="_blank" rel="noreferrer" style={{ fontSize: '13px' }}>
                  {event.public_url}
                </a>
              </div>
            </div>
            <div className="stats-row" style={{ marginBottom: 0 }}>
              <div className="stat-card">
                <div className="stat-label">Registered</div>
                <div className="stat-value" style={{ color: 'var(--status-registered)' }}>{registered}</div>
              </div>
              <div className="stat-card">
                <div className="stat-label">Waitlisted</div>
                <div className="stat-value" style={{ color: 'var(--status-waitlisted)' }}>{waitlisted}</div>
              </div>
              <div className="stat-card">
                <div className="stat-label">Capacity</div>
                <div className="stat-value">{event.capacity}</div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── Delete Confirmation Modal ─────────────────────────────── */}
      {deleteModal && (
        <div className="modal-backdrop" onClick={() => setDeleteModal(false)}>
          <div className="modal-box" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <span className="modal-title">🗑 Delete Event</span>
              <button className="modal-close" onClick={() => setDeleteModal(false)} aria-label="Close">✕</button>
            </div>
            <div className="modal-body">
              <p style={{ marginBottom: 'var(--space-4)', color: 'var(--text-secondary)', fontSize: '14px' }}>
                You are about to permanently delete <strong style={{ color: 'var(--text-primary)' }}>{event.title}</strong>.
                This will remove all registrations, actions, and evidence. This cannot be undone.
              </p>
              <label className="modal-label" htmlFor="delete-secret-input">Event Secret</label>
              <input
                id="delete-secret-input"
                className="modal-input"
                type="password"
                placeholder="Enter your event secret…"
                value={eventSecret}
                onChange={(e) => setEventSecret(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') confirmDelete(); }}
                autoFocus
              />
              {deleteError && (
                <div className="modal-error">{deleteError}</div>
              )}
            </div>
            <div className="modal-footer">
              <button className="btn btn-secondary" onClick={() => setDeleteModal(false)} disabled={actionLoading}>
                Cancel
              </button>
              <button className="btn btn-danger" onClick={confirmDelete} disabled={actionLoading}>
                {actionLoading ? 'Deleting…' : 'Delete permanently'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Edit & Republish Modal ────────────────────────────────── */}
      {republishModal && (
        <div className="modal-backdrop" onClick={() => setRepublishModal(false)}>
          <div className="modal-box" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <span className="modal-title">✏️ Edit &amp; Republish</span>
              <button className="modal-close" onClick={() => setRepublishModal(false)} aria-label="Close">✕</button>
            </div>
            <div className="modal-body">
              <label className="modal-label" htmlFor="new-venue-input">New Venue</label>
              <input
                id="new-venue-input"
                className="modal-input"
                type="text"
                placeholder="Enter new venue…"
                value={newVenueInput}
                onChange={(e) => setNewVenueInput(e.target.value)}
                autoFocus
              />
              <label className="modal-label" htmlFor="republish-secret-input">Event Secret</label>
              <input
                id="republish-secret-input"
                className="modal-input"
                type="password"
                placeholder="Enter your event secret…"
                value={eventSecret}
                onChange={(e) => setEventSecret(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') confirmRepublish(); }}
              />
              {republishError && (
                <div className="modal-error">{republishError}</div>
              )}
            </div>
            <div className="modal-footer">
              <button className="btn btn-secondary" onClick={() => setRepublishModal(false)} disabled={actionLoading}>
                Cancel
              </button>
              <button className="btn btn-primary" onClick={confirmRepublish} disabled={actionLoading}>
                {actionLoading ? 'Submitting…' : 'Submit for approval'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
