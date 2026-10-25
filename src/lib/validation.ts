/**
 * Validation helpers for event inputs (FR-3, FR-4).
 */

export interface EventInput {
  title: string;
  date: string;
  time: string;
  venue: string;
  description?: string;
  capacity: number | string;
  ticket_rules: string;
}

export interface ValidationResult {
  valid: boolean;
  errors: Record<string, string>;
}

const VALID_TICKET_RULES = ['FREE', 'PAID', 'RSVP', 'INVITE_ONLY'];

export function validateEventInput(input: Partial<EventInput>): ValidationResult {
  const errors: Record<string, string> = {};

  if (!input.title || String(input.title).trim().length === 0) {
    errors.title = 'Event title is required.';
  }

  if (!input.date || String(input.date).trim().length === 0) {
    errors.date = 'Event date is required.';
  } else {
    const d = new Date(input.date);
    if (isNaN(d.getTime())) {
      errors.date = 'Event date is not a valid date.';
    } else if (d < new Date()) {
      errors.date = 'Event date must be in the future.';
    }
  }

  if (!input.time || String(input.time).trim().length === 0) {
    errors.time = 'Event time is required.';
  }

  if (!input.venue || String(input.venue).trim().length === 0) {
    errors.venue = 'Venue is required.';
  }

  const cap = Number(input.capacity);
  if (!input.capacity && input.capacity !== 0) {
    errors.capacity = 'Capacity is required.';
  } else if (isNaN(cap) || !Number.isInteger(cap) || cap <= 0) {
    errors.capacity = 'Capacity must be a positive integer.';
  }

  if (!input.ticket_rules || String(input.ticket_rules).trim().length === 0) {
    errors.ticket_rules = 'Ticket rules are required.';
  } else if (!VALID_TICKET_RULES.includes(String(input.ticket_rules).toUpperCase())) {
    errors.ticket_rules = `Ticket rules must be one of: ${VALID_TICKET_RULES.join(', ')}.`;
  }

  return { valid: Object.keys(errors).length === 0, errors };
}

export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}
