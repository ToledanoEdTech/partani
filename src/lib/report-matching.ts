import type { Report, Schedule } from '../types';
import {
  DAY_MAP,
  addDaysToDateStr,
  getCanonicalLessonDate,
  getDayOfWeekForDateStr,
  getWeekStartDateStr,
} from './lesson-stats';

/** Sunday-start YYYY-MM-DD for the week that contains `dateStr`. */
export function getWeekStartForDateStr(dateStr: string): string {
  const dow = getDayOfWeekForDateStr(dateStr);
  return addDaysToDateStr(dateStr, -dow);
}

/** The calendar date of this schedule slot in the given IL week (Sunday-start). */
export function getLessonDateForScheduleInWeek(
  schedule: Pick<Schedule, 'day'>,
  weekStartStr: string,
): string {
  const dow = DAY_MAP[schedule.day];
  if (dow === undefined) return weekStartStr;
  return addDaysToDateStr(weekStartStr, dow);
}

/** Whether `dateStr` falls on the schedule's weekday. */
export function isLessonDateForSchedule(
  schedule: Pick<Schedule, 'day'>,
  dateStr: string,
): boolean {
  const targetDow = DAY_MAP[schedule.day];
  if (targetDow === undefined) return true;
  return getDayOfWeekForDateStr(dateStr) === targetDow;
}

/** Find a report for a specific lesson occurrence (schedule + lesson date). */
export function findReportForLessonDate(
  reports: Report[],
  schedule: Pick<Schedule, 'id' | 'day'>,
  lessonDateStr: string,
): Report | undefined {
  const exact = reports.find(
    (r) => r.scheduleId === schedule.id && r.date === lessonDateStr,
  );
  if (exact) return exact;

  return reports.find((r) => {
    if (r.scheduleId !== schedule.id) return false;
    return getCanonicalLessonDate(schedule, r.date) === lessonDateStr;
  });
}

/** Find the report for a schedule slot in a given week (by lesson date). */
export function findReportForScheduleWeek(
  reports: Report[],
  schedule: Pick<Schedule, 'id' | 'day'>,
  weekStartStr: string,
): Report | undefined {
  const lessonDateStr = getLessonDateForScheduleInWeek(schedule, weekStartStr);
  return findReportForLessonDate(reports, schedule, lessonDateStr);
}

/** Resolve the lesson date to persist — must be the schedule weekday. */
export function resolveLessonDateForSave(
  schedule: Pick<Schedule, 'day'>,
  pickedDateStr: string,
): { ok: true; lessonDate: string } | { ok: false; message: string } {
  if (!isLessonDateForSchedule(schedule, pickedDateStr)) {
    return {
      ok: false,
      message: `תאריך השיעור חייב להיות ביום ${schedule.day}. בחר את התאריך שבו התקיים השיעור בפועל.`,
    };
  }
  return { ok: true, lessonDate: pickedDateStr };
}

/** Default lesson date when opening a report form for a schedule in the current week. */
export function getDefaultLessonDateForSchedule(
  schedule: Pick<Schedule, 'day'>,
  weekStartStr: string = getWeekStartDateStr(new Date()),
): string {
  return getLessonDateForScheduleInWeek(schedule, weekStartStr);
}
