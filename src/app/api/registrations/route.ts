import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { classifyRegistration, saveDecision, countRegistered } from '@/lib/decisions';
import { normalizeEmail } from '@/lib/validation';
import { v4 as uuidv4 } from 'uuid';

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const eventId = searchParams.get('eventId');
    const db = await createClient();

    const query = db.from('registrations').select('*').order('created_at', { ascending: false });
    const { data: rows, error } = eventId ? await query.eq('event_id', eventId).order('created_at', { ascending: true }) : await query;
    if (error) throw error;

    return NextResponse.json({ registrations: rows ?? [] });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { eventId, name, email } = body;

    if (!eventId || !name || !email) {
      return NextResponse.json({ error: 'eventId, name, and email are required.' }, { status: 422 });
    }

    const db = await createClient();
    const { data: event } = await db.from('events').select('id, capacity').eq('id', eventId).single();
    if (!event) return NextResponse.json({ error: 'Event not found.' }, { status: 404 });

    const emailNormalized = normalizeEmail(email);
    const id = uuidv4();
    const now = new Date().toISOString();

    await db.from('registrations').insert({
      id, event_id: eventId, name: name.trim(), email: email.trim(),
      email_normalized: emailNormalized, status: 'UNCERTAIN', created_at: now,
    });

    const currentRegistered = await countRegistered(eventId);
    const decision = await classifyRegistration({
      registrationId: id, eventId, email: email.trim(), emailNormalized,
      capacity: event.capacity, currentRegisteredCount: currentRegistered,
    });

    await db.from('registrations').update({ status: decision.status }).eq('id', id);
    await saveDecision(id, decision);

    const { data: registration } = await db.from('registrations').select('*').eq('id', id).single();
    const { data: decisionRow } = await db.from('decisions').select('*').eq('registration_id', id).order('created_at', { ascending: false }).limit(1).single();

    return NextResponse.json({ registration, decision: decisionRow }, { status: 201 });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
