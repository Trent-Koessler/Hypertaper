/**
 * Calendar-date helpers.
 *
 * Schedule dates are plain calendar days ("2026-07-31"), not instants. Passing
 * such a string to `new Date()` parses it as UTC midnight, so rendering it with
 * `toLocaleDateString()` shifts it a day earlier for anyone west of UTC. These
 * helpers keep every conversion on the calendar, never on a timezone.
 */

const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;

export function isValidISODate(iso: string): boolean {
  const match = ISO_DATE.exec(iso ?? '');
  if (!match) return false;
  const [, y, m, d] = match;
  const date = new Date(Date.UTC(Number(y), Number(m) - 1, Number(d)));
  return (
    date.getUTCFullYear() === Number(y) &&
    date.getUTCMonth() === Number(m) - 1 &&
    date.getUTCDate() === Number(d)
  );
}

export function todayISO(): string {
  const now = new Date();
  return toISODate(now.getFullYear(), now.getMonth() + 1, now.getDate());
}

function toISODate(year: number, month: number, day: number): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${String(year).padStart(4, '0')}-${pad(month)}-${pad(day)}`;
}

/** Adds whole days to an ISO calendar date, returning a new ISO calendar date. */
export function addDaysISO(iso: string, days: number): string {
  if (!isValidISODate(iso)) return iso;
  const [y, m, d] = iso.split('-').map(Number);
  // UTC arithmetic keeps the result immune to DST transitions.
  const date = new Date(Date.UTC(y, m - 1, d));
  date.setUTCDate(date.getUTCDate() + Math.round(days));
  return toISODate(date.getUTCFullYear(), date.getUTCMonth() + 1, date.getUTCDate());
}

/**
 * Builds a Date at *local* midnight for the given calendar day, so that
 * `toLocaleDateString()` renders the day the user actually picked.
 */
export function parseISODateLocal(iso: string): Date | null {
  if (!isValidISODate(iso)) return null;
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y, m - 1, d);
}

export function formatISODate(iso: string, options: Intl.DateTimeFormatOptions): string {
  const date = parseISODateLocal(iso);
  return date ? date.toLocaleDateString(undefined, options) : iso;
}
