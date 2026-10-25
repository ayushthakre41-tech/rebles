/**
 * Decision engine: applies capacity, waitlist, and duplicate logic (FR-9 to FR-14).
 * Uses Supabase Postgres instead of SQLite.
 */

import { createClient } from '@/lib/supabase/server';
import { v4 as uuidv4 } from 'uuid';

export type RegistrationStatus = 'REGISTERED' | 'WAITLISTED' | 'DUPLICATE' | 'UNCERTAIN';

export interface DecisionInput {
  registrationId: string;
  eventId: string;
  email: string;
  emailNormalized: string;
  capacity: number;
  currentRegisteredCount: number;
}

export interface DecisionOutput {
  status: RegistrationStatus;
  ruleApplied: string;
  reason: string;
  inputEvidence: Record<string, unknown>;
}

/**
 * Classify a registration attempt according to PRD rules FR-9 to FR-14.
 */
export async function classifyRegistration(input: DecisionInput): Promise<DecisionOutput> {
  const db = await createClient();

  // FR-12: Duplicate detection — trimmed, case-insensitive email match
  const { data: existingByEmail } = await db
    .from('registrations')
    .select('id, status')
    .eq('event_id', input.eventId)
    .eq('email_normalized', input.emailNormalized)
    .neq('id', input.registrationId)
    .maybeSingle();

  if (existingByEmail) {
    return {
      status: 'DUPLICATE',
      ruleApplied: 'FR-12',
      reason: `Email "${input.emailNormalized}" already registered (registration ${existingByEmail.id}, status: ${existingByEmail.status}). Counted once.`,
      inputEvidence: {
        emailNormalized: input.emailNormalized,
        existingRegistrationId: existingByEmail.id,
        existingStatus: existingByEmail.status,
      },
    };
  }

  // FR-13: UNCERTAIN if capacity is missing/invalid
  if (typeof input.capacity !== 'number' || input.capacity <= 0 || isNaN(input.capacity)) {
    return {
      status: 'UNCERTAIN',
      ruleApplied: 'FR-13',
      reason: 'Capacity is missing or invalid; cannot classify registration.',
      inputEvidence: { capacity: input.capacity },
    };
  }

  // FR-10: REGISTERED if count < capacity
  if (input.currentRegisteredCount < input.capacity) {
    return {
      status: 'REGISTERED',
      ruleApplied: 'FR-10',
      reason: `Capacity ${input.capacity}, current registered ${input.currentRegisteredCount} < capacity. Registration confirmed.`,
      inputEvidence: {
        capacity: input.capacity,
        currentRegisteredCount: input.currentRegisteredCount,
      },
    };
  }

  // FR-11: WAITLISTED if count >= capacity
  return {
    status: 'WAITLISTED',
    ruleApplied: 'FR-11',
    reason: `Capacity ${input.capacity} reached (${input.currentRegisteredCount} registered). Added to waitlist.`,
    inputEvidence: {
      capacity: input.capacity,
      currentRegisteredCount: input.currentRegisteredCount,
    },
  };
}

/**
 * Persist the decision record (FR-14).
 */
export async function saveDecision(registrationId: string, output: DecisionOutput): Promise<string> {
  const db = await createClient();
  const id = uuidv4();
  const now = new Date().toISOString();

  await db.from('decisions').insert({
    id,
    registration_id: registrationId,
    rule_applied: output.ruleApplied,
    input_evidence: JSON.stringify(output.inputEvidence),
    outcome: output.status,
    reason: output.reason,
    created_at: now,
  });

  return id;
}

/**
 * Count current REGISTERED (not duplicate/waitlisted/uncertain) registrations for an event.
 */
export async function countRegistered(eventId: string): Promise<number> {
  const db = await createClient();
  const { count } = await db
    .from('registrations')
    .select('*', { count: 'exact', head: true })
    .eq('event_id', eventId)
    .eq('status', 'REGISTERED');
  return count ?? 0;
}
