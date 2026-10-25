import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { v4 as uuidv4 } from 'uuid';

const VALID_TYPES = ['PUBLISH', 'REPUBLISH', 'EXPORT'];

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const eventId = searchParams.get('eventId');
    const db = await createClient();

    const query = db.from('actions').select('*').order('created_at', { ascending: false });
    const { data: rows, error } = eventId ? await query.eq('event_id', eventId) : await query;
    if (error) throw error;

    return NextResponse.json({ actions: rows ?? [] });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { eventId, type, proposedChange, idempotencyKey } = body;

    if (!eventId || !type) {
      return NextResponse.json({ error: 'eventId and type are required.' }, { status: 422 });
    }
    if (!VALID_TYPES.includes(String(type).toUpperCase())) {
      return NextResponse.json({ error: `type must be one of: ${VALID_TYPES.join(', ')}` }, { status: 422 });
    }

    const db = await createClient();
    const { data: event } = await db.from('events').select('id').eq('id', eventId).single();
    if (!event) return NextResponse.json({ error: 'Event not found.' }, { status: 404 });

    const ikey = idempotencyKey || uuidv4();
    const { data: existing } = await db.from('actions').select('*').eq('idempotency_key', ikey).maybeSingle();
    if (existing) return NextResponse.json({ action: existing, idempotent: true });

    const id = uuidv4();
    const now = new Date().toISOString();

    const { data: action, error } = await db.from('actions').insert({
      id,
      event_id: eventId,
      type: String(type).toUpperCase(),
      proposed_change: proposedChange ? JSON.stringify(proposedChange) : null,
      status: 'PENDING_APPROVAL',
      idempotency_key: ikey,
      created_at: now,
    }).select().single();
    if (error) throw error;

    return NextResponse.json({ action }, { status: 201 });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
