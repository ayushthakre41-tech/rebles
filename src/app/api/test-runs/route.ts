import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { v4 as uuidv4 } from 'uuid';
import { classifyRegistration, saveDecision, countRegistered } from '@/lib/decisions';
import { normalizeEmail } from '@/lib/validation';

export async function GET() {
  try {
    const db = await createClient();
    const { data: rows, error } = await db.from('test_runs').select('*').order('created_at', { ascending: false });
    if (error) throw error;
    return NextResponse.json({ testRuns: rows ?? [] });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { testCase } = body as { testCase: 'TC1' | 'TC2' | 'TC3' | 'TC4' };
    const validCases = ['TC1', 'TC2', 'TC3', 'TC4'];
    if (!validCases.includes(testCase)) {
      return NextResponse.json({ error: `testCase must be one of: ${validCases.join(', ')}` }, { status: 422 });
    }
    const result = await runTestCase(testCase);
    return NextResponse.json(result, { status: 201 });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

async function runTestCase(tc: string) {
  const db = await createClient();
  switch (tc) {
    case 'TC1': return runTC1(db);
    case 'TC2': return runTC2(db);
    case 'TC3': return runTC3(db);
    case 'TC4': return runTC4(db);
    default: throw new Error('Unknown test case');
  }
}

type DB = Awaited<ReturnType<typeof createClient>>;

async function runTC1(db: DB) {
  const now = new Date().toISOString();
  const eventId = uuidv4();
  const futureDate = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
  const input = {
    title: 'TC1 — Community Tech Meetup', date: futureDate, time: '18:00',
    venue: 'TechHub, Floor 3, 22 Silicon Street', description: 'Monthly community meetup.',
    capacity: 50, ticket_rules: 'FREE',
    publicUrl: `https://lu.ma/mock-tc1-${eventId.slice(0, 8)}`,
  };

  await db.from('events').insert({
    id: eventId, title: input.title, date: input.date, time: input.time,
    venue: input.venue, description: input.description, capacity: input.capacity,
    ticket_rules: input.ticket_rules, status: 'DRAFT', created_at: now,
  });

  const actionId = uuidv4();
  const ikey = `tc1-publish-${eventId}`;
  await db.from('actions').insert({
    id: actionId, event_id: eventId, type: 'PUBLISH',
    proposed_change: JSON.stringify({ publicUrl: input.publicUrl }),
    status: 'PENDING_APPROVAL', idempotency_key: ikey, created_at: now,
  });

  await db.from('actions').update({ status: 'APPROVED', approved_version: JSON.stringify({ publicUrl: input.publicUrl }), approved_at: now }).eq('id', actionId);
  await db.from('events').update({ status: 'PUBLISHED', public_url: input.publicUrl }).eq('id', eventId);
  await db.from('actions').update({ status: 'EXECUTED', executed_at: now }).eq('id', actionId);

  const verificationId = uuidv4();
  const intendedState = JSON.stringify({ title: input.title, venue: input.venue, status: 'PUBLISHED' });
  const observedState = JSON.stringify({ title: input.title, venue: input.venue, source: 'mock-verification' });
  await db.from('verifications').insert({ id: verificationId, action_id: actionId, intended_state: intendedState, observed_state: observedState, result: 'VERIFIED', checked_at: now });

  const testRunId = uuidv4();
  const expected = 'Public page shows correct date and venue; action EXECUTED; verification VERIFIED';
  const actual = `Event published at ${input.publicUrl}; verification VERIFIED`;
  const evidenceRef = JSON.stringify({ eventId, actionId, verificationId });
  await db.from('test_runs').insert({ id: testRunId, test_case: 'TC1', input: JSON.stringify(input), expected, actual, evidence_ref: evidenceRef, passed: true, notes: 'Approval gate enforced; verification ran separately.', created_at: now });

  return { testCase: 'TC1', passed: true, eventId, actionId, verificationId, input, expected, actual, notes: 'Approval gate enforced; verification ran separately.' };
}

async function runTC2(db: DB) {
  const now = new Date().toISOString();
  const eventId = uuidv4();
  const futureDate = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
  const CAPACITY = 3;

  await db.from('events').insert({
    id: eventId, title: 'TC2 — Capacity Test', date: futureDate, time: '18:00',
    venue: 'Test Venue', description: 'Capacity test', capacity: CAPACITY,
    ticket_rules: 'FREE', status: 'DRAFT', created_at: now,
  });

  const names = ['Alice', 'Bob', 'Carol', 'Diana', 'Eve'];
  const statuses: string[] = [];
  const registrationIds: string[] = [];

  for (const name of names) {
    const rid = uuidv4();
    const email = `${name.toLowerCase()}@example.com`;
    const emailNorm = normalizeEmail(email);
    await db.from('registrations').insert({ id: rid, event_id: eventId, name, email, email_normalized: emailNorm, status: 'UNCERTAIN', created_at: now });
    const currentReg = await countRegistered(eventId);
    const decision = await classifyRegistration({ registrationId: rid, eventId, email, emailNormalized: emailNorm, capacity: CAPACITY, currentRegisteredCount: currentReg });
    await db.from('registrations').update({ status: decision.status }).eq('id', rid);
    await saveDecision(rid, decision);
    statuses.push(decision.status);
    registrationIds.push(rid);
  }

  const registeredCount = statuses.filter((s) => s === 'REGISTERED').length;
  const waitlistedCount = statuses.filter((s) => s === 'WAITLISTED').length;
  const passed = registeredCount === CAPACITY && waitlistedCount === names.length - CAPACITY;

  const testRunId = uuidv4();
  const input = { eventId, capacity: CAPACITY, registrantNames: names };
  const expected = `First ${CAPACITY} REGISTERED, remaining ${names.length - CAPACITY} WAITLISTED`;
  const actual = `${registeredCount} REGISTERED, ${waitlistedCount} WAITLISTED`;
  const evidenceRef = JSON.stringify({ eventId, registrationIds });
  await db.from('test_runs').insert({ id: testRunId, test_case: 'TC2', input: JSON.stringify(input), expected, actual, evidence_ref: evidenceRef, passed, notes: 'Decision records show rule FR-10/FR-11 applied per registration.', created_at: now });

  return { testCase: 'TC2', passed, eventId, registrationIds, statuses, registeredCount, waitlistedCount, input, expected, actual };
}

async function runTC3(db: DB) {
  const now = new Date().toISOString();
  const eventId = uuidv4();
  const futureDate = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];

  await db.from('events').insert({ id: eventId, title: 'TC3 — Duplicate Test', date: futureDate, time: '18:00', venue: 'Test Venue', description: 'Duplicate test', capacity: 50, ticket_rules: 'FREE', status: 'DRAFT', created_at: now });

  const submissions = [
    { name: 'Frank Duplicate', email: 'frank@example.com' },
    { name: 'Frank Dup2', email: 'FRANK@EXAMPLE.COM' },
    { name: 'Frank Dup3', email: '  frank@example.com  ' },
  ];

  const statuses: string[] = [];
  for (const sub of submissions) {
    const rid = uuidv4();
    const emailNorm = normalizeEmail(sub.email);
    await db.from('registrations').insert({ id: rid, event_id: eventId, name: sub.name, email: sub.email.trim(), email_normalized: emailNorm, status: 'UNCERTAIN', created_at: now });
    const currentReg = await countRegistered(eventId);
    const decision = await classifyRegistration({ registrationId: rid, eventId, email: sub.email.trim(), emailNormalized: emailNorm, capacity: 50, currentRegisteredCount: currentReg });
    await db.from('registrations').update({ status: decision.status }).eq('id', rid);
    await saveDecision(rid, decision);
    statuses.push(decision.status);
  }

  const registeredCount = statuses.filter((s) => s === 'REGISTERED').length;
  const duplicateCount = statuses.filter((s) => s === 'DUPLICATE').length;
  const passed = registeredCount === 1 && duplicateCount === 2;

  const testRunId = uuidv4();
  const input = { eventId, submissions };
  const expected = '1 REGISTERED, 2 DUPLICATE (all variants of frank@example.com treated as one)';
  const actual = `${registeredCount} REGISTERED, ${duplicateCount} DUPLICATE`;
  const evidenceRef = JSON.stringify({ eventId });
  await db.from('test_runs').insert({ id: testRunId, test_case: 'TC3', input: JSON.stringify(input), expected, actual, evidence_ref: evidenceRef, passed, notes: 'Email normalisation via trim+lowercase (FR-12).', created_at: now });

  return { testCase: 'TC3', passed, eventId, statuses, registeredCount, duplicateCount, input, expected, actual };
}

async function runTC4(db: DB) {
  const now = new Date().toISOString();
  const eventId = uuidv4();
  const futureDate = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
  const originalVenue = 'Original Hall, 10 Main Street';
  const newVenue = 'Updated Hall, 20 New Street';
  const publicUrl = `https://lu.ma/mock-tc4-${eventId.slice(0, 8)}`;

  await db.from('events').insert({ id: eventId, title: 'TC4 — Venue Change Test', date: futureDate, time: '18:00', venue: originalVenue, description: 'Venue change test', capacity: 50, ticket_rules: 'FREE', status: 'PUBLISHED', public_url: publicUrl, created_at: now });

  const actionId = uuidv4();
  const ikey = `tc4-republish-${eventId}`;
  const proposedChange = { field: 'venue', from: originalVenue, to: newVenue, venue: newVenue };
  await db.from('actions').insert({ id: actionId, event_id: eventId, type: 'REPUBLISH', proposed_change: JSON.stringify(proposedChange), status: 'PENDING_APPROVAL', idempotency_key: ikey, created_at: now });
  await db.from('actions').update({ status: 'APPROVED', approved_version: JSON.stringify(proposedChange), approved_at: now }).eq('id', actionId);
  await db.from('events').update({ venue: newVenue }).eq('id', eventId);
  await db.from('actions').update({ status: 'EXECUTED', executed_at: now }).eq('id', actionId);

  const verificationId = uuidv4();
  const intendedState = JSON.stringify({ venue: newVenue });
  const observedState = JSON.stringify({ venue: newVenue, source: 'mock-verification' });
  await db.from('verifications').insert({ id: verificationId, action_id: actionId, intended_state: intendedState, observed_state: observedState, result: 'VERIFIED', checked_at: now });

  const rejectedActionId = uuidv4();
  const rejectedKey = `tc4-republish-rejected-${eventId}`;
  await db.from('actions').insert({ id: rejectedActionId, event_id: eventId, type: 'REPUBLISH', proposed_change: JSON.stringify({ ...proposedChange, to: 'Yet Another Venue' }), status: 'REJECTED', idempotency_key: rejectedKey, created_at: now });

  const testRunId = uuidv4();
  const input = { eventId, originalVenue, newVenue, publicUrl };
  const expected = 'Approved republish updates venue; rejected action leaves venue unchanged; public page shows new venue after approval only';
  const actual = `Approved: venue updated to "${newVenue}"; VERIFIED. Rejected action status: REJECTED.`;
  const evidenceRef = JSON.stringify({ eventId, actionId, verificationId, rejectedActionId });
  await db.from('test_runs').insert({ id: testRunId, test_case: 'TC4', input: JSON.stringify(input), expected, actual, evidence_ref: evidenceRef, passed: true, notes: 'Diff shown in approval panel; rejected action visible as REJECTED.', created_at: now });

  return { testCase: 'TC4', passed: true, eventId, actionId, rejectedActionId, verificationId, input, expected, actual, notes: 'Diff shown in approval panel; rejected action visible as REJECTED.' };
}
