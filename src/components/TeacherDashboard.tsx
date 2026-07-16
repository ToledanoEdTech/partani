import React, { useEffect, useMemo, useState } from 'react';
import {
  BookOpen, Calendar, CheckCircle, XCircle, FileText, Loader2, ChevronLeft, ChevronRight,
} from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import { Teacher, Schedule, Report, Student } from '../types';
import StudentPicker from './StudentPicker';
import Modal from './Modal';
import { addReport, updateReport } from '../lib/db';
import {
  getLastAttendedStudentIds,
  getReportAttendedLabel,
  getScheduleDisplayLabel,
} from '../lib/students';
import {
  addDaysToDateStr,
  calendarDateStr,
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

const MiniCalendar = ({
  selectedSchedule,
  reports,
  selectedDateStr,
  onDateSelect,
}: {
  selectedSchedule: Schedule;
  reports: Report[];
  selectedDateStr: string;
  onDateSelect: (d: string) => void;
}) => {
  const [currentMonthDate, setCurrentMonthDate] = useState(new Date(selectedDateStr));

  useEffect(() => {
    setCurrentMonthDate(new Date(selectedDateStr));
  }, [selectedDateStr, selectedSchedule.id]);

  const year = currentMonthDate.getFullYear();
  const month = currentMonthDate.getMonth();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const firstDayOfMonth = new Date(year, month, 1).getDay();
  const monthNames = [
    'ינואר', 'פברואר', 'מרץ', 'אפריל', 'מאי', 'יוני',
    'יולי', 'אוגוסט', 'ספטמבר', 'אוקטובר', 'נובמבר', 'דצמבר',
  ];

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

    let baseClass =
      'press h-8 w-8 rounded-full flex items-center justify-center text-xs font-bold transition-all duration-150 cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-400 ';

    if (isSelected) baseClass += 'ring-2 ring-blue-500 ring-offset-1 ';
    if (existingReport) {
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
          disabled={!isScheduleDay}
          onClick={() => isScheduleDay && onDateSelect(dateStr)}
          className={`${baseClass}${!isScheduleDay ? ' opacity-30 cursor-not-allowed hover:bg-transparent' : ''}`}
          title={
            existingReport
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
          {monthNames[month]} {year}
        </span>
        <button type="button" onClick={() => setCurrentMonthDate(new Date(year, month + 1, 1))} className="px-3 py-1 hover:bg-white rounded-lg">
          <ChevronLeft className="w-4 h-4" />
        </button>
      </div>
      <div className="grid grid-cols-7 text-center text-[10px] font-bold text-gray-400 mb-1">
        <div>א׳</div><div>ב׳</div><div>ג׳</div><div>ד׳</div><div>ה׳</div><div>ו׳</div><div>ש׳</div>
      </div>
      <div className="grid grid-cols-7">{daysRender}</div>
      <div className="mt-3 text-[10px] flex justify-center gap-3 text-gray-500">
        <div className="flex items-center gap-1">
          <div className="w-2 h-2 rounded-full bg-blue-100 border border-blue-200" /> שיעור
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

export interface TeacherDashboardProps {
  teacher: Teacher;
  schedules: Schedule[];
  reports: Report[];
  students: Student[];
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
  teacherTab,
  setTeacherTab,
  isImpersonating,
  onEndImpersonation,
  onNotify,
}) => {
  const [weekStart, setWeekStart] = useState<Date>(() =>
    weekAnchorDate(getWeekStartDateStr(new Date())),
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

  const weekSlots = useMemo(() => {
    const items = schedules.map((slot) => {
      const date = getLessonDateForScheduleInWeek(slot, weekStartStr);
      const report = findReportForScheduleWeek(reports, slot, weekStartStr);
      return { slot, date, report };
    });
    items.sort((a, b) => {
      if (!!a.report !== !!b.report) return a.report ? 1 : -1;
      return a.date.localeCompare(b.date) || a.slot.hour.localeCompare(b.slot.hour, undefined, { numeric: true });
    });
    return items;
  }, [schedules, reports, weekStartStr]);

  const pendingCount = weekSlots.filter((s) => !s.report).length;
  const doneCount = weekSlots.filter((s) => s.report).length;

  const filteredHistory = useMemo(() => {
    const sorted = [...reports].sort((a, b) => (b.timestamp || b.date).localeCompare(a.timestamp || a.date));
    if (historyStatusFilter === 'all') return sorted;
    return sorted.filter((r) => r.status === historyStatusFilter);
  }, [reports, historyStatusFilter]);

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
      const lastIds = getLastAttendedStudentIds(slot.id, reports);
      if (slot.lessonType === 'flexible' && lastIds.length > 0) {
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
            {/* Week nav */}
            <div className="bg-slate-800 text-white rounded-xl p-3 sm:p-4 flex flex-col gap-3 shadow-sm">
              <div className="flex items-center gap-2">
                <Calendar className="w-5 h-5 text-amber-400 shrink-0" />
                <h3 className="font-bold text-base">השיעורים שלי</h3>
                <span className="text-xs text-white/60 mr-auto">{schedules.length} משבצות</span>
              </div>
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
            </div>

            {/* Status banner */}
            {schedules.length > 0 && (
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
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-2">
                    <CheckCircle className="w-4 h-4" />
                    כל השיעורים דווחו בשבוע זה
                  </span>
                )}
              </div>
            )}

            {schedules.length === 0 ? (
              <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-8 text-center space-y-2">
                <BookOpen className="w-10 h-10 mx-auto text-gray-200" />
                <p className="font-bold text-gray-700">לא שויכו לך שיעורים פרטניים</p>
                <p className="text-sm text-gray-500">פנה למנהל המערכת לשיבוץ שעות.</p>
              </div>
            ) : (
              <div className="space-y-3">
                {weekSlots.map(({ slot, date, report }) => {
                  const isPending = !report;
                  return (
                    <div
                      key={slot.id}
                      className={`bg-white rounded-xl border p-4 shadow-sm transition-shadow ${
                        isPending
                          ? 'border-blue-200 ring-1 ring-blue-50'
                          : report.status === 'completed'
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
                          {report ? (
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
                })}
              </div>
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
