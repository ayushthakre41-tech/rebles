'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';

interface Action {
  id: string;
  event_id: string;
  type: string;
  proposed_change: string | null;
  approved_version: string | null;
  status: string;
  idempotency_key: string;
  approved_at: string | null;
  executed_at: string | null;
  created_at: string;
}

function StatusBadge({ status }: { status: string }) {
  return <span className={`badge badge-${status.toLowerCase().replace('_', '-')}`}>{status}</span>;
}

function parseJson(s: string | null) {
  if (!s) return null;
  try { return JSON.parse(s); } catch { return s; }
}

export default function ApprovalsPage() {
  const [actions, setActions] = useState<Action[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  async function load() {
    const res = await fetch('/api/actions');
    const d = await res.json();
    setActions(d.actions || []);
    setLoading(false);
  }

  useEffect(() => { load(); }, []);

  async function act(id: string, endpoint: string) {
    setActionLoading(id);
    await fetch(`/api/actions/${id}/${endpoint}`, { method: 'POST' });
    setActionLoading(null);
    await load();
  }

  const pending = actions.filter((a) => a.status === 'PENDING_APPROVAL');
  const approved = actions.filter((a) => a.status === 'APPROVED');
  const rest = actions.filter((a) => !['PENDING_APPROVAL', 'APPROVED'].includes(a.status));

  if (loading) {
    return (
      <div className="animate-in">
        <div className="page-header"><h1 className="page-title">Approvals</h1></div>
        <div className="loading-bar" />
      </div>
    );
  }

  return (
    <div className="animate-in">
      <div className="page-header">
        <h1 className="page-title">Approval Queue</h1>
        <p className="page-subtitle">
          All actions gated behind human approval (FR-15). Nothing executes without your explicit approval.
        </p>
      </div>

      {pending.length === 0 && approved.length === 0 && (
        <div className="alert alert-info" style={{ marginBottom: 'var(--space-6)' }}>
          ✅ No pending approvals. All clear.
        </div>
      )}

      {/* Pending Approval */}
      {pending.length > 0 && (
        <div className="section">
          <div className="section-title">⏳ Pending Approval</div>
          {pending.map((a) => {
            const proposed = parseJson(a.proposed_change);
            return (
              <div key={a.id} className="card" style={{ marginBottom: 'var(--space-4)', borderColor: 'rgba(251,191,36,0.3)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 'var(--space-4)', flexWrap: 'wrap', gap: 'var(--space-3)' }}>
                  <div>
                    <div style={{ fontWeight: 600, color: 'var(--text-primary)', fontSize: '15px', marginBottom: 'var(--space-1)' }}>
                      {a.type}
                    </div>
                    <div style={{ fontSize: '12.5px', color: 'var(--text-secondary)' }}>
                      Event: <Link href={`/events/${a.event_id}`} style={{ color: 'var(--accent)' }}>{a.event_id.slice(0,12)}…</Link>
                      {' · '} Created {new Date(a.created_at).toLocaleString()}
                    </div>
                  </div>
                  <StatusBadge status={a.status} />
                </div>

                {proposed && (
                  <div style={{ marginBottom: 'var(--space-4)' }}>
                    <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginBottom: 'var(--space-2)', fontWeight: 600 }}>
                      PROPOSED CHANGE (FR-16)
                    </div>
                    {proposed.from && proposed.to ? (
                      <div>
                        <div className="diff-row">
                          <div className="diff-label">Field</div>
                          <div style={{ color: 'var(--text-primary)' }}>{proposed.field}</div>
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

                <div style={{ display: 'flex', gap: 'var(--space-3)' }}>
                  <button
                    id={`approve-${a.id}`}
                    className="btn btn-success"
                    onClick={() => act(a.id, 'approve')}
                    disabled={actionLoading === a.id}
                  >
                    ✅ Approve
                  </button>
                  <button
                    id={`reject-${a.id}`}
                    className="btn btn-danger"
                    onClick={() => act(a.id, 'reject')}
                    disabled={actionLoading === a.id}
                  >
                    ❌ Reject
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Approved — ready to execute */}
      {approved.length > 0 && (
        <div className="section">
          <div className="section-title">✅ Approved — Ready to Execute</div>
          {approved.map((a) => (
            <div key={a.id} className="card" style={{ marginBottom: 'var(--space-4)', borderColor: 'rgba(52,211,153,0.25)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 'var(--space-3)' }}>
                <div>
                  <div style={{ fontWeight: 600, color: 'var(--text-primary)', fontSize: '15px' }}>{a.type}</div>
                  <div style={{ fontSize: '12.5px', color: 'var(--text-secondary)', marginTop: '2px' }}>
                    Event: <Link href={`/events/${a.event_id}`} style={{ color: 'var(--accent)' }}>{a.event_id.slice(0,12)}…</Link>
                    {' · '} Approved {a.approved_at ? new Date(a.approved_at).toLocaleString() : '—'}
                  </div>
                </div>
                <div style={{ display: 'flex', gap: 'var(--space-3)', alignItems: 'center' }}>
                  <StatusBadge status={a.status} />
                  <button
                    id={`execute-${a.id}`}
                    className="btn btn-primary"
                    onClick={() => act(a.id, 'execute')}
                    disabled={actionLoading === a.id}
                  >
                    {actionLoading === a.id ? <span className="spinner" style={{ width: 14, height: 14 }} /> : '▶ Execute'}
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* History */}
      {rest.length > 0 && (
        <div className="section">
          <div className="section-title">📋 History</div>
          <div className="card">
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Type</th>
                    <th>Event</th>
                    <th>Status</th>
                    <th>Approved</th>
                    <th>Executed</th>
                  </tr>
                </thead>
                <tbody>
                  {rest.map((a) => (
                    <tr key={a.id}>
                      <td style={{ fontWeight: 600, color: 'var(--text-primary)' }}>{a.type}</td>
                      <td>
                        <Link href={`/events/${a.event_id}`} style={{ fontSize: '12.5px' }}>
                          {a.event_id.slice(0, 12)}…
                        </Link>
                      </td>
                      <td><StatusBadge status={a.status} /></td>
                      <td style={{ fontSize: '12px' }}>{a.approved_at ? new Date(a.approved_at).toLocaleString() : '—'}</td>
                      <td style={{ fontSize: '12px' }}>{a.executed_at ? new Date(a.executed_at).toLocaleString() : '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
