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
