import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

/**
 * GET /api/auth/callback
 *
 * Supabase redirects here after the user clicks the magic link in their email.
 * Exchanges the code for a session, logs the login in user_logins, then
 * redirects to /chat.
 */
export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get('code');

  if (!code) {
    return NextResponse.redirect(`${origin}/login?error=1`);
  }

  const supabase = await createClient();
  const { data, error } = await supabase.auth.exchangeCodeForSession(code);

  if (error || !data.user) {
    return NextResponse.redirect(`${origin}/login?error=1`);
  }

  const user = data.user;
  const now = new Date().toISOString();

  // Attempt to insert a fresh row; if user_id already exists, update instead.
  const { data: existing } = await supabase
    .from('user_logins')
    .select('login_count')
    .eq('user_id', user.id)
    .maybeSingle();

  if (existing) {
    await supabase
      .from('user_logins')
      .update({
        email: user.email ?? '',
        last_login_at: now,
        login_count: (existing.login_count as number) + 1,
      })
      .eq('user_id', user.id);
  } else {
    await supabase.from('user_logins').insert({
      user_id: user.id,
      email: user.email ?? '',
      last_login_at: now,
      login_count: 1,
    });
  }

  return NextResponse.redirect(`${origin}/chat`);
}
