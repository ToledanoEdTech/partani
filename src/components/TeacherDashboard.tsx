import React, { useEffect, useMemo, useState } from 'react';
import {
  BookOpen, Calendar, CheckCircle, XCircle, FileText, Loader2, ChevronLeft, ChevronRight,
} from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import { Teacher, Schedule, Report, Student, HolidayPeriod } from '../types';
import StudentPicker from './StudentPicker';
import Modal from './Modal';
import { addReport, updateReport } from '../lib/db';
import {
  getLastAttendedStudentIds,
  getReportAttendedLabel,
  getScheduleDisplayLabel,
} from '../lib/students';
import {
  buildHolidayDateSet,
  findHolidayForDate,
  isHolidayDate,
} from '../lib/holidays';
import {
  addDaysToDateStr,
  calendarDateStr,
  DAY_MAP,
  getDayOfWeekForDateStr,
  getWeekStartDateStr,
} from '../lib/lesson-stats';
import {
  findReportForLessonDate,
  findReportForScheduleWeek,
  getLessonDateForScheduleInWeek,
  resolveLessonDateForSave,
} from '../lib/report-matching';
import {
  formatHebrewDateLong,
  formatHebrewDateShort,
  formatHebrewMonthLabel,
  formatHourSlot,
  formatWeekRangeLabel,
} from '../lib/date-format';
import { getFirestoreUserMessage } from '../lib/firestore-errors';
import { tabTransition, tabVariants } from './motion';

const dayMapReverse: Record<string, number> = {
  ראשון: 0, שני: 1, שלישי: 2, רביעי: 3, חמישי: 4, שישי: 5, שבת: 6,
};

const MISS_REASON_PRESETS = ['תלמיד לא הגיע', 'חג / חופשה', 'מחלה', 'ביטול מנהלי'] as const;

const weekAnchorDate = (dateStr: string) => new Date(`${dateStr}T12:00:00`);

type SlotItem = {
  slot: Schedule;
  date: string;
  report?: Report;
  holiday?: HolidayPeriod;
};

type DayCellStatus = 'empty' | 'holiday' | 'pending' | 'done' | 'missed' | 'mixed';

function dayCellStatus(items: SlotItem[]): DayCellStatus {
  if (items.length === 0) return 'empty';
  const actionable = items.filter((i) => !i.holiday || i.report);
  const onlyHoliday = items.every((i) => i.holiday && !i.report);
  if (onlyHoliday) return 'holiday';
  const pending = actionable.filter((i) => !i.report && !i.holiday);
  if (pending.length > 0) return 'pending';
  const reports = actionable.filter((i) => i.report);
  if (reports.length === 0) return 'holiday';
  const allCompleted = reports.every((i) => i.report!.status === 'completed');
  const allMissed = reports.every((i) => i.report!.status === 'missed');
  if (allCompleted) return 'done';
  if (allMissed) return 'missed';
  return 'mixed';
}

const MiniCalendar = ({
  selectedSchedule,
  reports,
  selectedDateStr,
  onDateSelect,
  holidayDates,
}: {
  selectedSchedule: Schedule;
  reports: Report[];
  selectedDateStr: string;
  onDateSelect: (d: string) => void;
  holidayDates: Set<string>;
}) => {
  const [currentMonthDate, setCurrentMonthDate] = useState(new Date(selectedDateStr));

  useEffect(() => {
    setCurrentMonthDate(new Date(selectedDateStr));
  }, [selectedDateStr, selectedSchedule.id]);

  const year = currentMonthDate.getFullYear();
  const month = currentMonthDate.getMonth();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const firstDayOfMonth = new Date(year, month, 1).getDay();

  const daysRender: React.ReactNode[] = [];
  for (let i = 0; i < firstDayOfMonth; i++) {
    daysRender.push(<div key={`empty-${i}`} className="p-2" />);
  }

  const schedDayNum = dayMapReverse[selectedSchedule.day];

  for (let d = 1; d <= daysInMonth; d++) {
    const dateStr = calendarDateStr(year, month, d);
    const isSelected = selectedDateStr === dateStr;
    const isScheduleDay = getDayOfWeekForDateStr(dateStr) === schedDayNum;
    const existingReport = isScheduleDay
      ? findReportForLessonDate(reports, selectedSchedule, dateStr)
      : undefined;
    const onHoliday = isScheduleDay && isHolidayDate(dateStr, holidayDates);

    let baseClass =
      'press h-8 w-8 rounded-full flex items-center justify-center text-xs font-bold transition-all duration-150 cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-400 ';

    if (isSelected) baseClass += 'ring-2 ring-blue-500 ring-offset-1 ';
    if (onHoliday) {
      baseClass += 'bg-amber-200 text-amber-950 hover:bg-amber-300';
    } else if (existingReport) {
      baseClass +=
        existingReport.status === 'completed'
          ? 'bg-green-500 text-white hover:bg-green-600'
          : 'bg-red-500 text-white hover:bg-red-600';
    } else if (isScheduleDay) {
      baseClass += 'bg-blue-100 text-blue-800 hover:bg-blue-200';
    } else {
      baseClass += 'hover:bg-gray-100 text-gray-700';
    }

    daysRender.push(
      <div key={d} className="flex flex-col items-center justify-center p-1 relative">
        <button
          type="button"
          disabled={!isScheduleDay || onHoliday}
          onClick={() => isScheduleDay && !onHoliday && onDateSelect(dateStr)}
          className={`${baseClass}${
            !isScheduleDay
              ? ' opacity-30 cursor-not-allowed hover:bg-transparent'
              : onHoliday
                ? ' cursor-not-allowed'
                : ''
          }`}
          title={
            onHoliday
              ? 'יום חופשה — השיעור מבוטל'
              : existingReport
                ? 'כבר דווח'
                : isScheduleDay
                  ? 'יום שיעור — לחץ לבחירת תאריך'
                  : 'לא יום שיעור'
          }
        >
          {d}
        </button>
      </div>,
    );
  }

  return (
    <div className="bg-gray-50 border border-gray-100 rounded-xl p-3 select-none">
      <div className="flex justify-between items-center mb-3 text-sm font-bold">
        <button type="button" onClick={() => setCurrentMonthDate(new Date(year, month - 1, 1))} className="px-3 py-1 hover:bg-white rounded-lg">
          <ChevronRight className="w-4 h-4" />
        </button>
        <span>
          {formatHebrewMonthLabel(year, month)}
        </span>
        <button type="button" onClick={() => setCurrentMonthDate(new Date(year, month + 1, 1))} className="px-3 py-1 hover:bg-white rounded-lg">
          <ChevronLeft className="w-4 h-4" />
        </button>
      </div>
      <div className="grid grid-cols-7 text-center text-[10px] font-bold text-gray-400 mb-1">
        <div>א׳</div><div>ב׳</div><div>ג׳</div><div>ד׳</div><div>ה׳</div><div>ו׳</div><div>ש׳</div>
      </div>
      <div className="grid grid-cols-7">{daysRender}</div>
      <div className="mt-3 text-[10px] flex justify-center gap-3 text-gray-500 flex-wrap">
        <div className="flex items-center gap-1">
          <div className="w-2 h-2 rounded-full bg-blue-100 border border-blue-200" /> שיעור
        </div>
        <div className="flex items-center gap-1">
          <div className="w-2 h-2 rounded-full bg-amber-300" /> חופשה
        </div>
        <div className="flex items-center gap-1">
          <div className="w-2 h-2 rounded-full bg-green-500" /> בוצע
        </div>
        <div className="flex items-center gap-1">
          <div className="w-2 h-2 rounded-full bg-red-500" /> בוטל
        </div>
      </div>
    </div>
  );
};

