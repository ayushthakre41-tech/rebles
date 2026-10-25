-- Supabase Schema for Event Registration Manager (ERM)
-- Run this in the Supabase SQL Editor if you are setting up a fresh project.

-- 1. Events Table
CREATE TABLE IF NOT EXISTS events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL,
  date TEXT NOT NULL,
  time TEXT NOT NULL,
  venue TEXT NOT NULL,
  description TEXT,
  capacity INTEGER NOT NULL DEFAULT 0,
  ticket_rules TEXT NOT NULL DEFAULT 'FREE',
  status TEXT NOT NULL DEFAULT 'DRAFT',
  public_url TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 2. Registrations Table
CREATE TABLE IF NOT EXISTS registrations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id UUID REFERENCES events(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  email TEXT NOT NULL,
  email_normalized TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'UNCERTAIN',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 3. Actions Table
CREATE TABLE IF NOT EXISTS actions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id UUID REFERENCES events(id) ON DELETE CASCADE,
  type TEXT NOT NULL,
  proposed_change TEXT,
  approved_version TEXT,
  status TEXT NOT NULL DEFAULT 'PENDING_APPROVAL',
  idempotency_key TEXT UNIQUE,
  approved_at TIMESTAMPTZ,
  executed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 4. Verifications Table
CREATE TABLE IF NOT EXISTS verifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  action_id UUID REFERENCES actions(id) ON DELETE CASCADE,
  intended_state TEXT,
  observed_state TEXT,
  result TEXT NOT NULL DEFAULT 'PENDING',
  checked_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 5. Decisions Table
CREATE TABLE IF NOT EXISTS decisions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  registration_id UUID REFERENCES registrations(id) ON DELETE CASCADE,
  rule_applied TEXT NOT NULL,
  reason TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 6. Evidence Table
CREATE TABLE IF NOT EXISTS evidence (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  record_id TEXT,
  source_url TEXT,
  raw_data TEXT,
  retrieved_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 7. Test Runs Table
CREATE TABLE IF NOT EXISTS test_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  test_case TEXT NOT NULL,
  input TEXT,
  expected TEXT,
  actual TEXT,
  evidence_ref TEXT,
  passed BOOLEAN DEFAULT false,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Disable Row Level Security (or create public policies) so the app can read/write
ALTER TABLE events ENABLE ROW LEVEL SECURITY;
ALTER TABLE registrations ENABLE ROW LEVEL SECURITY;
ALTER TABLE actions ENABLE ROW LEVEL SECURITY;
ALTER TABLE verifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE decisions ENABLE ROW LEVEL SECURITY;
ALTER TABLE evidence ENABLE ROW LEVEL SECURITY;
ALTER TABLE test_runs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow all operations for authenticated and anon users" ON events FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all operations for authenticated and anon users" ON registrations FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all operations for authenticated and anon users" ON actions FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all operations for authenticated and anon users" ON verifications FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all operations for authenticated and anon users" ON decisions FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all operations for authenticated and anon users" ON evidence FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all operations for authenticated and anon users" ON test_runs FOR ALL USING (true) WITH CHECK (true);
