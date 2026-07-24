import { addDaysToDateStr } from './lesson-stats';

const HEBREW_MONTHS = [
  'ינואר', 'פברואר', 'מרץ', 'אפריל', 'מאי', 'יוני',
  'יולי', 'אוגוסט', 'ספטמבר', 'אוקטובר', 'נובמבר', 'דצמבר',
] as const;

/** `2026-07-13` → `13.7.2026` */
export function formatHebrewDateShort(dateStr: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateStr);
  if (!match) return dateStr;
  const [, y, m, d] = match;
  return `${Number(d)}.${Number(m)}.${y}`;
}

/** `2026-07-13` + optional day name → `יום ראשון, 13 ביולי 2026` */
export function formatHebrewDateLong(dateStr: string, dayName?: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateStr);
  if (!match) return dateStr;
  const [, y, m, d] = match;
  const monthName = HEBREW_MONTHS[Number(m) - 1] ?? m;
  const dayPart = dayName ? `יום ${dayName}, ` : '';
  return `${dayPart}${Number(d)} ב${monthName} ${y}`;
}

/** Calendar month → `יולי 2026` */
export function formatHebrewMonthLabel(year: number, monthIndex: number): string {
  const monthName = HEBREW_MONTHS[monthIndex] ?? String(monthIndex + 1);
  return `${monthName} ${year}`;
}

/** Week Sunday-start → `13–19 ביולי 2026` */
export function formatWeekRangeLabel(weekStartStr: string): string {
  const endStr = addDaysToDateStr(weekStartStr, 6);
  const start = /^(\d{4})-(\d{2})-(\d{2})$/.exec(weekStartStr);
  const end = /^(\d{4})-(\d{2})-(\d{2})$/.exec(endStr);
  if (!start || !end) return weekStartStr;
  const [, , m1, d1] = start;
  const [y2, m2, d2] = end;
  const monthStart = HEBREW_MONTHS[Number(m1) - 1] ?? m1;
  const monthEnd = HEBREW_MONTHS[Number(m2) - 1] ?? m2;
  if (m1 === m2) {
    return `${Number(d1)}–${Number(d2)} ב${monthStart} ${y2}`;
  }
  return `${Number(d1)} ב${monthStart} – ${Number(d2)} ב${monthEnd} ${y2}`;
}

/** Hour slot label for teachers (0–10 internal numbering). */
export function formatHourSlot(hour: string): string {
  return `שעה ${hour}`;
}