const MonthReportCalendar = ({
  year,
  month,
  schedules,
  reports,
  holidays,
  selectedDateStr,
  onSelectDay,
  onPrevMonth,
  onNextMonth,
}: {
  year: number;
  month: number;
  schedules: Schedule[];
  reports: Report[];
  holidays: HolidayPeriod[];
  selectedDateStr: string | null;
  onSelectDay: (dateStr: string) => void;
  onPrevMonth: () => void;
  onNextMonth: () => void;
}) => {
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const firstDayOfMonth = new Date(year, month, 1).getDay();
  const todayStr = calendarDateStr(
    new Date().getFullYear(),
    new Date().getMonth(),
    new Date().getDate(),
  );

  const cells: React.ReactNode[] = [];
  for (let i = 0; i < firstDayOfMonth; i++) {
    cells.push(<div key={`empty-${i}`} className="aspect-square" />);
  }

  for (let d = 1; d <= daysInMonth; d++) {
    const dateStr = calendarDateStr(year, month, d);
    const dow = getDayOfWeekForDateStr(dateStr);
    const items: SlotItem[] = schedules
      .filter((slot) => DAY_MAP[slot.day] === dow)
      .map((slot) => ({
        slot,
        date: dateStr,
        report: findReportForLessonDate(reports, slot, dateStr),
        holiday: findHolidayForDate(dateStr, holidays),
      }));
    const status = dayCellStatus(items);
    const hasLessons = items.length > 0;
    const isSelected = selectedDateStr === dateStr;
    const isToday = dateStr === todayStr;

    let dayClass =
      'press relative w-full aspect-square rounded-xl flex flex-col items-center justify-center text-sm font-bold transition-all duration-150 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-400 ';

    if (isSelected) dayClass += 'ring-2 ring-blue-500 ring-offset-1 ';
    if (isToday && !isSelected) dayClass += 'ring-1 ring-slate-300 ';

    switch (status) {
      case 'pending':
        dayClass += 'bg-blue-100 text-blue-900 hover:bg-blue-200';
        break;
      case 'done':
        dayClass += 'bg-green-500 text-white hover:bg-green-600';
        break;
      case 'missed':
        dayClass += 'bg-red-500 text-white hover:bg-red-600';
        break;
      case 'mixed':
        dayClass += 'bg-emerald-100 text-emerald-900 hover:bg-emerald-200';
        break;
      case 'holiday':
        dayClass += 'bg-amber-200 text-amber-950 hover:bg-amber-300';
        break;
      default:
        dayClass += hasLessons
          ? 'bg-blue-50 text-blue-800 hover:bg-blue-100'
          : 'text-gray-400 hover:bg-gray-50';
    }

    const pendingCount = items.filter((i) => !i.report && !i.holiday).length;

    cells.push(
      <button
        key={d}
        type="button"
        onClick={() => onSelectDay(dateStr)}
        className={dayClass}
        title={
          !hasLessons
            ? 'אין שיעורים'
            : status === 'holiday'
              ? 'יום חופשה'
              : status === 'pending'
                ? `${pendingCount} לדיווח`
                : status === 'done'
                  ? 'דווח'
                  : status === 'missed'
                    ? 'בוטל'
                    : 'שיעורים'
        }
      >
        <span>{d}</span>
        {hasLessons && (
          <span
            className={`mt-0.5 h-1 w-1 rounded-full ${
              status === 'done' || status === 'missed' ? 'bg-white/80' : 'bg-current opacity-60'
            }`}
          />
        )}
      </button>,
    );
  }

  return (
    <div className="bg-white border border-gray-100 rounded-xl p-3 sm:p-4 select-none shadow-sm">
      <div className="flex justify-between items-center mb-3 text-sm font-bold text-gray-900">
        <button
          type="button"
          onClick={onPrevMonth}
          className="press p-2 hover:bg-gray-50 rounded-lg"
          aria-label="חודש קודם"
        >
          <ChevronRight className="w-5 h-5" />
        </button>
        <span>{formatHebrewMonthLabel(year, month)}</span>
        <button
          type="button"
          onClick={onNextMonth}
          className="press p-2 hover:bg-gray-50 rounded-lg"
          aria-label="חודש הבא"
        >
          <ChevronLeft className="w-5 h-5" />
        </button>
      </div>
      <div className="grid grid-cols-7 text-center text-[10px] font-bold text-gray-400 mb-1">
        <div>א׳</div><div>ב׳</div><div>ג׳</div><div>ד׳</div><div>ה׳</div><div>ו׳</div><div>ש׳</div>
      </div>
      <div className="grid grid-cols-7 gap-1">{cells}</div>
      <div className="mt-3 text-[10px] flex justify-center gap-3 text-gray-500 flex-wrap">
        <div className="flex items-center gap-1">
          <div className="w-2 h-2 rounded-full bg-blue-100 border border-blue-200" /> לדיווח
        </div>
        <div className="flex items-center gap-1">
          <div className="w-2 h-2 rounded-full bg-amber-300" /> חופשה
        </div>
        <div className="flex items-center gap-1">
          <div className="w-2 h-2 rounded-full bg-green-500" /> דווח
        </div>
        <div className="flex items-center gap-1">
          <div className="w-2 h-2 rounded-full bg-red-500" /> בוטל
        </div>
      </div>
    </div>
  );
};

