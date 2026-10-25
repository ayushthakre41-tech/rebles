import { createHash } from 'crypto';
import { type NextRequest } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export interface SessionUser {
  userId: string | null;
  isOwner: boolean;
}

/**
 * Returns the authenticated user's ID and whether they are the owner.
 *
 * Owner can be identified two ways:
 *  1. Valid Supabase session whose email matches OWNER_EMAIL.
 *  2. `erm_owner` cookie containing sha256(OWNER_EMAIL + OWNER_BYPASS_SECRET).
 *
 * All other requests must have a valid Supabase session.
 */
export async function getSessionUser(req: NextRequest): Promise<SessionUser> {
  const ownerEmail = process.env.OWNER_EMAIL ?? '';
  const bypassSecret = process.env.OWNER_BYPASS_SECRET ?? '';

  // Check owner bypass cookie
  if (ownerEmail && bypassSecret) {
    const expected = createHash('sha256')
      .update(ownerEmail + bypassSecret)
      .digest('hex');
    const cookie = req.cookies.get('erm_owner')?.value ?? '';
    if (cookie === expected) {
      return { userId: null, isOwner: true };
    }
  }

  // Check Supabase session
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { userId: null, isOwner: false };
  }

  const isOwner = ownerEmail !== '' && user.email === ownerEmail;
  return { userId: user.id, isOwner };
}
