import { createHash } from 'crypto';
import { NextResponse } from 'next/server';

/**
 * GET /api/auth/owner-bypass
 *
 * Sets the erm_owner httpOnly cookie, granting permanent owner access
 * without requiring a Supabase login. Visit this URL once in your browser.
 *
 * Security: the cookie value is sha256(OWNER_EMAIL + OWNER_BYPASS_SECRET).
 * Keep OWNER_BYPASS_SECRET private — anyone who knows both env vars can forge the cookie.
 */
export async function GET() {
  const ownerEmail = process.env.OWNER_EMAIL ?? '';
  const bypassSecret = process.env.OWNER_BYPASS_SECRET ?? '';

  if (!ownerEmail || !bypassSecret) {
    return NextResponse.json(
      { error: 'OWNER_EMAIL and OWNER_BYPASS_SECRET must be set in environment.' },
      { status: 500 }
    );
  }

  const cookieValue = createHash('sha256')
    .update(ownerEmail + bypassSecret)
    .digest('hex');

  const res = new NextResponse(null, {
    status: 302,
    headers: { Location: '/chat' },
  });

  res.cookies.set('erm_owner', cookieValue, {
    httpOnly: true,
    path: '/',
    sameSite: 'lax',
    maxAge: 60 * 60 * 24 * 365, // 1 year
  });

  return res;
}
