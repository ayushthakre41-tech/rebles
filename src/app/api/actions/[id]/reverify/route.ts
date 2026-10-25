import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { scrapeLumaEvent } from '@/lib/scraper';
import { v4 as uuidv4 } from 'uuid';

type Params = { params: Promise<{ id: string }> };

export async function POST(_req: NextRequest, { params }: Params) {
  try {
    const { id } = await params;
    const db = await createClient();
    const { data: action } = await db.from('actions').select('*').eq('id', id).single();

    if (!action) return NextResponse.json({ error: 'Action not found.' }, { status: 404 });
    if (action.status !== 'EXECUTED') {
      return NextResponse.json({ error: 'Can only re-verify EXECUTED actions.' }, { status: 409 });
    }

    const { data: event } = await db.from('events').select('*').eq('id', action.event_id).single();
    if (!event) return NextResponse.json({ error: 'Event not found.' }, { status: 404 });

    const verificationId = uuidv4();
    const checkedAt = new Date().toISOString();
    const intendedState = JSON.stringify({ title: event.title, date: event.date, venue: event.venue, status: event.status, publicUrl: event.public_url });

    let observedState: string;
    let result: 'VERIFIED' | 'FAILED' | 'PENDING';

    if (action.type === 'EXPORT') {
      const { count } = await db.from('registrations')
        .select('*', { count: 'exact', head: true })
        .eq('event_id', action.event_id)
        .in('status', ['REGISTERED', 'WAITLISTED']);
      observedState = JSON.stringify({ exportedCount: count ?? 0 });
      result = 'VERIFIED';
    } else if (event.public_url && !String(event.public_url).includes('/mock-')) {
      try {
        const scraped = await scrapeLumaEvent(String(event.public_url));
        observedState = JSON.stringify(scraped.data);
        const titleMatch = !scraped.data.title || scraped.data.title === event.title;
        const venueMatch = !scraped.data.venue || scraped.data.venue === event.venue;
        result = scraped.data.source === 'blocked' ? 'PENDING' : (titleMatch && venueMatch ? 'VERIFIED' : 'FAILED');
      } catch {
        observedState = JSON.stringify({ error: 'Scrape failed' });
        result = 'PENDING';
      }
    } else {
      observedState = JSON.stringify({ title: event.title, venue: event.venue, source: 'mock-verification' });
      result = 'VERIFIED';
    }

    await db.from('verifications').insert({
      id: verificationId, action_id: action.id, intended_state: intendedState,
      observed_state: observedState, result, checked_at: checkedAt,
    });

    const { data: verification } = await db.from('verifications').select('*').eq('id', verificationId).single();
    return NextResponse.json({ verification, result });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
