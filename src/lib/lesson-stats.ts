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
    const reported = reports.some((r) => {
      if (r.scheduleId !== slot.id) return false;
      if (r.date === cellDateStr) return true;
      return getCanonicalLessonDate(slot, r.date) === cellDateStr;
    });
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
  unreported: number;
  compliancePct: number;
}

export interface ReportIndexEntry {
  scheduleId: string;
  teacherId: string;
  date: string;
  status: 'completed' | 'missed';
}

export interface DueExpectedSlot {
  scheduleId: string;
  teacherId: string;
  date: string;
  dow: number;
}

/** Build YYYY-MM-DD from calendar parts without timezone conversion. */
export function calendarDateStr(year: number, monthIndex: number, day: number): string {
  return `${year}-${String(monthIndex + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

/** Index reports by `scheduleId|date` for O(1) lookup. */
export function indexReportsBySlotDate(
  reports: Pick<Report, 'scheduleId' | 'teacherId' | 'date' | 'status'>[],
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

/** Normalize a stored report date to the schedule weekday (legacy bad dates). */
export function getCanonicalLessonDate(
  schedule: Pick<Schedule, 'day'>,
  pickedDateStr: string,
): string {
  const targetDow = DAY_MAP[schedule.day];
  if (targetDow === undefined) return pickedDateStr;
  const pickedDow = getDayOfWeekForDateStr(pickedDateStr);
  if (pickedDow === targetDow) return pickedDateStr;
  const weekStart = addDaysToDateStr(pickedDateStr, -pickedDow);
  return addDaysToDateStr(weekStart, targetDow);
}

export function normalizeReportLessonDate(
  report: Pick<Report, 'scheduleId' | 'date'>,
  schedule: Pick<Schedule, 'day'> | undefined,
): string {
  if (!schedule) return report.date;
  return getCanonicalLessonDate(schedule, report.date);
}

/** Index by scheduleId|lessonDate, normalizing legacy report dates. */
export function indexReportsBySlotDateNormalized(
  reports: Pick<Report, 'scheduleId' | 'teacherId' | 'date' | 'status'>[],
  schedules: Pick<Schedule, 'id' | 'day'>[],
): Map<string, ReportIndexEntry> {
  const scheduleById = new Map(schedules.map((s) => [s.id, s]));
  const map = new Map<string, ReportIndexEntry>();
  for (const report of reports) {
    const schedule = scheduleById.get(report.scheduleId);
    const lessonDate = normalizeReportLessonDate(report, schedule);
    map.set(`${report.scheduleId}|${lessonDate}`, {
      scheduleId: report.scheduleId,
      teacherId: report.teacherId,
      date: lessonDate,
      status: report.status,
    });
  }
  return map;
}

export function filterReportsForActiveSchedules<
  T extends Pick<Report, 'scheduleId'>,
>(reports: T[], scheduleIds: Set<string>): T[] {
  return reports.filter((r) => scheduleIds.has(r.scheduleId));
}

/**
 * Due lessons in the analytics window: schedule occurrences in range whose
 * calendar date has already passed (≤ todayStr). Future lessons are excluded
 * so teachers are not penalised before the lesson happens.
 */
export function computeDueExpectedSlots(
  schedules: Pick<Schedule, 'id' | 'teacherId' | 'day'>[],
  startStr: string,
  endStr: string,
  todayStr: string,
): DueExpectedSlot[] {
  const slots: DueExpectedSlot[] = [];
  for (const schedule of schedules) {
    const dow = DAY_MAP[schedule.day];
    if (dow === undefined) continue;
    for (const date of getExpectedDatesForScheduleDay(schedule.day, startStr, endStr)) {
      if (date > todayStr) continue;
      slots.push({
        scheduleId: schedule.id,
        teacherId: schedule.teacherId,
        date,
        dow,
      });
    }
  }
  return slots;
}

function emptyComplianceCounts(): RangeComplianceCounts {
  return {
    expected: 0,
    reported: 0,
    completed: 0,
    missed: 0,
    unreported: 0,
    compliancePct: 100,
  };
}

function finalizeComplianceCounts(stats: RangeComplianceCounts): RangeComplianceCounts {
  stats.unreported = Math.max(0, stats.expected - stats.reported);
  stats.compliancePct =
    stats.expected === 0
      ? 100
      : Math.min(100, Math.round((stats.reported / stats.expected) * 100));
  return stats;
}

export function getTeacherComplianceInRange(params: {
  teacherId: string;
  schedules: Pick<Schedule, 'id' | 'teacherId' | 'day'>[];
  reports: Pick<Report, 'scheduleId' | 'teacherId' | 'date' | 'status'>[];
  startStr: string;
  endStr: string;
  todayStr: string;
  reportIndex?: Map<string, ReportIndexEntry>;
  dueSlots?: DueExpectedSlot[];
}): RangeComplianceCounts {
  const { teacherId, schedules, reports, startStr, endStr, todayStr } = params;
  const scheduleIds = new Set(schedules.map((s) => s.id));
  const activeReports = filterReportsForActiveSchedules(reports, scheduleIds);
  const reportIndex =
    params.reportIndex ?? indexReportsBySlotDateNormalized(activeReports, schedules);
  const dueSlots =
    params.dueSlots ??
    computeDueExpectedSlots(schedules, startStr, endStr, todayStr);

  const stats = emptyComplianceCounts();
  for (const slot of dueSlots) {
    if (slot.teacherId !== teacherId) continue;
    stats.expected++;
    const entry = reportIndex.get(`${slot.scheduleId}|${slot.date}`);
    if (!entry) continue;
    stats.reported++;
    if (entry.status === 'completed') stats.completed++;
    else if (entry.status === 'missed') stats.missed++;
  }

  return finalizeComplianceCounts(stats);
}

export interface DashboardAnalytics {
  scheduleIds: Set<string>;
  activeReports: Report[];
  reportIndex: Map<string, ReportIndexEntry>;
  dueSlots: DueExpectedSlot[];
  teacherCompliance: Map<string, RangeComplianceCounts>;
  periodTotals: RangeComplianceCounts;
  weeklyTrend: WeeklyTrendPoint[];
  dayOfWeekStats: DayOfWeekStat[];
}

/** Single pass over schedules + active reports for the admin dashboard. */
export function buildDashboardAnalytics(params: {
  schedules: Pick<Schedule, 'id' | 'teacherId' | 'day'>[];
  reports: Pick<Report, 'scheduleId' | 'teacherId' | 'date' | 'status'>[];
  teacherIds: string[];
  startStr: string;
  endStr: string;
  todayStr: string;
}): DashboardAnalytics {
  const { schedules, reports, teacherIds, startStr, endStr, todayStr } = params;
  const scheduleIds = new Set(schedules.map((s) => s.id));
  const activeReports = filterReportsForActiveSchedules(reports, scheduleIds);
  const reportIndex = indexReportsBySlotDateNormalized(activeReports, schedules);
  const dueSlots = computeDueExpectedSlots(schedules, startStr, endStr, todayStr);

  const teacherCompliance = new Map<string, RangeComplianceCounts>();
  for (const teacherId of teacherIds) {
    teacherCompliance.set(teacherId, emptyComplianceCounts());
  }

  for (const slot of dueSlots) {
    const stats = teacherCompliance.get(slot.teacherId);
    if (!stats) continue;
    stats.expected++;
    const entry = reportIndex.get(`${slot.scheduleId}|${slot.date}`);
    if (!entry) continue;
    stats.reported++;
    if (entry.status === 'completed') stats.completed++;
    else if (entry.status === 'missed') stats.missed++;
  }

  for (const stats of teacherCompliance.values()) {
    finalizeComplianceCounts(stats);
  }

  const periodTotals = emptyComplianceCounts();
  for (const stats of teacherCompliance.values()) {
    periodTotals.expected += stats.expected;
    periodTotals.reported += stats.reported;
    periodTotals.completed += stats.completed;
    periodTotals.missed += stats.missed;
    periodTotals.unreported += stats.unreported;
  }
  finalizeComplianceCounts(periodTotals);

  const weeklyTrend = getWeeklyTrend({
    schedules,
    dueSlots,
    reportIndex,
    startStr,
    endStr,
    todayStr,
  });

  const dayOfWeekStats = getDayOfWeekStats({
    dueSlots,
    reportIndex,
  });

  return {
    scheduleIds,
    activeReports: activeReports as Report[],
    reportIndex,
    dueSlots,
    teacherCompliance,
    periodTotals,
    weeklyTrend,
    dayOfWeekStats,
  };
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
  reports?: Pick<Report, 'scheduleId' | 'teacherId' | 'date' | 'status'>[];
  dueSlots?: DueExpectedSlot[];
  reportIndex?: Map<string, ReportIndexEntry>;
  startStr: string;
  endStr: string;
  todayStr: string;
}): WeeklyTrendPoint[] {
  const { schedules, startStr, endStr, todayStr } = params;
  const reportIndex =
    params.reportIndex ??
    indexReportsBySlotDateNormalized(
      filterReportsForActiveSchedules(
        params.reports ?? [],
        new Set(schedules.map((s) => s.id)),
      ),
      schedules,
    );
  const dueSlots =
    params.dueSlots ?? computeDueExpectedSlots(schedules, startStr, endStr, todayStr);
  const weekStarts = enumerateWeekStartsBetween(startStr, endStr);

  return weekStarts.map((weekStart) => {
    const weekEnd = addDaysToDateStr(weekStart, 5);
    const lo = weekStart < startStr ? startStr : weekStart;
    const hi = weekEnd > endStr ? endStr : weekEnd;

    let expected = 0;
    let reported = 0;
    let completed = 0;
    let missed = 0;

    for (const slot of dueSlots) {
      if (slot.date < lo || slot.date > hi) continue;
      expected++;
      const entry = reportIndex.get(`${slot.scheduleId}|${slot.date}`);
      if (!entry) continue;
      reported++;
      if (entry.status === 'completed') completed++;
      else if (entry.status === 'missed') missed++;
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

/** Day-of-week aggregate stats for Sun..Fri across due lessons only. */
export function getDayOfWeekStats(params: {
  schedules?: Pick<Schedule, 'id' | 'teacherId' | 'day'>[];
  reports?: Pick<Report, 'scheduleId' | 'teacherId' | 'date' | 'status'>[];
  dueSlots?: DueExpectedSlot[];
  reportIndex?: Map<string, ReportIndexEntry>;
  startStr?: string;
  endStr?: string;
  todayStr?: string;
}): DayOfWeekStat[] {
  const reportIndex = params.reportIndex ?? indexReportsBySlotDate(params.reports ?? []);
  const dueSlots =
    params.dueSlots ??
    computeDueExpectedSlots(
      params.schedules ?? [],
      params.startStr ?? '1970-01-01',
      params.endStr ?? '2099-12-31',
      params.todayStr ?? '2099-12-31',
    );

  const acc: Record<number, { expected: number; reported: number }> = {};
  for (let i = 0; i <= 5; i++) acc[i] = { expected: 0, reported: 0 };

  for (const slot of dueSlots) {
    if (slot.dow > 5) continue;
    acc[slot.dow].expected++;
    if (reportIndex.has(`${slot.scheduleId}|${slot.date}`)) {
      acc[slot.dow].reported++;
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
