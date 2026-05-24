/**
 * Pure utilities for week math and missing-lesson computation.
 *
 * NOTE: This file must remain free of any browser-only or Firebase imports
 * so that it can be shared between the React app (`src/App.tsx`) and the
 * Vercel serverless cron handler (`api/cron/email-reminders.ts`).
 */

import type { Report, Schedule, Teacher } from '../types';

export const ISRAEL_TIMEZONE = 'Asia/Jerusalem';

export const DAY_MAP: Record<string, number> = {
  ראשון: 0,
  שני: 1,
  שלישי: 2,
  רביעי: 3,
  חמישי: 4,
  שישי: 5,
  שבת: 6,
};

const SHORT_DAY_TO_NUM: Record<string, number> = {
  Sun: 0,
  Mon: 1,
  Tue: 2,
  Wed: 3,
  Thu: 4,
  Fri: 5,
  Sat: 6,
};

/** Format a Date as YYYY-MM-DD in the given IANA timezone. */
export function formatDateInTZ(date: Date, timeZone: string = ISRAEL_TIMEZONE): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(date);
  return parts; // en-CA → "YYYY-MM-DD"
}

/** Day-of-week (0=Sun..6=Sat) for the given Date, in the given timezone. */
export function getDayOfWeekInTZ(date: Date, timeZone: string = ISRAEL_TIMEZONE): number {
  const short = new Intl.DateTimeFormat('en-US', { timeZone, weekday: 'short' }).format(date);
  const n = SHORT_DAY_TO_NUM[short];
  if (n === undefined) {
    throw new Error(`Unexpected weekday short: ${short}`);
  }
  return n;
}

