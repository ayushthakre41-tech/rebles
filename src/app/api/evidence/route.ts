import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { scrapeLumaEvent } from '@/lib/scraper';
import { v4 as uuidv4 } from 'uuid';

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const recordId = searchParams.get('recordId');
    const db = await createClient();

    const query = db.from('evidence').select('*').order('retrieved_at', { ascending: false });
    const { data: rows, error } = recordId ? await query.eq('record_id', recordId) : await query.limit(100);
    if (error) throw error;

    return NextResponse.json({ evidence: rows ?? [] });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { eventId } = body;
    if (!eventId) return NextResponse.json({ error: 'eventId required.' }, { status: 422 });

    const db = await createClient();
    const { data: event } = await db.from('events').select('id, public_url, title').eq('id', eventId).single();
    if (!event) return NextResponse.json({ error: 'Event not found.' }, { status: 404 });

    const publicUrl = event.public_url || '';
    const scrapeResult = await scrapeLumaEvent(publicUrl);
    const now = new Date().toISOString();
    const evidenceIds: string[] = [];

    for (const ev of scrapeResult.evidence) {
      const id = uuidv4();
      await db.from('evidence').insert({
        id, record_type: 'event', record_id: eventId,
        field: ev.field, value: ev.value, source_url: ev.sourceUrl,
        source_id: null, retrieved_at: ev.retrievedAt,
      });
      evidenceIds.push(id);
    }

    return NextResponse.json({ scrapeResult: scrapeResult.data, evidenceIds, retrievedAt: now });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
