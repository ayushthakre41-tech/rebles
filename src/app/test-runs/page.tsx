'use client';

import { useEffect, useState } from 'react';

interface TestRun {
  id: string;
  test_case: string;
  input: string;
  expected: string;
  actual: string | null;
  evidence_ref: string | null;
  passed: number | null;
  notes: string | null;
  created_at: string;
}

const TEST_CASES = [
  { id: 'TC1', name: 'Approved Event', description: 'Valid event → organiser approves publish → public page shows correct date and venue.', expected: 'EXECUTED + VERIFIED', emoji: '✅' },
  { id: 'TC2', name: 'Capacity Reached', description: 'Event with capacity N. After N registrations, additional sign-ups become WAITLISTED.', expected: 'N REGISTERED, rest WAITLISTED', emoji: '🚦' },
  { id: 'TC3', name: 'Duplicate Registration Email', description: 'Same email submitted twice (with case/whitespace variants). Counted once.', expected: '1 REGISTERED, 2 DUPLICATE', emoji: '🔁' },
  { id: 'TC4', name: 'Venue Changed', description: 'Published event → venue edited → organiser approves change → public page updated only after approval.', expected: 'Approved: venue updated; Rejected: page unchanged', emoji: '📍' },
];

function InputChip({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ display: 'flex', alignItems: 'flex-start', gap: 'var(--space-2)', marginBottom: 'var(--space-2)' }}>
      <span style={{ fontSize: '11px', fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', minWidth: 90, paddingTop: 3, flexShrink: 0 }}>
        {label.replace(/([A-Z])/g, ' $1').trim()}
      </span>
      <span style={{
        fontSize: '12.5px', color: 'var(--text-primary)', background: 'var(--bg-elevated)',
        border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)',
        padding: '2px 10px', maxWidth: 220, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap'
      }} title={value}>
        {value}
      </span>
    </div>
  );
}

function EvidenceTag({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6, background: 'var(--bg-elevated)', border: '1px solid var(--border)', borderRadius: 'var(--radius-full)', padding: '3px 10px', flexShrink: 0 }}>
      <span style={{ fontSize: '10.5px', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>{label.replace(/([A-Z])/g, ' $1').trim()}</span>
      <span style={{ fontSize: '11px', color: 'var(--accent)', fontFamily: 'monospace' }}>{value}</span>
    </div>
  );
}

