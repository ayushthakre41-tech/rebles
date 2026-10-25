/**
 * Database access helper.
 * Re-exports the Supabase server client as the single DB entry point.
 * All API routes import from here.
 */
export { createClient as getDb } from '@/lib/supabase/server';