export interface TeacherDashboardProps {
  teacher: Teacher;
  schedules: Schedule[];
  reports: Report[];
  students: Student[];
  holidays?: HolidayPeriod[];
  teacherTab: 'overview' | 'history';
  setTeacherTab: (tab: 'overview' | 'history') => void;
  isImpersonating?: boolean;
  onEndImpersonation?: () => void;
  onNotify: (message: string, type?: string) => void;
}

const TeacherDashboard: React.FC<TeacherDashboardProps> = ({
  teacher,
  schedules,
  reports,
  students,
  holidays = [],
  teacherTab,
  setTeacherTab,
  isImpersonating,
  onEndImpersonation,
  onNotify,
}) => {
  const [weekStart, setWeekStart] = useState<Date>(() =>
    weekAnchorDate(getWeekStartDateStr(new Date())),
  );
  const [reportViewMode, setReportViewMode] = useState<'week' | 'month'>('week');
  const [monthCursor, setMonthCursor] = useState(() => {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth(), 1);
  });
  const [selectedMonthDay, setSelectedMonthDay] = useState<string | null>(() =>
    calendarDateStr(new Date().getFullYear(), new Date().getMonth(), new Date().getDate()),
  );
  const [selectedSchedule, setSelectedSchedule] = useState<Schedule | null>(null);
  const [editingReport, setEditingReport] = useState<Report | null>(null);
  const [reportStatus, setReportStatus] = useState<'completed' | 'missed'>('completed');
  const [reportText, setReportText] = useState('');
  const [reportDate, setReportDate] = useState('');
  const [reportAttendedIds, setReportAttendedIds] = useState<string[]>([]);
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [historyStatusFilter, setHistoryStatusFilter] = useState<'all' | 'completed' | 'missed'>('all');

  const weekStartStr = getWeekStartDateStr(weekStart);
  const isCurrentWeek = weekStartStr === getWeekStartDateStr(new Date());
  const monthYear = monthCursor.getFullYear();
  const monthIndex = monthCursor.getMonth();

  const isFlexibleAttendance = (sched: Schedule): boolean =>
    sched.lessonType === 'flexible' || !(sched.studentIds && sched.studentIds.length > 0);

  const getStudentsForAttendance = (sched: Schedule): Student[] =>
    isFlexibleAttendance(sched)
      ? students
      : students.filter((s) => (sched.studentIds || []).includes(s.id));

  const getExpectedStudentIds = (sched: Schedule): string[] => {
    if (isFlexibleAttendance(sched)) return [];
    return sched.studentIds || [];
  };

  const holidayDates = useMemo(() => buildHolidayDateSet(holidays), [holidays]);

  const weekSlots = useMemo(() => {
    const items = schedules.map((slot) => {
      const date = getLessonDateForScheduleInWeek(slot, weekStartStr);
      const report = findReportForScheduleWeek(reports, slot, weekStartStr);
      const holiday = findHolidayForDate(date, holidays);
      return { slot, date, report, holiday };
    });
    items.sort((a, b) => {
      const aDone = Boolean(a.report || a.holiday);
      const bDone = Boolean(b.report || b.holiday);
      if (aDone !== bDone) return aDone ? 1 : -1;
      return a.date.localeCompare(b.date) || a.slot.hour.localeCompare(b.slot.hour, undefined, { numeric: true });
    });
    return items;
  }, [schedules, reports, weekStartStr, holidays]);

  const monthDaySlots = useMemo(() => {
    if (!selectedMonthDay) return [];
    const dow = getDayOfWeekForDateStr(selectedMonthDay);
    const items: SlotItem[] = schedules
      .filter((slot) => DAY_MAP[slot.day] === dow)
      .map((slot) => ({
        slot,
        date: selectedMonthDay,
        report: findReportForLessonDate(reports, slot, selectedMonthDay),
        holiday: findHolidayForDate(selectedMonthDay, holidays),
      }));
    items.sort((a, b) => {
      const aDone = Boolean(a.report || a.holiday);
      const bDone = Boolean(b.report || b.holiday);
      if (aDone !== bDone) return aDone ? 1 : -1;
      return a.slot.hour.localeCompare(b.slot.hour, undefined, { numeric: true });
    });
    return items;
  }, [selectedMonthDay, schedules, reports, holidays]);

  const pendingCount = weekSlots.filter((s) => !s.report && !s.holiday).length;
  const doneCount = weekSlots.filter((s) => s.report).length;
  const holidayCount = weekSlots.filter((s) => s.holiday && !s.report).length;

  const monthDayPending = monthDaySlots.filter((s) => !s.report && !s.holiday).length;
  const monthDayDone = monthDaySlots.filter((s) => s.report).length;
  const monthDayHoliday = monthDaySlots.filter((s) => s.holiday && !s.report).length;

  const filteredHistory = useMemo(() => {
    const sorted = [...reports].sort((a, b) => (b.timestamp || b.date).localeCompare(a.timestamp || a.date));
    if (historyStatusFilter === 'all') return sorted;
    return sorted.filter((r) => r.status === historyStatusFilter);
  }, [reports, historyStatusFilter]);

  const selectMonthDay = (dateStr: string) => {
    setSelectedMonthDay(dateStr);
    setWeekStart(weekAnchorDate(getWeekStartDateStr(weekAnchorDate(dateStr))));
    const d = weekAnchorDate(dateStr);
    setMonthCursor(new Date(d.getFullYear(), d.getMonth(), 1));
  };

  const switchToMonthView = () => {
    setReportViewMode('month');
    const anchor = weekStart;
    setMonthCursor(new Date(anchor.getFullYear(), anchor.getMonth(), 1));
    if (!selectedMonthDay) {
      const today = new Date();
      setSelectedMonthDay(calendarDateStr(today.getFullYear(), today.getMonth(), today.getDate()));
    }
  };

  const closeReportForm = () => {
    setSelectedSchedule(null);
    setEditingReport(null);
    setShowDatePicker(false);
    setReportText('');
    setReportAttendedIds([]);
  };

  const openReportForm = (slot: Schedule, dateStr: string, existing?: Report) => {
    setSelectedSchedule(slot);
    setEditingReport(existing ?? null);
    setReportDate(existing?.date || dateStr);
    setReportStatus(existing?.status || 'completed');
    setReportText(existing?.text || '');
    setShowDatePicker(false);

    if (existing?.status === 'completed' && existing.attendedStudentIds?.length) {
      setReportAttendedIds(existing.attendedStudentIds);
    } else {
      const expected = getExpectedStudentIds(slot);
      const lastIds = getLastAttendedStudentIds(slot.id, reports).filter((id) =>
        students.some((s) => s.id === id && s.active),
      );
      if (isFlexibleAttendance(slot) && lastIds.length > 0) {
        setReportAttendedIds(lastIds);
      } else if (expected.length > 0) {
        setReportAttendedIds(expected);
      } else {
        setReportAttendedIds([]);
      }
    }
  };

  const validateAttendance = (sched: Schedule): boolean => {
    if (reportStatus !== 'completed') return true;
    if (reportAttendedIds.length === 0) {
      onNotify('יש לסמן לפחות תלמיד אחד שנוכח בשיעור', 'error');
      return false;
    }
    if (!isFlexibleAttendance(sched)) {
      const invalid = reportAttendedIds.some((id) => !sched.studentIds!.includes(id));
      if (invalid) {
        onNotify('ניתן לסמן רק תלמידים המשויכים לשיעור', 'error');
        return false;
      }
    }
    return true;
  };

  const handleSubmitReport = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedSchedule || submitting) return;

    if (reportStatus === 'missed' && !reportText.trim()) {
      onNotify('נא לציין סיבת ביטול', 'error');
      return;
    }
    if (!validateAttendance(selectedSchedule)) return;

    const resolved = resolveLessonDateForSave(selectedSchedule, reportDate);
    if (resolved.ok === false) {
      onNotify(resolved.message, 'error');
      return;
    }
    const lessonDate = resolved.lessonDate;
    if (isHolidayDate(lessonDate, holidayDates)) {
      onNotify('לא ניתן לדווח על שיעור ביום חופשה — השיעור מבוטל', 'error');
      return;
    }
    const textToSave =
      reportText.trim() ||
      (reportStatus === 'completed' ? 'השיעור התקיים' : '');

    const payload = {
      scheduleId: selectedSchedule.id,
      teacherId: selectedSchedule.teacherId,
      teacherEmail: selectedSchedule.teacherEmail,
      date: lessonDate,
      status: reportStatus,
      text: textToSave,
      timestamp: new Date().toISOString(),
      ...(reportStatus === 'completed'
        ? { attendedStudentIds: reportAttendedIds }
        : { attendedStudentIds: [] }),
    };

    setSubmitting(true);
    try {
      if (editingReport) {
        await updateReport(editingReport.id, payload);
        onNotify('הדיווח עודכן בהצלחה');
      } else {
        const existing = findReportForLessonDate(reports, selectedSchedule, lessonDate);
        if (existing) {
          await updateReport(existing.id, payload);
          onNotify('הדיווח עודכן בהצלחה');
        } else {
          await addReport(payload);
          onNotify('הדיווח נקלט בהצלחה. תודה!');
        }
      }
      closeReportForm();
    } catch (err) {
      onNotify(getFirestoreUserMessage(err) || 'שגיאה בשמירת הדיווח', 'error');
    } finally {
      setSubmitting(false);
    }
  };

  const renderSlotCard = ({ slot, date, report, holiday }: SlotItem) => {
    const isPending = !report && !holiday;
    return (
      <div
        key={`${slot.id}-${date}`}
        className={`bg-white rounded-xl border p-4 shadow-sm transition-shadow ${
          holiday
            ? 'border-amber-200 bg-amber-50/40'
            : isPending
              ? 'border-blue-200 ring-1 ring-blue-50'
              : report?.status === 'completed'
                ? 'border-green-100'
                : 'border-red-100'
        }`}
      >
        <div className="flex flex-col gap-3">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2 mb-1.5">
              <span className="text-sm font-bold text-gray-900">
                {formatHebrewDateLong(date, slot.day)}
              </span>
              <span className="text-xs font-bold text-blue-800 bg-blue-50 px-2 py-0.5 rounded-md">
                {formatHourSlot(slot.hour)}
              </span>
              <span
                className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${
                  slot.lessonType === 'flexible'
                    ? 'bg-amber-100 text-amber-900'
                    : 'bg-slate-100 text-slate-700'
                }`}
              >
                {slot.lessonType === 'flexible' ? 'גמיש' : 'קבוע'}
              </span>
            </div>
            <h4 className="font-bold text-gray-900 text-base break-words">
              {slot.lessonType === 'flexible'
                ? 'שיעור גמיש'
                : getScheduleDisplayLabel(slot, students)}
            </h4>
            <p className="text-xs text-gray-500 mt-0.5">{slot.subject}</p>
          </div>

          <div className="flex flex-col sm:flex-row gap-2 sm:items-center">
            {holiday && !report ? (
              <span className="inline-flex items-center gap-1.5 text-xs font-bold text-amber-900">
                <Calendar className="w-4 h-4" />
                מבוטל — חופשה{holiday.name ? ` (${holiday.name})` : ''}
              </span>
            ) : report ? (
              <>
                <span
                  className={`inline-flex items-center gap-1.5 text-xs font-bold ${
                    report.status === 'completed' ? 'text-green-700' : 'text-red-600'
                  }`}
                >
                  {report.status === 'completed' ? (
                    <CheckCircle className="w-4 h-4" />
                  ) : (
                    <XCircle className="w-4 h-4" />
                  )}
                  {report.status === 'completed' ? 'דווח — התקיים' : 'דווח — בוטל'}
                </span>
                <button
                  type="button"
                  onClick={() => openReportForm(slot, date, report)}
                  className="press sm:mr-auto px-4 py-2.5 rounded-lg text-sm font-bold bg-gray-100 text-gray-800 hover:bg-gray-200 w-full sm:w-auto"
                >
                  ערוך דיווח
                </button>
              </>
            ) : (
              <button
                type="button"
                onClick={() => openReportForm(slot, date)}
                className="press w-full sm:w-auto sm:mr-auto px-5 py-3 rounded-xl text-sm font-bold bg-blue-600 text-white hover:bg-blue-700 shadow-sm"
              >
                דווח עכשיו
              </button>
            )}
          </div>
        </div>
      </div>
    );
  };

  const formOpen = !!selectedSchedule;

  return (
    <div className="py-5 sm:py-8 px-3 sm:px-4 max-w-3xl mx-auto space-y-5 sm:space-y-6">
      {isImpersonating && (
        <div className="bg-amber-50 border border-amber-200 p-4 rounded-xl flex flex-col sm:flex-row justify-between items-start sm:items-center text-amber-900 gap-3">
          <span className="text-sm">
            <strong>מצב צפייה כמורה:</strong> פועל כ־{teacher.name}
          </span>
          {onEndImpersonation && (
            <button
              onClick={onEndImpersonation}
              className="press px-4 py-2 bg-amber-500 hover:bg-amber-600 text-[#111827] font-bold rounded-lg text-sm w-full sm:w-auto"
            >
              סיום צפייה
            </button>
          )}
        </div>
      )}

      <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-3">
        <div>
          <p className="text-xs font-bold text-blue-800 mb-0.5">שלום</p>
          <h2 className="text-xl sm:text-2xl font-bold text-gray-900 tracking-tight">{teacher.name}</h2>
          {teacher.subject && (
            <p className="text-gray-500 text-sm mt-0.5">{teacher.subject}</p>
          )}
        </div>
      </div>

      {/* Visible tabs */}
      <div className="flex gap-1 p-1 bg-white rounded-xl border border-gray-100 shadow-sm" role="tablist">
        <button
          type="button"
          role="tab"
          aria-selected={teacherTab === 'overview'}
          onClick={() => setTeacherTab('overview')}
          className={`press flex-1 flex items-center justify-center gap-2 py-2.5 px-3 rounded-lg text-sm font-bold transition-colors ${
            teacherTab === 'overview'
              ? 'bg-blue-600 text-white shadow-sm'
              : 'text-gray-600 hover:bg-gray-50'
          }`}
        >
          <Calendar className="w-4 h-4 shrink-0" />
          דיווח
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={teacherTab === 'history'}
          onClick={() => setTeacherTab('history')}
          className={`press flex-1 flex items-center justify-center gap-2 py-2.5 px-3 rounded-lg text-sm font-bold transition-colors ${
            teacherTab === 'history'
              ? 'bg-blue-600 text-white shadow-sm'
              : 'text-gray-600 hover:bg-gray-50'
          }`}
        >
          <FileText className="w-4 h-4 shrink-0" />
          היסטוריה
        </button>
      </div>

      <AnimatePresence mode="wait" initial={false}>
        {teacherTab === 'overview' && (
          <motion.div
            key="teacher-overview"
            variants={tabVariants}
            initial="initial"
            animate="enter"
            exit="exit"
            transition={tabTransition}
            className="space-y-4"
          >
            {/* Header + view toggle */}
            <div className="bg-slate-800 text-white rounded-xl p-3 sm:p-4 flex flex-col gap-3 shadow-sm">
              <div className="flex items-center gap-2">
                <Calendar className="w-5 h-5 text-amber-400 shrink-0" />
                <h3 className="font-bold text-base">השיעורים שלי</h3>
                <span className="text-xs text-white/60 mr-auto">{schedules.length} משבצות</span>
              </div>

              <div className="flex gap-1 p-1 bg-white/10 rounded-lg border border-white/15" role="tablist" aria-label="תצוגת דיווח">
                <button
                  type="button"
                  role="tab"
                  aria-selected={reportViewMode === 'week'}
                  onClick={() => setReportViewMode('week')}
                  className={`press flex-1 py-2 rounded-md text-xs font-bold transition-colors ${
                    reportViewMode === 'week'
                      ? 'bg-white text-slate-900 shadow-sm'
                      : 'text-white/80 hover:bg-white/10'
                  }`}
                >
                  שבוע
                </button>
                <button
                  type="button"
                  role="tab"
                  aria-selected={reportViewMode === 'month'}
                  onClick={switchToMonthView}
                  className={`press flex-1 py-2 rounded-md text-xs font-bold transition-colors ${
                    reportViewMode === 'month'
                      ? 'bg-white text-slate-900 shadow-sm'
                      : 'text-white/80 hover:bg-white/10'
                  }`}
                >
                  חודש
                </button>
              </div>

              {reportViewMode === 'week' && (
                <div className="flex items-center gap-2 bg-white/10 p-1 rounded-lg border border-white/15">
                  <button
                    type="button"
                    onClick={() =>
                      setWeekStart((prev) =>
                        weekAnchorDate(addDaysToDateStr(getWeekStartDateStr(prev), -7)),
                      )
                    }
                    className="press p-2 hover:bg-white/15 rounded-lg shrink-0"
                    aria-label="שבוע קודם"
                  >
                    <ChevronRight className="w-5 h-5" />
                  </button>
                  <div className="flex-1 text-center min-w-0">
                    <p className="font-bold text-sm truncate">{formatWeekRangeLabel(weekStartStr)}</p>
                    {isCurrentWeek && (
                      <p className="text-[10px] text-amber-300 font-bold">השבוע הנוכחי</p>
                    )}
                  </div>
                  <button
                    type="button"
                    onClick={() =>
                      setWeekStart((prev) =>
                        weekAnchorDate(addDaysToDateStr(getWeekStartDateStr(prev), 7)),
                      )
                    }
                    className="press p-2 hover:bg-white/15 rounded-lg shrink-0"
                    aria-label="שבוע הבא"
                  >
                    <ChevronLeft className="w-5 h-5" />
                  </button>
                </div>
              )}
            </div>

            {schedules.length === 0 ? (
              <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-8 text-center space-y-2">
                <BookOpen className="w-10 h-10 mx-auto text-gray-200" />
                <p className="font-bold text-gray-700">לא שויכו לך שיעורים פרטניים</p>
                <p className="text-sm text-gray-500">פנה למנהל המערכת לשיבוץ שעות.</p>
              </div>
            ) : reportViewMode === 'week' ? (
              <>
                <div
                  className={`rounded-xl border px-4 py-3 text-sm font-bold ${
                    pendingCount > 0
                      ? 'bg-amber-50 border-amber-200 text-amber-950'
                      : 'bg-green-50 border-green-200 text-green-900'
                  }`}
                >
                  {pendingCount > 0 ? (
                    <span>
                      יש לך {pendingCount} שיעורים לדיווח בשבוע זה
                      {doneCount > 0 && (
                        <span className="font-normal text-amber-800/80"> · {doneCount} כבר דווחו</span>
                      )}
                      {holidayCount > 0 && (
                        <span className="font-normal text-amber-800/80"> · {holidayCount} בחופשה</span>
                      )}
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-2">
                      <CheckCircle className="w-4 h-4" />
                      {holidayCount > 0 && doneCount === 0
                        ? 'אין שיעורים לדיווח בשבוע זה (ימי חופשה)'
                        : 'כל השיעורים דווחו בשבוע זה'}
                    </span>
                  )}
                </div>
                <div className="space-y-3">{weekSlots.map(renderSlotCard)}</div>
              </>
            ) : (
              <>
                <MonthReportCalendar
                  year={monthYear}
                  month={monthIndex}
                  schedules={schedules}
                  reports={reports}
                  holidays={holidays}
                  selectedDateStr={selectedMonthDay}
                  onSelectDay={selectMonthDay}
                  onPrevMonth={() =>
                    setMonthCursor((prev) => new Date(prev.getFullYear(), prev.getMonth() - 1, 1))
                  }
                  onNextMonth={() =>
                    setMonthCursor((prev) => new Date(prev.getFullYear(), prev.getMonth() + 1, 1))
                  }
                />

                {selectedMonthDay ? (
                  <div className="space-y-3">
                    <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
                      <h4 className="font-bold text-gray-900 text-sm">
                        {formatHebrewDateLong(selectedMonthDay)}
                      </h4>
                      {monthDaySlots.length > 0 && (
                        <p className="text-xs text-gray-500 font-bold">
                          {monthDayPending > 0
                            ? `${monthDayPending} לדיווח`
                            : monthDayDone > 0
                              ? 'הכל דווח'
                              : monthDayHoliday > 0
                                ? 'חופשה'
                                : ''}
                          {monthDayDone > 0 && monthDayPending > 0 && (
                            <span className="font-normal"> · {monthDayDone} דווחו</span>
                          )}
                        </p>
                      )}
                    </div>

                    {monthDaySlots.length === 0 ? (
                      <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-6 text-center">
                        <p className="text-sm font-bold text-gray-500">אין שיעורים ביום זה</p>
                        <p className="text-xs text-gray-400 mt-1">בחר יום עם נקודה בלוח החודשי</p>
                      </div>
                    ) : (
                      monthDaySlots.map(renderSlotCard)
                    )}
                  </div>
                ) : (
                  <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-6 text-center">
                    <p className="text-sm font-bold text-gray-500">בחר יום בלוח כדי לראות שיעורים</p>
                  </div>
                )}
              </>
            )}
          </motion.div>
        )}

        {teacherTab === 'history' && (
          <motion.div
            key="teacher-history"
            variants={tabVariants}
            initial="initial"
            animate="enter"
            exit="exit"
            transition={tabTransition}
            className="space-y-4"
          >
            <div className="flex flex-wrap gap-2">
              {(
                [
                  { id: 'all' as const, label: 'הכל' },
                  { id: 'completed' as const, label: 'התקיים' },
                  { id: 'missed' as const, label: 'בוטל' },
                ] as const
              ).map((f) => (
                <button
                  key={f.id}
                  type="button"
                  onClick={() => setHistoryStatusFilter(f.id)}
                  className={`press px-3 py-1.5 rounded-lg text-xs font-bold border transition-colors ${
                    historyStatusFilter === f.id
                      ? 'bg-blue-600 text-white border-blue-600'
                      : 'bg-white text-gray-600 border-gray-200 hover:bg-gray-50'
                  }`}
                >
                  {f.label}
                </button>
              ))}
            </div>

            <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
              <div className="p-4 border-b border-gray-100">
                <h3 className="font-bold text-gray-900 flex items-center gap-2 text-sm sm:text-base">
                  <FileText className="w-5 h-5 text-blue-600 shrink-0" />
                  היסטוריית דיווחים
                </h3>
              </div>
              <div className="p-3 sm:p-4 min-h-[280px]">
                {filteredHistory.length === 0 ? (
                  <div className="text-center py-12 text-gray-400 space-y-1">
                    <p className="font-bold text-gray-500">אין דיווחים להצגה</p>
                    <p className="text-sm">דיווחים שתשלח יופיעו כאן</p>
                  </div>
                ) : (
                  <div className="grid gap-3">
                    {filteredHistory.map((rep) => {
                      const sched = schedules.find((s) => s.id === rep.scheduleId);
                      return (
                        <div
                          key={rep.id}
                          className="p-4 border border-gray-100 rounded-xl bg-gray-50/80 flex flex-col gap-3 min-w-0"
                        >
                          <div className="flex justify-between items-start gap-2">
                            <div className="min-w-0">
                              <h5 className="font-bold text-base text-gray-900 break-words">
                                {sched
                                  ? getReportAttendedLabel(rep, sched, students) ||
                                    getScheduleDisplayLabel(sched, students)
                                  : 'שיעור נמחק'}
                              </h5>
                              <p className="text-xs text-gray-500 mt-0.5 break-words">
                                {sched?.subject || '—'} · {formatHebrewDateShort(rep.date)}
                                {sched && ` · ${formatHourSlot(sched.hour)}`}
                              </p>
                            </div>
                            <span
                              className={`px-2.5 py-1 rounded-lg text-xs font-bold shrink-0 ${
                                rep.status === 'completed'
                                  ? 'bg-green-100 text-green-800'
                                  : 'bg-red-100 text-red-800'
                              }`}
                            >
                              {rep.status === 'completed' ? 'התקיים' : 'בוטל'}
                            </span>
                          </div>
                          {rep.text && (
                            <p className="text-sm text-gray-700 bg-white p-3 rounded-lg border border-gray-100 break-words">
                              {rep.text}
                            </p>
                          )}
                          {sched && (
                            <button
                              type="button"
                              onClick={() => {
                                setTeacherTab('overview');
                                setReportViewMode('week');
                                const weekOf = getWeekStartDateStr(new Date(`${rep.date}T12:00:00`));
                                setWeekStart(weekAnchorDate(weekOf));
                                openReportForm(sched, rep.date, rep);
                              }}
                              className="press self-start text-xs font-bold text-blue-700 hover:text-blue-900"
                            >
                              ערוך דיווח
                            </button>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Report form — bottom sheet on mobile, centered modal on desktop */}
      <Modal
        open={formOpen}
        onClose={closeReportForm}
        title={editingReport ? 'עריכת דיווח' : 'דיווח שיעור'}
        maxWidthClassName="max-w-lg"
      >
        {selectedSchedule && (
          <form onSubmit={handleSubmitReport} className="space-y-5">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h3 className="font-bold text-lg text-gray-900">
                  {editingReport ? 'עריכת דיווח' : 'דיווח שיעור'}
                </h3>
                <p className="text-sm text-gray-500 mt-0.5">
                  {selectedSchedule.lessonType === 'flexible'
                    ? 'שיעור גמיש'
                    : getScheduleDisplayLabel(selectedSchedule, students)}
                  {' · '}
                  {selectedSchedule.subject}
                </p>
              </div>
              <button
                type="button"
                onClick={closeReportForm}
                className="text-gray-400 hover:text-gray-600 text-sm font-bold shrink-0"
              >
                סגור
              </button>
            </div>

            <div>
              <label className="text-xs font-bold text-gray-600 block mb-1.5">תאריך השיעור</label>
              <div className="flex flex-col sm:flex-row gap-2 sm:items-center">
                <p className="flex-1 text-sm font-bold text-blue-900 bg-blue-50 border border-blue-100 rounded-xl px-3 py-2.5">
                  {formatHebrewDateLong(reportDate, selectedSchedule.day)}
                </p>
                <button
                  type="button"
                  onClick={() => setShowDatePicker((v) => !v)}
                  className="press text-xs font-bold text-blue-700 hover:text-blue-900 px-3 py-2 rounded-lg border border-blue-100 bg-white shrink-0"
                >
                  {showDatePicker ? 'הסתר לוח' : 'תאריך אחר'}
                </button>
              </div>
              {showDatePicker && (
                <div className="mt-3">
                  <MiniCalendar
                    selectedSchedule={selectedSchedule}
                    reports={reports}
                    selectedDateStr={reportDate}
                    holidayDates={holidayDates}
                    onDateSelect={(d) => {
                      setReportDate(d);
                      const existing = findReportForLessonDate(reports, selectedSchedule, d);
                      if (existing && existing.id !== editingReport?.id) {
                        setEditingReport(existing);
                        setReportStatus(existing.status);
                        setReportText(existing.text || '');
                        if (existing.attendedStudentIds) {
                          setReportAttendedIds(existing.attendedStudentIds);
                        }
                      }
                    }}
                  />
                  <p className="text-[10px] text-gray-500 mt-1.5">
                    ניתן לבחור רק ימי שיעור (כחול). ההזנה יכולה להיות ביום אחר.
                  </p>
                </div>
              )}
            </div>

            <div>
              <label className="text-xs font-bold text-gray-600 block mb-1.5">התקיים בפועל?</label>
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => setReportStatus('completed')}
                  className={`press py-3 rounded-xl font-bold text-sm transition-colors ${
                    reportStatus === 'completed'
                      ? 'bg-green-600 text-white shadow-sm'
                      : 'bg-white border border-gray-200 text-gray-700 hover:bg-gray-50'
                  }`}
                >
                  כן, התקיים
                </button>
                <button
                  type="button"
                  onClick={() => setReportStatus('missed')}
                  className={`press py-3 rounded-xl font-bold text-sm transition-colors ${
                    reportStatus === 'missed'
                      ? 'bg-red-600 text-white shadow-sm'
                      : 'bg-white border border-gray-200 text-gray-700 hover:bg-gray-50'
                  }`}
                >
                  לא, בוטל
                </button>
              </div>
            </div>

            {reportStatus === 'completed' && (
              <StudentPicker
                students={getStudentsForAttendance(selectedSchedule)}
                selectedIds={reportAttendedIds}
                onChange={setReportAttendedIds}
                lastSessionIds={getLastAttendedStudentIds(selectedSchedule.id, reports)}
                maxHeight="max-h-56"
                label={
                  isFlexibleAttendance(selectedSchedule)
                    ? 'מי נוכח בשיעור?'
                    : 'סמן מי נוכח מתוך התלמידים המשויכים'
                }
              />
            )}

            <div>
              <label className="text-xs font-bold text-gray-600 block mb-1.5">
                {reportStatus === 'missed' ? 'סיבת ביטול (חובה)' : 'פירוט (אופציונלי)'}
              </label>
              {reportStatus === 'missed' && (
                <div className="flex flex-wrap gap-1.5 mb-2">
                  {MISS_REASON_PRESETS.map((reason) => (
                    <button
                      key={reason}
                      type="button"
                      onClick={() => setReportText(reason)}
                      className={`press text-[11px] font-bold px-2.5 py-1 rounded-lg border transition-colors ${
                        reportText === reason
                          ? 'bg-red-50 border-red-200 text-red-800'
                          : 'bg-white border-gray-200 text-gray-600 hover:bg-gray-50'
                      }`}
                    >
                      {reason}
                    </button>
                  ))}
                </div>
              )}
              <textarea
                rows={3}
                value={reportText}
                onChange={(e) => setReportText(e.target.value)}
                placeholder={
                  reportStatus === 'missed'
                    ? 'מה הסיבה לביטול?'
                    : 'מה התבצע בשיעור? (לא חובה)'
                }
                className="w-full p-3 border border-gray-200 rounded-xl bg-gray-50 focus:ring-2 focus:ring-blue-500 outline-none text-sm"
                required={reportStatus === 'missed'}
              />
            </div>

            <button
              type="submit"
              disabled={submitting}
              className="press w-full py-3.5 bg-blue-600 hover:bg-blue-700 disabled:opacity-60 disabled:cursor-not-allowed text-white font-bold rounded-xl shadow-sm flex items-center justify-center gap-2 text-base"
            >
              {submitting ? (
                <>
                  <Loader2 className="w-5 h-5 animate-spin" />
                  שולח...
                </>
              ) : editingReport ? (
                'עדכן דיווח'
              ) : (
                'שלח דיווח'
              )}
            </button>
          </form>
        )}
      </Modal>
    </div>
  );
};

export default TeacherDashboard;
