import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const eventId = searchParams.get('eventId');

    if (!eventId) return NextResponse.json({ error: 'eventId required.' }, { status: 422 });

    const db = await createClient();

    const { data: exportAction } = await db.from('actions')
      .select('status')
      .eq('event_id', eventId)
      .eq('type', 'EXPORT')
      .in('status', ['APPROVED', 'EXECUTED'])
      .order('created_at', { ascending: false })
      .limit(1).single();

    if (!exportAction) {
      return NextResponse.json(
        { error: 'Export requires an approved EXPORT action. Please create and approve an EXPORT action first.' },
        { status: 403 }
      );
    }

    const { data: registrations } = await db.from('registrations')
      .select('id, name, email, status')
      .eq('event_id', eventId)
      .in('status', ['REGISTERED', 'WAITLISTED'])
      .order('status', { ascending: true })
      .order('created_at', { ascending: true });

    const rows = (registrations ?? []) as { id: string; name: string; email: string; status: string }[];
    const header = 'ID,Name,Email,Status,Checked-In';
    const csvRows = rows.map((r) => `${r.id},${csvEscape(r.name)},${csvEscape(r.email)},${r.status},`);
    const csv = [header, ...csvRows].join('\n');

    return new NextResponse(csv, {
      headers: {
        'Content-Type': 'text/csv',
        'Content-Disposition': `attachment; filename="checkin-${eventId}.csv"`,
      },
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

function csvEscape(value: string): string {
  if (value.includes(',') || value.includes('"') || value.includes('\n')) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}
