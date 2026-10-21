import { Report, Schedule, Student, Teacher } from '../types';
import { formatHebrewDateShort, formatHourSlot } from './date-format';
import { compareHebrewClassNames } from './grade-promotion';

/** Hebrew alphabetical order for person names (א–ב). */
export function compareHebrewNames(a: string, b: string): number {
  return a.trim().localeCompare(b.trim(), 'he');
}

export function sortByHebrewName<T extends { name: string }>(items: T[]): T[] {
  return [...items].sort((a, b) => compareHebrewNames(a.name, b.name));
}

export function getStudentById(students: Student[], id: string): Student | undefined {
  return students.find((s) => s.id === id);
}

export function formatStudentNames(studentIds: string[], students: Student[]): string {
  if (studentIds.length === 0) return '';
  const names = studentIds
    .map((id) => getStudentById(students, id)?.name)
    .filter((n): n is string => Boolean(n));
  return names.join(', ');
}

export function getScheduleDisplayLabel(schedule: Schedule, students: Student[]): string {
  if (schedule.lessonType === 'flexible') {
    return 'שיעור גמיש';
  }
  if (schedule.studentIds && schedule.studentIds.length > 0) {
    const formatted = formatStudentNames(schedule.studentIds, students);
    return formatted || schedule.studentName;
  }
  return schedule.studentName;
}

export function getReportAttendedLabel(
  report: Report,
  schedule: Schedule | undefined,
  students: Student[],
): string {
  if (report.status !== 'completed') return '';
  if (report.attendedStudentIds && report.attendedStudentIds.length > 0) {
    return formatStudentNames(report.attendedStudentIds, students);
  }
  if (schedule) {
    return getScheduleDisplayLabel(schedule, students);
  }
  return '';
}

export function getLastAttendedStudentIds(
  scheduleId: string,
  reports: Report[],
): string[] {
  const completed = reports
    .filter((r) => r.scheduleId === scheduleId && r.status === 'completed')
    .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
  return completed[0]?.attendedStudentIds ?? [];
}

export function getUniqueClassNames(students: Student[]): string[] {
  const classes = new Set(students.filter((s) => s.active).map((s) => s.className.trim()));
  return Array.from(classes).sort((a, b) => compareHebrewClassNames(a, b));
}

export function buildStudentNameField(
  lessonType: 'fixed' | 'flexible',
  studentIds: string[],
  students: Student[],
): string {
  if (lessonType === 'flexible') return 'גמיש';
  const names = formatStudentNames(studentIds, students);
  return names.slice(0, 128);
}

export function reportInvolvesStudent(
  report: Report,
  schedule: Schedule | undefined,
  studentId: string,
): boolean {
  if (report.status !== 'completed') return false;
  if (report.attendedStudentIds?.includes(studentId)) return true;
  if (!report.attendedStudentIds?.length && schedule?.studentIds?.includes(studentId)) {
    return true;
  }
  return false;
}

export interface StudentLessonEntry {
  reportId: string;
  date: string;
  status: 'completed' | 'missed';
  hour: string;
  subject: string;
  teacherName: string;
  scheduleDay: string;
  text: string;
}

export interface StudentFixedSchedule {
  scheduleId: string;
  day: string;
  hour: string;
  subject: string;
  teacherName: string;
}

export interface StudentLessonSummary {
  completedCount: number;
  missedCount: number;
  totalCount: number;
  fixedSchedules: StudentFixedSchedule[];
  lessons: StudentLessonEntry[];
}

export function getStudentLessonDetails(params: {
  studentId: string;
  reports: Report[];
  schedules: Schedule[];
  teachers: Teacher[];
  startStr?: string;
  endStr?: string;
}): StudentLessonSummary {
  const { studentId, reports, schedules, teachers, startStr, endStr } = params;
  const scheduleById = new Map(schedules.map((s) => [s.id, s]));
  const teacherById = new Map(teachers.map((t) => [t.id, t]));

  const fixedSchedules: StudentFixedSchedule[] = schedules
    .filter((s) => s.studentIds?.includes(studentId))
    .map((s) => ({
      scheduleId: s.id,
      day: s.day,
      hour: s.hour,
      subject: s.subject,
      teacherName: teacherById.get(s.teacherId)?.name ?? '—',
    }))
    .sort((a, b) => a.day.localeCompare(b.day, 'he') || a.hour.localeCompare(b.hour));

  const lessons: StudentLessonEntry[] = [];
  for (const report of reports) {
    if (startStr && report.date < startStr) continue;
    if (endStr && report.date > endStr) continue;

    const schedule = scheduleById.get(report.scheduleId);
    const involves =
      reportInvolvesStudent(report, schedule, studentId) ||
      (report.status === 'missed' && schedule?.studentIds?.includes(studentId));

    if (!involves) continue;

    lessons.push({
      reportId: report.id,
      date: report.date,
      status: report.status,
      hour: schedule?.hour ?? '—',
      subject: schedule?.subject ?? '—',
      teacherName: teacherById.get(report.teacherId)?.name ?? '—',
      scheduleDay: schedule?.day ?? '—',
      text: report.text,
    });
  }

  lessons.sort((a, b) => b.date.localeCompare(a.date) || b.reportId.localeCompare(a.reportId));

  const completedCount = lessons.filter((l) => l.status === 'completed').length;
  const missedCount = lessons.filter((l) => l.status === 'missed').length;

  return {
    completedCount,
    missedCount,
    totalCount: lessons.length,
    fixedSchedules,
    lessons,
  };
}

