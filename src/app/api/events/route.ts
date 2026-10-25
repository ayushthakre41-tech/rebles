import { NextRequest, NextResponse } from 'next/server';
import { createHash, randomBytes } from 'crypto';
import { createClient } from '@/lib/supabase/server';
import { validateEventInput } from '@/lib/validation';
import { getSessionUser } from '@/lib/auth';
import { v4 as uuidv4 } from 'uuid';

function hashSecret(secret: string): string {
  return createHash('sha256').update(secret).digest('hex');
}

export async function GET(req: NextRequest) {
  try {
    const { userId, isOwner } = await getSessionUser(req);
    if (!isOwner && !userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const db = await createClient();
    const query = db.from('events').select('*').order('created_at', { ascending: false });
    const { data: events, error } = isOwner ? await query : await query.eq('user_id', userId!);
    if (error) throw error;

    return NextResponse.json({ events: events ?? [] });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const { userId, isOwner } = await getSessionUser(req);
    if (!isOwner && !userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await req.json();
    const validation = validateEventInput(body);
    if (!validation.valid) {
      return NextResponse.json({ error: 'Validation failed', fields: validation.errors }, { status: 422 });
    }

    const db = await createClient();
    const id = uuidv4();
    const now = new Date().toISOString();
    const plainSecret = 'ERM-' + randomBytes(12).toString('hex').toUpperCase();
    const secretHash = hashSecret(plainSecret);
    const effectiveUserId = isOwner ? null : userId;

    const { data: event, error } = await db.from('events').insert({
      id,
      title: body.title.trim(),
      date: body.date,
      time: body.time,
      venue: body.venue.trim(),
      description: body.description?.trim() ?? null,
      capacity: Number(body.capacity),
      ticket_rules: String(body.ticket_rules).toUpperCase(),
      status: 'DRAFT',
      event_secret_hash: secretHash,
      user_id: effectiveUserId,
      created_at: now,
    }).select().single();

    if (error) throw error;

    return NextResponse.json({ event, eventSecret: plainSecret }, { status: 201 });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
