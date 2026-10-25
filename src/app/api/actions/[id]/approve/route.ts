import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

type Params = { params: Promise<{ id: string }> };

export async function POST(_req: NextRequest, { params }: Params) {
  try {
    const { id } = await params;
    const db = await createClient();
    const { data: action } = await db.from('actions').select('*').eq('id', id).single();

    if (!action) return NextResponse.json({ error: 'Action not found.' }, { status: 404 });
    if (action.status !== 'PENDING_APPROVAL') {
      return NextResponse.json({ error: `Action is in status ${action.status}, not PENDING_APPROVAL.` }, { status: 409 });
    }

    const now = new Date().toISOString();
    const { data: updated, error } = await db.from('actions')
      .update({ status: 'APPROVED', approved_version: action.proposed_change, approved_at: now })
      .eq('id', id).select().single();
    if (error) throw error;

    return NextResponse.json({ action: updated });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