export interface ReceivedStudentRecord {
  student: Student;
  completedCount: number;
  missedCount: number;
  lessons: StudentLessonEntry[];
  /** Newest completed lesson, if the student actually received one. */
  lastCompleted: StudentLessonEntry | null;
}

function studentIdsOnReport(report: Report, schedule: Schedule | undefined): string[] {
  if (report.status === 'completed') {
    if (report.attendedStudentIds?.length) return report.attendedStudentIds;
    return schedule?.studentIds ?? [];
  }
  if (report.status === 'missed') return schedule?.studentIds ?? [];
  return [];
}

/** Students who received at least one completed private lesson, with their full documented history. */
export function indexReceivedStudents(params: {
  students: Student[];
  reports: Report[];
  schedules: Schedule[];
  teachers: Teacher[];
}): ReceivedStudentRecord[] {
  const { students, reports, schedules, teachers } = params;
  const studentById = new Map(students.map((s) => [s.id, s]));
  const scheduleById = new Map(schedules.map((s) => [s.id, s]));
  const teacherById = new Map(teachers.map((t) => [t.id, t]));
  const lessonsByStudent = new Map<string, StudentLessonEntry[]>();

  for (const report of reports) {
    const schedule = scheduleById.get(report.scheduleId);
    const ids = [...new Set(studentIdsOnReport(report, schedule))];
    if (ids.length === 0) continue;
    const entry: StudentLessonEntry = {
      reportId: report.id,
      date: report.date,
      status: report.status,
      hour: schedule?.hour ?? '—',
      subject: schedule?.subject ?? '—',
      teacherName: teacherById.get(report.teacherId)?.name ?? '—',
      scheduleDay: schedule?.day ?? '—',
      text: report.text,
    };
    for (const studentId of ids) {
      if (!studentById.has(studentId)) continue;
      const bucket = lessonsByStudent.get(studentId);
      if (bucket) bucket.push(entry);
      else lessonsByStudent.set(studentId, [entry]);
    }
  }

  const records: ReceivedStudentRecord[] = [];
  for (const [studentId, lessons] of lessonsByStudent) {
    const student = studentById.get(studentId);
    if (!student) continue;
    lessons.sort((a, b) => b.date.localeCompare(a.date) || b.reportId.localeCompare(a.reportId));
    const completedCount = lessons.filter((l) => l.status === 'completed').length;
    if (completedCount === 0) continue;
    records.push({
      student,
      completedCount,
      missedCount: lessons.length - completedCount,
      lessons,
      lastCompleted: lessons.find((l) => l.status === 'completed') ?? null,
    });
  }

  records.sort((a, b) => {
    const byName = compareHebrewNames(a.student.name, b.student.name);
    if (byName !== 0) return byName;
    return compareHebrewClassNames(a.student.className, b.student.className);
  });
  return records;
}

export function countStudentCompletedLessons(
  studentId: string,
  reports: Report[],
  schedules: Schedule[],
): number {
  const scheduleById = new Map(schedules.map((s) => [s.id, s]));
  return reports.filter((r) =>
    reportInvolvesStudent(r, scheduleById.get(r.scheduleId), studentId),
  ).length;
}

export interface StudentLessonExportRow {
  'שם תלמיד': string;
  'כיתה': string;
  'פעיל': string;
  'תאריך': string;
  'יום': string;
  'שעה': string;
  'מקצוע': string;
  'מורה': string;
  'סטטוס': string;
  'פירוט': string;
}

export interface StudentLessonSummaryExportRow {
  'שם תלמיד': string;
  'כיתה': string;
  'פעיל': string;
  'שעות שהתקיימו': number;
  'שעות שבוטלו': number;
  'סה״כ שיעורים': number;
}

/** One row per documented private lesson, plus a per-student summary. Students with no lessons are omitted. */
export function buildStudentPrivateLessonExport(params: {
  students: Student[];
  reports: Report[];
  schedules: Schedule[];
  teachers: Teacher[];
  startStr?: string;
  endStr?: string;
}): { lessons: StudentLessonExportRow[]; summary: StudentLessonSummaryExportRow[] } {
  const lessons: StudentLessonExportRow[] = [];
  const summary: StudentLessonSummaryExportRow[] = [];

  const ordered = [...params.students].sort((a, b) => {
    const byName = compareHebrewNames(a.name, b.name);
    if (byName !== 0) return byName;
    return compareHebrewClassNames(a.className, b.className);
  });

  for (const student of ordered) {
    const details = getStudentLessonDetails({
      studentId: student.id,
      reports: params.reports,
      schedules: params.schedules,
      teachers: params.teachers,
      startStr: params.startStr,
      endStr: params.endStr,
    });
    if (details.lessons.length === 0) continue;

    summary.push({
      'שם תלמיד': student.name,
      'כיתה': student.className,
      'פעיל': student.active ? 'כן' : 'לא',
      'שעות שהתקיימו': details.completedCount,
      'שעות שבוטלו': details.missedCount,
      'סה״כ שיעורים': details.totalCount,
    });

    for (const lesson of details.lessons) {
      const hour = lesson.hour && lesson.hour !== '—' ? formatHourSlot(lesson.hour) : '—';
      lessons.push({
        'שם תלמיד': student.name,
        'כיתה': student.className,
        'פעיל': student.active ? 'כן' : 'לא',
        'תאריך': formatHebrewDateShort(lesson.date),
        'יום': lesson.scheduleDay,
        'שעה': hour,
        'מקצוע': lesson.subject,
        'מורה': lesson.teacherName,
        'סטטוס': lesson.status === 'completed' ? 'התקיים' : 'בוטל',
        'פירוט': lesson.text || '',
      });
    }
  }

  return { lessons, summary };
}
