import { type NextRequest, NextResponse } from 'next/server';
import { updateSession } from '@/lib/supabase/middleware';

const PUBLIC_PATHS = ['/login', '/api/auth'];

function isPublic(pathname: string): boolean {
  return PUBLIC_PATHS.some((p) => pathname === p || pathname.startsWith(p + '/'));
}

function isStaticAsset(pathname: string): boolean {
  return (
    pathname.startsWith('/_next/') ||
    pathname === '/favicon.ico' ||
    pathname.startsWith('/favicon')
  );
}

async function sha256Hex(input: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(input);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(hashBuffer))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

async function isOwnerBypassed(req: NextRequest): Promise<boolean> {
  const ownerEmail = process.env.OWNER_EMAIL ?? '';
  const bypassSecret = process.env.OWNER_BYPASS_SECRET ?? '';
  if (!ownerEmail || !bypassSecret) return false;

  const expected = await sha256Hex(ownerEmail + bypassSecret);
  const cookie = req.cookies.get('erm_owner')?.value ?? '';
  return cookie === expected;
}

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Always allow static assets and Next.js internals
  if (isStaticAsset(pathname)) {
    return NextResponse.next();
  }

  // Always allow public routes (login page, auth callbacks, owner bypass)
  if (isPublic(pathname)) {
    return NextResponse.next();
  }

  // Owner bypass cookie — no session required
  if (await isOwnerBypassed(request)) {
    return NextResponse.next();
  }

  // Refresh Supabase session cookies and check auth
  const { supabaseResponse, user } = await updateSession(request);

  if (!user) {
    const loginUrl = request.nextUrl.clone();
    loginUrl.pathname = '/login';
    return NextResponse.redirect(loginUrl);
  }

  return supabaseResponse;
}

export const config = {
  matcher: [
    /*
     * Match all request paths except for the ones starting with:
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     */
    '/((?!_next/static|_next/image|favicon.ico).*)',
  ],
};