export default function TestRunsPage() {
  const [runs, setRuns] = useState<TestRun[]>([]);
  const [loading, setLoading] = useState(true);
  const [running, setRunning] = useState<string | null>(null);

  async function loadRuns() {
    const res = await fetch('/api/test-runs');
    const d = await res.json();
    setRuns(d.testRuns || []);
    setLoading(false);
  }

  useEffect(() => { loadRuns(); }, []);

  async function runTC(tc: string) {
    setRunning(tc);
    await fetch('/api/test-runs', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ testCase: tc }),
    });
    setRunning(null);
    await loadRuns();
  }

  async function runAll() {
    for (const tc of ['TC1', 'TC2', 'TC3', 'TC4']) await runTC(tc);
  }

  if (loading) {
    return (
      <div className="animate-in">
        <div className="page-header"><h1 className="page-title">Test Runs</h1></div>
        <div className="loading-bar" />
      </div>
    );
  }

  const latestRuns = TEST_CASES.map((tc) => {
    const matching = runs.filter((r) => r.test_case === tc.id);
    return { tc, latest: matching[0] ?? null, allRuns: matching };
  });

  return (
    <div className="animate-in">
      <div className="page-header">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 'var(--space-4)' }}>
          <div>
            <h1 className="page-title">Test Runs</h1>
            <p className="page-subtitle">TC1–TC4 · each run stores input, expected, actual, and evidence (PRD §9)</p>
          </div>
          <button id="run-all-tests-btn" className="btn btn-primary" onClick={runAll} disabled={!!running}>
            {running ? <><span className="spinner" style={{ width: 14, height: 14 }} /> Running {running}…</> : '🚀 Run All Test Cases'}
          </button>
        </div>
      </div>

      <div style={{ display: 'grid', gap: 'var(--space-5)' }}>
        {latestRuns.map(({ tc, latest, allRuns }) => {
          const inputData: Record<string, unknown> = latest ? (() => { try { return JSON.parse(latest.input); } catch { return {}; } })() : {};
          const evidenceData: Record<string, unknown> = latest?.evidence_ref ? (() => { try { return JSON.parse(latest.evidence_ref); } catch { return {}; } })() : {};

          return (
            <div key={tc.id} className="card animate-in" style={{ borderColor: latest ? (latest.passed ? 'rgba(52,211,153,0.25)' : 'rgba(248,113,113,0.25)') : 'var(--border)' }}>
              {/* Header */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 'var(--space-3)', marginBottom: 'var(--space-5)' }}>
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)', marginBottom: 'var(--space-2)' }}>
                    <span style={{ fontSize: '20px' }}>{tc.emoji}</span>
                    <span style={{ fontWeight: 700, fontSize: '16px', color: 'var(--text-primary)' }}>{tc.id} — {tc.name}</span>
                    {latest && <span className={`badge ${latest.passed ? 'badge-verified' : 'badge-failed'}`}>{latest.passed ? 'PASS' : 'FAIL'}</span>}
                  </div>
                  <p style={{ fontSize: '13px', color: 'var(--text-secondary)', maxWidth: 580 }}>{tc.description}</p>
                </div>
                <button id={`run-${tc.id.toLowerCase()}-btn`} className="btn btn-secondary" onClick={() => runTC(tc.id)} disabled={!!running}>
                  {running === tc.id ? <><span className="spinner" style={{ width: 12, height: 12 }} /> Running…</> : '▶ Run'}
                </button>
              </div>

              {/* Expected */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)', marginBottom: 'var(--space-5)', padding: 'var(--space-3) var(--space-4)', background: 'var(--accent-dim)', borderRadius: 'var(--radius-sm)', border: '1px solid rgba(124,111,247,0.15)' }}>
                <span style={{ fontSize: '11px', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.07em', flexShrink: 0 }}>Expected</span>
                <span style={{ fontSize: '13px', color: 'var(--accent-hover)', fontWeight: 500 }}>{tc.expected}</span>
              </div>

              {latest ? (
                <div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--space-6)', marginBottom: 'var(--space-4)' }}>
                    {/* Input chips */}
                    <div>
                      <div style={{ fontSize: '11px', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 'var(--space-3)' }}>Input (synthetic)</div>
                      {Object.entries(inputData).map(([k, v]) => (
                        <InputChip key={k} label={k} value={Array.isArray(v) ? (v as string[]).join(', ') : String(v)} />
                      ))}
                    </div>
                    {/* Actual */}
                    <div>
                      <div style={{ fontSize: '11px', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 'var(--space-3)' }}>Actual Result</div>
                      <div style={{ fontSize: '14px', fontWeight: 600, marginBottom: 'var(--space-3)', color: latest.passed ? 'var(--status-verified)' : 'var(--status-failed)' }}>
                        {latest.actual}
                      </div>
                      {latest.notes && (
                        <div style={{ fontSize: '12.5px', color: 'var(--text-secondary)', background: 'var(--bg-elevated)', borderRadius: 'var(--radius-sm)', padding: 'var(--space-2) var(--space-3)', border: '1px solid var(--border)', lineHeight: 1.6 }}>
                          {latest.notes}
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Evidence tags */}
                  {Object.keys(evidenceData).length > 0 && (
                    <div style={{ borderTop: '1px solid var(--border)', paddingTop: 'var(--space-4)' }}>
                      <div style={{ fontSize: '11px', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 'var(--space-2)' }}>Evidence References</div>
                      <div style={{ display: 'flex', gap: 'var(--space-2)', flexWrap: 'wrap' }}>
                        {Object.entries(evidenceData).map(([k, v]) => (
                          <EvidenceTag key={k} label={k} value={typeof v === 'string' ? v.slice(0, 8) + '…' : Array.isArray(v) ? `${(v as unknown[]).length} ids` : String(v)} />
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              ) : (
                <div className="alert alert-info">ℹ️ This test case hasn't been run yet. Click ▶ Run to execute it.</div>
              )}

              {allRuns.length > 0 && (
                <div style={{ marginTop: 'var(--space-4)', paddingTop: 'var(--space-4)', borderTop: '1px solid var(--border)', fontSize: '11.5px', color: 'var(--text-muted)' }}>
                  {allRuns.length} run{allRuns.length !== 1 ? 's' : ''} · Last: {new Date(latest!.created_at).toLocaleString()}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {runs.length > 0 && (
        <div className="section" style={{ marginTop: 'var(--space-8)' }}>
          <div className="section-title">📜 Full Run Log</div>
          <div className="card">
            <div className="table-wrap">
              <table>
                <thead>
                  <tr><th>Case</th><th>Result</th><th>Expected</th><th>Actual</th><th>Notes</th><th>Run At</th></tr>
                </thead>
                <tbody>
                  {runs.map((r) => (
                    <tr key={r.id}>
                      <td style={{ fontWeight: 600, color: 'var(--text-primary)' }}>{r.test_case}</td>
                      <td><span className={`badge ${r.passed ? 'badge-verified' : r.passed === null ? 'badge-pending' : 'badge-failed'}`}>{r.passed ? 'PASS' : r.passed === null ? 'UNKNOWN' : 'FAIL'}</span></td>
                      <td style={{ fontSize: '12.5px', maxWidth: 200 }}>{r.expected}</td>
                      <td style={{ fontSize: '12.5px', maxWidth: 200, color: r.passed ? 'var(--status-verified)' : 'var(--status-failed)' }}>{r.actual ?? '—'}</td>
                      <td style={{ fontSize: '12px', color: 'var(--text-muted)' }}>{r.notes ?? '—'}</td>
                      <td style={{ fontSize: '11.5px' }}>{new Date(r.created_at).toLocaleString()}</td>
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
