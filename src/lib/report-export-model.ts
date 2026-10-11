import type { Report, Schedule, Student, Teacher } from '../types';
import { formatHebrewDateLong, formatHebrewDateShort, formatHourSlot } from './date-format';
import { buildDashboardAnalytics, formatDateInTZ, ISRAEL_TIMEZONE } from './lesson-stats';
import { getReportAttendedLabel, getScheduleDisplayLabel, compareHebrewNames } from './students';

export const REPORT_EXPORT_ORG = 'ישיבת צביה אלישיב לוד';

export interface ReportExportFilter {
  label: string;
  value: string;
}

export interface ReportExportRow {
  dateLabel: string;
  teacherName: string;
  studentsLabel: string;
  subject: string;
  status: 'completed' | 'missed';
  statusLabel: 'התקיים' | 'בוטל';
  text: string;
}

/** Compliance columns when a date range is set; otherwise counts from the filtered reports. */
export type TeacherTableMode = 'compliance' | 'filtered';

export interface TeacherExportRow {
  id: string;
  name: string;
  active: boolean;
  expected: number | null;
  reported: number | null;
  completed: number;
  missed: number;
  unreported: number | null;
  /** Null when the teacher had no lessons due in the range. */
  compliancePct: number | null;
  filteredCount: number;
}

export interface ReportAnalyticsSummary {
  startStr: string;
  endStr: string;
  rangeLabel: string;
  /** True when the user did not set a date filter, so the school year through today is used. */
  isDefaultRange: boolean;
  expected: number;
  reported: number;
  unreported: number;
  compliancePct: number;
  note: string;
}

export interface MissingLessonExportRow {
  date: string;
  dateLabel: string;
  teacherId: string;
  teacherName: string;
  day: string;
  hour: string;
  subject: string;
  studentsLabel: string;
}

export interface ReportExportModel {
  title: string;
  organization: string;
  filename: string;
  generatedOnLabel: string;
  filters: ReportExportFilter[];
  filteredCount: number;
  completedCount: number;
  missedCount: number;
  analytics: ReportAnalyticsSummary;
  teacherTableMode: TeacherTableMode;
  teachers: TeacherExportRow[];
  /** Teachers who still owe at least one lesson report in the tracking range. */
  missingTeachers: TeacherExportRow[];
  missingLessons: MissingLessonExportRow[];
  reports: ReportExportRow[];
}

export interface ReportExportInput {
  filteredReports: Report[];
  reports: Report[];
  schedules: Schedule[];
  teachers: Teacher[];
  students: Student[];
  holidayDates: Set<string> | null;
  todayStr: string;
  generatedAt?: Date;
  filterTeacherId: string;
  filterStatus: string;
  filterDateFrom: string;
  filterDateTo: string;
  search: string;
}

function schoolYearStart(dateStr: string): string {
  const [yyStr, mmStr] = dateStr.split('-');
  const yy = Number(yyStr);
  const mm = Number(mmStr);
  return mm >= 9 ? `${yy}-09-01` : `${yy - 1}-09-01`;
}

/**
 * Date window for compliance.
 * With no dates, tracking covers the current school year through today.
 * An open start uses the school year of the end date; an open end uses today.
 */
export function resolveReportAnalyticsRange(
  from: string,
  to: string,
  todayStr: string,
): { startStr: string; endStr: string; isDefault: boolean } {
  if (!from && !to) {
    const startStr = schoolYearStart(todayStr);
    return {
      startStr: startStr > todayStr ? todayStr : startStr,
      endStr: todayStr,
      isDefault: true,
    };
  }
  let startStr = from;
  let endStr = to;
  if (!startStr) {
    startStr = schoolYearStart(endStr);
    if (startStr > endStr) startStr = endStr;
  }
  if (!endStr) endStr = todayStr;
  if (startStr > endStr) {
    const swap = startStr;
    startStr = endStr;
    endStr = swap;
  }
  return { startStr, endStr, isDefault: false };
}

function statusFilterLabel(status: string): string {
  if (status === 'completed') return 'התקיים';
  if (status === 'missed') return 'בוטל';
  return 'הכל';
}

function studentsLabel(report: Report, schedule: Schedule | undefined, students: Student[]): string {
  const attended = getReportAttendedLabel(report, schedule, students);
  if (attended) return attended;
  if (schedule) return getScheduleDisplayLabel(schedule, students);
  return 'נמחק';
}

