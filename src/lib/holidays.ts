/**
 * Pure helpers for school holiday / vacation blackout dates.
 * Shared by the React app and the Vercel cron (no Firebase / browser APIs).
 */

import type { HolidayPeriod } from '../types';

const ISO_DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/;

function isValidIsoDate(dateStr: string): boolean {
  const m = ISO_DATE_RE.exec(dateStr);
  if (!m) return false;
  const y = Number(m[1]);
  const mo = Number(m[2]);
  const d = Number(m[3]);
  const utc = Date.UTC(y, mo - 1, d);
  const check = new Date(utc);
  return (
    check.getUTCFullYear() === y &&
    check.getUTCMonth() === mo - 1 &&
    check.getUTCDate() === d
  );
}

/** Add N days to a YYYY-MM-DD calendar date (UTC arithmetic). */
function addDaysToDateStr(dateStr: string, days: number): string {
  const match = ISO_DATE_RE.exec(dateStr);
  if (!match) throw new Error(`Invalid YYYY-MM-DD: ${dateStr}`);
  const utc = Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
  const shifted = new Date(utc + days * 86_400_000);
  const yyyy = shifted.getUTCFullYear();
  const mm = String(shifted.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(shifted.getUTCDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

/**
 * Parse a cell value from Excel / forms into YYYY-MM-DD.
 * Accepts ISO strings, DD/MM/YYYY, Date objects, and Excel serial numbers.
 */
export function parseFlexibleDate(value: unknown): string | null {
  if (value == null || value === '') return null;

  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    const yyyy = value.getFullYear();
    const mm = String(value.getMonth() + 1).padStart(2, '0');
    const dd = String(value.getDate()).padStart(2, '0');
    const out = `${yyyy}-${mm}-${dd}`;
    return isValidIsoDate(out) ? out : null;
  }

  if (typeof value === 'number' && Number.isFinite(value)) {
    // Excel serial date (days since 1899-12-30), local calendar components.
    const excelEpoch = Date.UTC(1899, 11, 30);
    const ms = excelEpoch + Math.round(value) * 86_400_000;
    const d = new Date(ms);
    const yyyy = d.getUTCFullYear();
    const mm = String(d.getUTCMonth() + 1).padStart(2, '0');
    const dd = String(d.getUTCDate()).padStart(2, '0');
    const out = `${yyyy}-${mm}-${dd}`;
    return isValidIsoDate(out) ? out : null;
  }

  const raw = String(value).trim();
  if (!raw) return null;

  if (ISO_DATE_RE.test(raw) && isValidIsoDate(raw)) return raw;

  // DD/MM/YYYY or DD-MM-YYYY
  const dmy = /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})$/.exec(raw);
  if (dmy) {
    const dd = dmy[1].padStart(2, '0');
    const mm = dmy[2].padStart(2, '0');
    const yyyy = dmy[3];
    const out = `${yyyy}-${mm}-${dd}`;
    return isValidIsoDate(out) ? out : null;
  }

  // YYYY/MM/DD
  const ymd = /^(\d{4})[/.-](\d{1,2})[/.-](\d{1,2})$/.exec(raw);
  if (ymd) {
    const out = `${ymd[1]}-${ymd[2].padStart(2, '0')}-${ymd[3].padStart(2, '0')}`;
    return isValidIsoDate(out) ? out : null;
  }

  return null;
}

/** Normalize a raw period; returns null if dates are invalid. */
export function normalizeHolidayPeriod(raw: {
  startDate?: unknown;
  endDate?: unknown;
  date?: unknown;
  name?: unknown;
}): HolidayPeriod | null {
  const start =
    parseFlexibleDate(raw.startDate) ||
    parseFlexibleDate(raw.date) ||
    null;
  if (!start) return null;
  const end = parseFlexibleDate(raw.endDate) || start;
  const [a, b] = start <= end ? [start, end] : [end, start];
  const name =
    raw.name != null && String(raw.name).trim() ? String(raw.name).trim() : undefined;
  return { startDate: a, endDate: b, ...(name ? { name } : {}) };
}

/** Coerce Firestore / settings payload into a clean HolidayPeriod[]. */
export function normalizeHolidayPeriods(raw: unknown): HolidayPeriod[] {
  if (!Array.isArray(raw)) return [];
  const out: HolidayPeriod[] = [];
  for (const item of raw) {
    if (!item || typeof item !== 'object') continue;
    const normalized = normalizeHolidayPeriod(item as Record<string, unknown>);
    if (normalized) out.push(normalized);
  }
  return sortHolidayPeriods(out);
}

export function sortHolidayPeriods(holidays: HolidayPeriod[]): HolidayPeriod[] {
  return [...holidays].sort((a, b) => {
    if (a.startDate !== b.startDate) return a.startDate.localeCompare(b.startDate);
    if (a.endDate !== b.endDate) return a.endDate.localeCompare(b.endDate);
    return (a.name || '').localeCompare(b.name || '', 'he');
  });
}

export function holidayPeriodKey(h: HolidayPeriod): string {
  return `${h.startDate}|${h.endDate}|${h.name || ''}`;
}

/** Merge incoming periods into existing, skipping exact duplicates. */
export function mergeHolidayPeriods(
  existing: HolidayPeriod[],
  incoming: HolidayPeriod[],
): HolidayPeriod[] {
  const seen = new Set(existing.map(holidayPeriodKey));
  const merged = [...existing];
  for (const h of incoming) {
    const key = holidayPeriodKey(h);
    if (seen.has(key)) continue;
    seen.add(key);
    merged.push(h);
  }
  return sortHolidayPeriods(merged);
}

/** Expand periods into every calendar date (inclusive). */
export function buildHolidayDateSet(holidays: HolidayPeriod[]): Set<string> {
  const set = new Set<string>();
  for (const h of holidays) {
    let cur = h.startDate;
    // Safety cap: ~3 years of daily expansion per period.
    for (let i = 0; i < 1200; i++) {
      set.add(cur);
      if (cur >= h.endDate) break;
      cur = addDaysToDateStr(cur, 1);
    }
  }
  return set;
}

export function isHolidayDate(
  dateStr: string,
  holidayDates?: Set<string> | null,
): boolean {
  return Boolean(holidayDates?.has(dateStr));
}

export function findHolidayForDate(
  dateStr: string,
  holidays: HolidayPeriod[],
): HolidayPeriod | undefined {
  return holidays.find((h) => dateStr >= h.startDate && dateStr <= h.endDate);
}

export function formatHolidayRangeLabel(h: HolidayPeriod): string {
  if (h.startDate === h.endDate) return h.startDate;
  return `${h.startDate} – ${h.endDate}`;
}
