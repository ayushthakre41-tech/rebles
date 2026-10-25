import { NextRequest, NextResponse } from 'next/server';
import { createHash } from 'crypto';
import { createClient } from '@/lib/supabase/server';
import { validateEventInput } from '@/lib/validation';
import { getSessionUser } from '@/lib/auth';

type Params = { params: Promise<{ id: string }> };

function hashSecret(secret: string): string {
  return createHash('sha256').update(secret).digest('hex');
}

function checkSecret(req: NextRequest, event: Record<string, unknown>): NextResponse | null {
  const provided = req.headers.get('x-event-secret') ?? '';
  const stored = event.event_secret_hash as string | null;
  if (!stored || hashSecret(provided) !== stored) {
    return NextResponse.json(
      { error: 'Invalid event secret. Only the event creator can perform this action.' },
      { status: 403 }
    );
  }
  return null;
}

function checkOwnership(event: Record<string, unknown>, userId: string | null, isOwner: boolean): NextResponse | null {
  if (isOwner) return null;
  const eventUserId = event.user_id as string | null;
  if (eventUserId && eventUserId !== userId) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }
  return null;
}

export async function GET(req: NextRequest, { params }: Params) {
  try {
    const { id } = await params;
    const { userId, isOwner } = await getSessionUser(req);
    if (!isOwner && !userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const db = await createClient();
    const { data: event, error: evErr } = await db.from('events').select('*').eq('id', id).single();
    if (evErr || !event) return NextResponse.json({ error: 'Event not found' }, { status: 404 });

    const ownershipErr = checkOwnership(event, userId, isOwner);
    if (ownershipErr) return ownershipErr;

    const [{ data: registrations }, { data: actions }, { data: verifications }, { data: evidence }] =
      await Promise.all([
        db.from('registrations').select('*').eq('event_id', id).order('created_at', { ascending: true }),
        db.from('actions').select('*').eq('event_id', id).order('created_at', { ascending: false }),
        db.from('verifications').select('*, actions!inner(event_id)').eq('actions.event_id', id).order('checked_at', { ascending: false }),
        db.from('evidence').select('*').eq('record_id', id).order('retrieved_at', { ascending: false }),
      ]);

    // Strip the joined actions column from verifications
    const cleanVerifications = (verifications ?? []).map(({ actions: _a, ...v }) => v);

    return NextResponse.json({ event, registrations: registrations ?? [], actions: actions ?? [], verifications: cleanVerifications, evidence: evidence ?? [] });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

export async function PUT(req: NextRequest, { params }: Params) {
  try {
    const { id } = await params;
    const { userId, isOwner } = await getSessionUser(req);
    if (!isOwner && !userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const db = await createClient();
    const { data: event, error: evErr } = await db.from('events').select('*').eq('id', id).single();
    if (evErr || !event) return NextResponse.json({ error: 'Event not found' }, { status: 404 });

    const ownershipErr = checkOwnership(event, userId, isOwner);
    if (ownershipErr) return ownershipErr;

    const secretErr = checkSecret(req, event);
    if (secretErr) return secretErr;

    const body = await req.json();
    const validation = validateEventInput({ ...event, ...body });
    if (!validation.valid) {
      return NextResponse.json({ error: 'Validation failed', fields: validation.errors }, { status: 422 });
    }

    const { data: updated, error: upErr } = await db.from('events').update({
      title: body.title?.trim() ?? event.title,
      date: body.date ?? event.date,
      time: body.time ?? event.time,
      venue: body.venue?.trim() ?? event.venue,
      description: body.description?.trim() ?? event.description,
      capacity: body.capacity != null ? Number(body.capacity) : event.capacity,
      ticket_rules: body.ticket_rules ? String(body.ticket_rules).toUpperCase() : event.ticket_rules,
    }).eq('id', id).select().single();
    if (upErr) throw upErr;

    return NextResponse.json({ event: updated });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest, { params }: Params) {
  try {
    const { id } = await params;
    const { userId, isOwner } = await getSessionUser(req);
    if (!isOwner && !userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const db = await createClient();
    const { data: event, error: evErr } = await db.from('events').select('*').eq('id', id).single();
    if (evErr || !event) return NextResponse.json({ error: 'Event not found' }, { status: 404 });

    const ownershipErr = checkOwnership(event, userId, isOwner);
    if (ownershipErr) return ownershipErr;

    const secretErr = checkSecret(req, event);
    if (secretErr) return secretErr;

    if (event.status !== 'PUBLISHED') {
      return NextResponse.json({ error: 'Only PUBLISHED events can be deleted.' }, { status: 422 });
    }

    const { data: verified } = await db
      .from('verifications')
      .select('verifications.id')
      .eq('result', 'VERIFIED')
      .eq('actions.event_id', id)
      .limit(1)
      .single();

    if (!verified) {
      return NextResponse.json({ error: 'Event must have at least one VERIFIED action before it can be deleted.' }, { status: 422 });
    }

    // Cascade delete
    const { data: regRows } = await db.from('registrations').select('id').eq('event_id', id);
    const regIds = (regRows ?? []).map((r: { id: string }) => r.id);
    if (regIds.length > 0) await db.from('decisions').delete().in('registration_id', regIds);
    await db.from('registrations').delete().eq('event_id', id);

    const { data: actRows } = await db.from('actions').select('id').eq('event_id', id);
    const actIds = (actRows ?? []).map((a: { id: string }) => a.id);
    if (actIds.length > 0) await db.from('verifications').delete().in('action_id', actIds);
    await db.from('actions').delete().eq('event_id', id);

    await db.from('evidence').delete().eq('record_id', id);
    await db.from('events').delete().eq('id', id);

    return NextResponse.json({ deleted: true });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