/** Add N days (can be negative) to a YYYY-MM-DD calendar date, returning YYYY-MM-DD. */
export function addDaysToDateStr(dateStr: string, days: number): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateStr);
  if (!match) throw new Error(`Invalid YYYY-MM-DD: ${dateStr}`);
  const [, y, m, d] = match;
  // Work in UTC to avoid host timezone affecting arithmetic.
  const utc = Date.UTC(Number(y), Number(m) - 1, Number(d));
  const shifted = new Date(utc + days * 86_400_000);
  const yyyy = shifted.getUTCFullYear();
  const mm = String(shifted.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(shifted.getUTCDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

/**
 * Returns the Sunday-start date string (YYYY-MM-DD) of the week containing
 * `date`, computed in the given timezone. Matches the behaviour of
 * `getSunday(d)` in `App.tsx` (which uses local time, i.e. Israel time
 * for the in-Israel user base).
 */
export function getWeekStartDateStr(date: Date, timeZone: string = ISRAEL_TIMEZONE): string {
  const todayStr = formatDateInTZ(date, timeZone);
  const dow = getDayOfWeekInTZ(date, timeZone);
  return addDaysToDateStr(todayStr, -dow);
}

/**
 * Stable, sortable key for "the IL week that contains this date".
 * We use the Sunday-start YYYY-MM-DD itself for compactness and human
 * readability when stored in Firestore (e.g. "2026-05-17").
 */
export function getWeekKey(date: Date, timeZone: string = ISRAEL_TIMEZONE): string {
  return getWeekStartDateStr(date, timeZone);
}

export interface MissingLesson {
  scheduleId: string;
  date: string; // YYYY-MM-DD (IL)
  day: string; // Hebrew day name
  hour: string;
  studentName: string;
  subject: string;
}

/**
 * Compute lessons in the current IL calendar week that have already
 * occurred (date ≤ today, IL time) and for which no report exists.
 * Mirrors the inline logic at lines ~972–978 in `src/App.tsx`.
 */
export function getMissingLessonsForTeacherThisWeek(params: {
  teacherId: string;
  schedules: Pick<Schedule, 'id' | 'teacherId' | 'day' | 'hour' | 'studentName' | 'subject'>[];
  reports: Pick<Report, 'scheduleId' | 'date'>[];
  now?: Date;
  timeZone?: string;
}): MissingLesson[] {
  const { teacherId, schedules, reports } = params;
  const now = params.now ?? new Date();
  const timeZone = params.timeZone ?? ISRAEL_TIMEZONE;

  const weekStartStr = getWeekStartDateStr(now, timeZone);
  const todayStr = formatDateInTZ(now, timeZone);

  const teacherSchedules = schedules.filter((s) => s.teacherId === teacherId);
  const out: MissingLesson[] = [];

  for (const slot of teacherSchedules) {
    const offset = DAY_MAP[slot.day];
    if (offset === undefined) continue;
    const cellDateStr = addDaysToDateStr(weekStartStr, offset);
    if (cellDateStr > todayStr) continue; // not yet past — not missing
    const reported = reports.some((r) => r.scheduleId === slot.id && r.date === cellDateStr);
    if (!reported) {
      out.push({
        scheduleId: slot.id,
        date: cellDateStr,
        day: slot.day,
        hour: slot.hour,
        studentName: slot.studentName,
        subject: slot.subject,
      });
    }
  }

  out.sort((a, b) => (a.date === b.date ? a.hour.localeCompare(b.hour) : a.date.localeCompare(b.date)));
  return out;
}

/** Convenience: returns count of past-and-unreported lessons for the week. */
export function getMissingCountForTeacherThisWeek(params: {
  teacherId: string;
  schedules: Pick<Schedule, 'id' | 'teacherId' | 'day' | 'hour' | 'studentName' | 'subject'>[];
  reports: Pick<Report, 'scheduleId' | 'date'>[];
  now?: Date;
  timeZone?: string;
}): number {
  return getMissingLessonsForTeacherThisWeek(params).length;
}

/**
 * Whether a teacher is eligible to receive an automated email reminder
 * **right now**, given the current week & data. Pure — no I/O.
 */
export function isTeacherReminderEligible(params: {
  teacher: Pick<Teacher, 'id' | 'email' | 'active' | 'emailRemindersEnabled'>;
  schedules: Pick<Schedule, 'id' | 'teacherId' | 'day' | 'hour' | 'studentName' | 'subject'>[];
  reports: Pick<Report, 'scheduleId' | 'date'>[];
  minMissingLessons: number;
  now?: Date;
  timeZone?: string;
}): { eligible: boolean; reason?: string; missing: MissingLesson[] } {
  const { teacher } = params;
  if (!teacher.active) return { eligible: false, reason: 'inactive', missing: [] };
  if (teacher.emailRemindersEnabled === false) return { eligible: false, reason: 'opt-out', missing: [] };
  if (!teacher.email) return { eligible: false, reason: 'no-email', missing: [] };

  const missing = getMissingLessonsForTeacherThisWeek({
    teacherId: teacher.id,
    schedules: params.schedules,
    reports: params.reports,
    now: params.now,
    timeZone: params.timeZone,
  });

  if (missing.length < params.minMissingLessons) {
    return { eligible: false, reason: 'not-enough-missing', missing };
  }

  return { eligible: true, missing };
}

/* -----------------------------------------------------------------------
 * Analytics primitives
 *
 * The functions below power the admin "Overview & Statistics" dashboard.
 * They are pure, deterministic, and work on calendar-date strings
 * (YYYY-MM-DD) so they're stable regardless of the host runtime's
 * timezone — the caller is responsible for picking a sensible [start,
 * end] range (typically derived from `Asia/Jerusalem` "today").
 * ----------------------------------------------------------------------- */

const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/** Returns 0=Sun..6=Sat for a YYYY-MM-DD calendar-date string. */
export function getDayOfWeekForDateStr(dateStr: string): number {
  const m = ISO_DATE_RE.exec(dateStr);
  if (!m) throw new Error(`Invalid YYYY-MM-DD: ${dateStr}`);
  const [y, mo, d] = dateStr.split('-').map(Number);
  return new Date(Date.UTC(y, mo - 1, d)).getUTCDay();
}

/** All calendar dates in `[startStr, endStr]` inclusive (YYYY-MM-DD). */
export function enumerateDatesBetween(startStr: string, endStr: string): string[] {
  if (endStr < startStr) return [];
  const out: string[] = [];
  let cur = startStr;
  while (cur <= endStr) {
    out.push(cur);
    cur = addDaysToDateStr(cur, 1);
  }
  return out;
}

/**
 * Returns the list of Sunday-start dates (YYYY-MM-DD) for every IL week
 * that overlaps `[startStr, endStr]` — including weeks where the Sunday
 * itself falls before `startStr`.
 */
export function enumerateWeekStartsBetween(startStr: string, endStr: string): string[] {
  if (endStr < startStr) return [];
  // Snap startStr back to its Sunday.
  const startDow = getDayOfWeekForDateStr(startStr);
  let cursor = addDaysToDateStr(startStr, -startDow);
  const out: string[] = [];
  while (cursor <= endStr) {
    out.push(cursor);
    cursor = addDaysToDateStr(cursor, 7);
  }
  return out;
}

/** All YYYY-MM-DD dates in `[startStr, endStr]` that fall on the given Hebrew day name. */
export function getExpectedDatesForScheduleDay(
  scheduleDay: string,
  startStr: string,
  endStr: string
): string[] {
  const targetDow = DAY_MAP[scheduleDay];
  if (targetDow === undefined) return [];
  return enumerateDatesBetween(startStr, endStr).filter(
    (d) => getDayOfWeekForDateStr(d) === targetDow
  );
}

export interface RangeComplianceCounts {
  expected: number;
  reported: number;
  completed: number;
  missed: number;
  unreported: number; // expected - reported, floored at 0
  compliancePct: number; // reported / expected (0..100), 100 if expected===0
}

interface ReportIndexEntry {
  scheduleId: string;
  teacherId: string;
  date: string;
  status: 'completed' | 'missed';
}

/** Index reports by `scheduleId|date` for O(1) "was this expected lesson reported?" lookup. */
export function indexReportsBySlotDate(
  reports: Pick<Report, 'scheduleId' | 'teacherId' | 'date' | 'status'>[]
): Map<string, ReportIndexEntry> {
  const map = new Map<string, ReportIndexEntry>();
  for (const r of reports) {
    map.set(`${r.scheduleId}|${r.date}`, {
      scheduleId: r.scheduleId,
      teacherId: r.teacherId,
      date: r.date,
      status: r.status,
    });
  }
  return map;
}

/**
 * Per-teacher compliance counts across an inclusive date range.
 *
 * Semantics:
 *   • `expected` — for each of the teacher's current schedule entries,
 *     count how many dates in `[startStr, endStr]` fall on that entry's
 *     day-of-week. Assumes the schedule was active throughout the range.
 *   • `reported` — number of (scheduleId, date) pairs in the range that
 *     have a matching report document, regardless of status.
 *   • `completed` / `missed` — split of `reported` by report status.
 *   • `unreported` — `max(0, expected - reported)`. Approximation of
 *     "lessons the teacher was supposed to report but didn't".
 *   • `compliancePct` — `reported / expected * 100`, rounded, capped at 100.
 */
export function getTeacherComplianceInRange(params: {
  teacherId: string;
  schedules: Pick<Schedule, 'id' | 'teacherId' | 'day'>[];
  reports: Pick<Report, 'scheduleId' | 'teacherId' | 'date' | 'status'>[];
  startStr: string;
  endStr: string;
  reportIndex?: Map<string, ReportIndexEntry>;
}): RangeComplianceCounts {
  const { teacherId, schedules, startStr, endStr } = params;
  const reportIndex = params.reportIndex ?? indexReportsBySlotDate(params.reports);

  let expected = 0;
  let reported = 0;
  let completed = 0;
  let missed = 0;

  const teacherSchedules = schedules.filter((s) => s.teacherId === teacherId);
  for (const slot of teacherSchedules) {
    const dates = getExpectedDatesForScheduleDay(slot.day, startStr, endStr);
    expected += dates.length;
    for (const date of dates) {
      const entry = reportIndex.get(`${slot.id}|${date}`);
      if (entry) {
        reported++;
        if (entry.status === 'completed') completed++;
        else if (entry.status === 'missed') missed++;
      }
    }
  }

  const unreported = Math.max(0, expected - reported);
  const compliancePct =
    expected === 0 ? 100 : Math.min(100, Math.round((reported / expected) * 100));

  return { expected, reported, completed, missed, unreported, compliancePct };
}

export interface WeeklyTrendPoint {
  weekStart: string; // Sunday YYYY-MM-DD
  weekEnd: string; // Friday YYYY-MM-DD (six-day school week)
  expected: number;
  reported: number;
  completed: number;
  missed: number;
}

/**
 * Per-week expected/reported counts across the analytics range.
 *
 * For the purpose of trend charts we treat each IL week as Sun–Fri
 * (the school's working week). Saturday lessons aren't part of any
 * schedule in this product, so excluding Saturday avoids a confusing
 * "100% missed" trailing column.
 */
export function getWeeklyTrend(params: {
  schedules: Pick<Schedule, 'id' | 'teacherId' | 'day'>[];
  reports: Pick<Report, 'scheduleId' | 'teacherId' | 'date' | 'status'>[];
  startStr: string;
  endStr: string;
  reportIndex?: Map<string, ReportIndexEntry>;
}): WeeklyTrendPoint[] {
  const { schedules, startStr, endStr } = params;
  const reportIndex = params.reportIndex ?? indexReportsBySlotDate(params.reports);
  const weekStarts = enumerateWeekStartsBetween(startStr, endStr);

  return weekStarts.map((weekStart) => {
    const sunFri = [0, 1, 2, 3, 4, 5];
    const weekEnd = addDaysToDateStr(weekStart, 5);
    // Clamp the week's contribution to the visible range.
    const lo = weekStart < startStr ? startStr : weekStart;
    const hi = weekEnd > endStr ? endStr : weekEnd;
    const datesInWindow = enumerateDatesBetween(lo, hi);

    let expected = 0;
    let reported = 0;
    let completed = 0;
    let missed = 0;

    for (const date of datesInWindow) {
      const dow = getDayOfWeekForDateStr(date);
      if (!sunFri.includes(dow)) continue;
      // For this date, count schedule entries that match the day.
      for (const slot of schedules) {
        if (DAY_MAP[slot.day] !== dow) continue;
        expected++;
        const entry = reportIndex.get(`${slot.id}|${date}`);
        if (entry) {
          reported++;
          if (entry.status === 'completed') completed++;
          else if (entry.status === 'missed') missed++;
        }
      }
    }

    return { weekStart, weekEnd, expected, reported, completed, missed };
  });
}

export interface DayOfWeekStat {
  dow: number; // 0..5 (Sun..Fri)
  dayName: string; // Hebrew
  expected: number;
  reported: number;
  unreported: number;
  compliancePct: number;
}

const DAY_NAMES_BY_DOW: Record<number, string> = {
  0: 'ראשון',
  1: 'שני',
  2: 'שלישי',
  3: 'רביעי',
  4: 'חמישי',
  5: 'שישי',
  6: 'שבת',
};

/** Day-of-week aggregate stats for Sun..Fri across the range. */
export function getDayOfWeekStats(params: {
  schedules: Pick<Schedule, 'id' | 'teacherId' | 'day'>[];
  reports: Pick<Report, 'scheduleId' | 'teacherId' | 'date' | 'status'>[];
  startStr: string;
  endStr: string;
  reportIndex?: Map<string, ReportIndexEntry>;
}): DayOfWeekStat[] {
  const { schedules, startStr, endStr } = params;
  const reportIndex = params.reportIndex ?? indexReportsBySlotDate(params.reports);
  const dates = enumerateDatesBetween(startStr, endStr);

  const acc: Record<number, { expected: number; reported: number }> = {};
  for (let i = 0; i <= 5; i++) acc[i] = { expected: 0, reported: 0 };

  for (const date of dates) {
    const dow = getDayOfWeekForDateStr(date);
    if (dow > 5) continue;
    for (const slot of schedules) {
      if (DAY_MAP[slot.day] !== dow) continue;
      acc[dow].expected++;
      const entry = reportIndex.get(`${slot.id}|${date}`);
      if (entry) acc[dow].reported++;
    }
  }

  return Array.from({ length: 6 }, (_, dow) => {
    const { expected, reported } = acc[dow];
    const unreported = Math.max(0, expected - reported);
    const compliancePct =
      expected === 0 ? 100 : Math.min(100, Math.round((reported / expected) * 100));
    return { dow, dayName: DAY_NAMES_BY_DOW[dow], expected, reported, unreported, compliancePct };
  });
}