function rangeLabel(startStr: string, endStr: string): string {
  return `${formatHebrewDateShort(startStr)} – ${formatHebrewDateShort(endStr)}`;
}

export function complianceTone(pct: number): 'good' | 'ok' | 'bad' {
  if (pct >= 85) return 'good';
  if (pct >= 70) return 'ok';
  return 'bad';
}

export function buildReportExportModel(input: ReportExportInput): ReportExportModel {
  const generatedAt = input.generatedAt ?? new Date();
  const generatedDateStr = formatDateInTZ(generatedAt, ISRAEL_TIMEZONE);
  const generatedTime = new Intl.DateTimeFormat('he-IL', {
    timeZone: ISRAEL_TIMEZONE,
    hour: '2-digit',
    minute: '2-digit',
  }).format(generatedAt);

  const scheduleById = new Map(input.schedules.map((s) => [s.id, s]));
  const teacherById = new Map(input.teachers.map((t) => [t.id, t]));
  const selectedTeacher =
    input.filterTeacherId === 'all' ? undefined : teacherById.get(input.filterTeacherId);

  const filters: ReportExportFilter[] = [
    { label: 'מורה', value: selectedTeacher?.name || (input.filterTeacherId === 'all' ? 'הכל' : '—') },
    { label: 'סטטוס', value: statusFilterLabel(input.filterStatus) },
    { label: 'מתאריך', value: input.filterDateFrom ? formatHebrewDateShort(input.filterDateFrom) : 'לא הוגדר' },
    { label: 'עד תאריך', value: input.filterDateTo ? formatHebrewDateShort(input.filterDateTo) : 'לא הוגדר' },
    { label: 'חיפוש', value: input.search.trim() || 'ללא' },
  ];

  const reportRows: ReportExportRow[] = input.filteredReports.map((report) => {
    const schedule = scheduleById.get(report.scheduleId);
    const teacher = teacherById.get(report.teacherId);
    const completed = report.status === 'completed';
    return {
      dateLabel: formatHebrewDateShort(report.date),
      teacherName: teacher?.name || '-',
      studentsLabel: studentsLabel(report, schedule, input.students),
      subject: schedule?.subject || '-',
      status: completed ? 'completed' : 'missed',
      statusLabel: completed ? 'התקיים' : 'בוטל',
      text: report.text || '',
    };
  });

  const completedCount = reportRows.filter((r) => r.status === 'completed').length;
  const missedCount = reportRows.length - completedCount;

  const filteredByTeacher = new Map<string, { completed: number; missed: number }>();
  for (const report of input.filteredReports) {
    const bucket = filteredByTeacher.get(report.teacherId) ?? { completed: 0, missed: 0 };
    if (report.status === 'completed') bucket.completed += 1;
    else bucket.missed += 1;
    filteredByTeacher.set(report.teacherId, bucket);
  }

  const analyticsRange = resolveReportAnalyticsRange(
    input.filterDateFrom,
    input.filterDateTo,
    input.todayStr,
  );
  const teacherTableMode: TeacherTableMode = 'compliance';
  const schedules = selectedTeacher
    ? input.schedules.filter((s) => s.teacherId === selectedTeacher.id)
    : input.schedules;
  const inScope = selectedTeacher ? [selectedTeacher] : input.teachers;
  const teacherIds = inScope.map((t) => t.id);
  const dashboard = buildDashboardAnalytics({
    schedules,
    reports: input.reports,
    teacherIds,
    startStr: analyticsRange.startStr,
    endStr: analyticsRange.endStr,
    todayStr: input.todayStr,
    holidayDates: input.holidayDates,
  });

  const scopeNote = selectedTeacher ? `עבור ${selectedTeacher.name}. ` : '';
  const rangeNote = analyticsRange.isDefault
    ? 'לא נבחר תאריך בסינון, ולכן המעקב הוא על שנת הלימודים עד היום. '
    : '';
  const analytics: ReportAnalyticsSummary = {
    startStr: analyticsRange.startStr,
    endStr: analyticsRange.endStr,
    rangeLabel: rangeLabel(analyticsRange.startStr, analyticsRange.endStr),
    isDefaultRange: analyticsRange.isDefault,
    expected: dashboard.periodTotals.expected,
    reported: dashboard.periodTotals.reported,
    unreported: dashboard.periodTotals.unreported,
    compliancePct: dashboard.periodTotals.compliancePct,
    note: `${rangeNote}${scopeNote}מחושב לפי שיעורים שהיו אמורים להתקיים בטווח, אחרי חופשות ומועד התחלת השיבוץ. סינון הסטטוס והחיפוש משפיע על כרטיסי הדיווחים ועל טבלת הדיווחים, לא על המעקב.`,
  };

  const scopeIds = new Set(teacherIds);
  const teachers = inScope
    .map((teacher) => {
      const stats = dashboard.teacherCompliance.get(teacher.id);
      const filtered = filteredByTeacher.get(teacher.id);
      const expected = stats?.expected ?? 0;
      return {
        id: teacher.id,
        name: teacher.name,
        active: teacher.active,
        expected,
        reported: stats?.reported ?? 0,
        completed: stats?.completed ?? 0,
        missed: stats?.missed ?? 0,
        unreported: stats?.unreported ?? 0,
        compliancePct: expected === 0 ? null : (stats?.compliancePct ?? null),
        filteredCount: (filtered?.completed ?? 0) + (filtered?.missed ?? 0),
      };
    })
    .filter((row) => {
      if (selectedTeacher) return true;
      return (row.expected ?? 0) > 0 || row.filteredCount > 0 || (row.unreported ?? 0) > 0;
    });

  const unreportedByTeacher = new Map(teachers.map((t) => [t.id, t.unreported ?? 0]));
  const missingLessons: MissingLessonExportRow[] = [];
  for (const slot of dashboard.dueSlots) {
    if (!scopeIds.has(slot.teacherId)) continue;
    if (dashboard.reportIndex.has(`${slot.scheduleId}|${slot.date}`)) continue;
    const schedule = scheduleById.get(slot.scheduleId);
    const teacher = teacherById.get(slot.teacherId);
    missingLessons.push({
      date: slot.date,
      dateLabel: formatHebrewDateShort(slot.date),
      teacherId: slot.teacherId,
      teacherName: teacher?.name || '-',
      day: schedule?.day || '-',
      hour: schedule ? formatHourSlot(schedule.hour) : '-',
      subject: schedule?.subject || '-',
      studentsLabel: schedule ? getScheduleDisplayLabel(schedule, input.students) : 'נמחק',
    });
  }
  missingLessons.sort((a, b) => {
    const gap = (unreportedByTeacher.get(b.teacherId) ?? 0) - (unreportedByTeacher.get(a.teacherId) ?? 0);
    if (gap !== 0) return gap;
    const byName = compareHebrewNames(a.teacherName, b.teacherName);
    if (byName !== 0) return byName;
    if (a.date !== b.date) return a.date < b.date ? -1 : 1;
    const hourOf = (label: string) => {
      const n = Number(label.replace(/[^\d]/g, ''));
      return Number.isFinite(n) ? n : 99;
    };
    return hourOf(a.hour) - hourOf(b.hour);
  });

  teachers.sort((a, b) => {
    if (a.active !== b.active) return a.active ? -1 : 1;
    if (a.compliancePct == null && b.compliancePct != null) return 1;
    if (a.compliancePct != null && b.compliancePct == null) return -1;
    if (a.compliancePct != null && b.compliancePct != null && a.compliancePct !== b.compliancePct) {
      return a.compliancePct - b.compliancePct;
    }
    return compareHebrewNames(a.name, b.name);
  });

  const missingTeachers = teachers
    .filter((row) => (row.unreported ?? 0) > 0)
    .sort((a, b) => {
      const gap = (b.unreported ?? 0) - (a.unreported ?? 0);
      if (gap !== 0) return gap;
      return compareHebrewNames(a.name, b.name);
    });

  return {
    title: 'מעקב פרטני',
    organization: REPORT_EXPORT_ORG,
    filename: `דיווחים_${generatedDateStr}.xlsx`,
    generatedOnLabel: `${formatHebrewDateLong(generatedDateStr)} ${generatedTime}`,
    filters,
    filteredCount: reportRows.length,
    completedCount,
    missedCount,
    analytics,
    teacherTableMode,
    teachers,
    missingTeachers,
    missingLessons,
    reports: reportRows,
  };
}
