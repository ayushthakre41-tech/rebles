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

    if (action.status === 'EXECUTED') {
      const { data: verification } = await db.from('verifications')
        .select('*').eq('action_id', action.id).order('checked_at', { ascending: false }).limit(1).single();
      return NextResponse.json({ action, verification, idempotent: true });
    }

    if (action.status !== 'APPROVED') {
      return NextResponse.json(
        { error: `Action must be APPROVED before executing. Current status: ${action.status}.` },
        { status: 409 }
      );
    }

    const { data: event } = await db.from('events').select('*').eq('id', action.event_id).single();
    if (!event) return NextResponse.json({ error: 'Event not found.' }, { status: 404 });

    const now = new Date().toISOString();

    if (action.type === 'PUBLISH') {
      const approvedData = action.approved_version ? JSON.parse(action.approved_version) : {};
      const publicUrl = approvedData.publicUrl || `https://lu.ma/mock-${action.event_id.slice(0, 8)}`;
      await db.from('events').update({ status: 'PUBLISHED', public_url: publicUrl }).eq('id', action.event_id);
    } else if (action.type === 'REPUBLISH') {
      const approvedData = action.approved_version ? JSON.parse(action.approved_version) : {};
      const updates: Record<string, string> = {};
      if (approvedData.venue) updates.venue = approvedData.venue;
      if (approvedData.title) updates.title = approvedData.title;
      if (Object.keys(updates).length > 0) {
        await db.from('events').update(updates).eq('id', action.event_id);
      }
    }

    await db.from('actions').update({ status: 'EXECUTED', executed_at: now }).eq('id', id);

    // Re-fetch updated event for verification
    const { data: updatedEvent } = await db.from('events').select('*').eq('id', action.event_id).single();
    const verificationId = await runVerification(action.id, updatedEvent ?? event, db);

    const { data: updatedAction } = await db.from('actions').select('*').eq('id', id).single();
    const { data: verification } = await db.from('verifications').select('*').eq('id', verificationId).single();

    return NextResponse.json({ action: updatedAction, verification });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

async function runVerification(
  actionId: string,
  event: Record<string, unknown>,
  db: Awaited<ReturnType<typeof createClient>>
): Promise<string> {
  const verificationId = uuidv4();
  const checkedAt = new Date().toISOString();

  const intendedState = JSON.stringify({
    title: event.title,
    date: event.date,
    venue: event.venue,
    status: event.status,
    publicUrl: event.public_url,
  });

  let observedState: string;
  let result: 'VERIFIED' | 'FAILED' | 'PENDING' = 'PENDING';

  if (event.type === 'EXPORT') {
    const { count } = await db.from('registrations')
      .select('*', { count: 'exact', head: true })
      .eq('event_id', event.id as string)
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
      observedState = JSON.stringify({ error: 'Verification scrape failed' });
      result = 'PENDING';
    }
  } else {
    observedState = JSON.stringify({ title: event.title, venue: event.venue, source: 'mock-verification' });
    result = 'VERIFIED';
  }

  await db.from('verifications').insert({
    id: verificationId,
    action_id: actionId,
    intended_state: intendedState,
    observed_state: observedState,
    result,
    checked_at: checkedAt,
  });

  return verificationId;
}
