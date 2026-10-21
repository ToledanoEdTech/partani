import React, { useEffect, useMemo, useState } from 'react';
import { ChevronLeft, Download, Search } from 'lucide-react';
import * as XLSX from 'xlsx';
import type { Report, Schedule, Student, Teacher } from '../types';
import { formatHebrewDateShort, formatHourSlot } from '../lib/date-format';
import { ISRAEL_TIMEZONE, formatDateInTZ } from '../lib/lesson-stats';
import {
  buildStudentPrivateLessonExport,
  compareHebrewNames,
  getUniqueClassNames,
  indexReceivedStudents,
  type ReceivedStudentRecord,
  type StudentLessonEntry,
} from '../lib/students';

type SortKey = 'name' | 'recent' | 'count';

interface ReceivedLessonsViewProps {
  students: Student[];
  reports: Report[];
  schedules: Schedule[];
  teachers: Teacher[];
  onNotify: (message: string, type?: string) => void;
}

function inDateRange(date: string, from: string, to: string): boolean {
  if (from && date < from) return false;
  if (to && date > to) return false;
  return true;
}

function narrowRecord(record: ReceivedStudentRecord, from: string, to: string): ReceivedStudentRecord | null {
  if (!from && !to) return record;
  const lessons = record.lessons.filter((lesson) => inDateRange(lesson.date, from, to));
  const completedCount = lessons.filter((lesson) => lesson.status === 'completed').length;
  if (completedCount === 0) return null;
  return {
    student: record.student,
    completedCount,
    missedCount: lessons.length - completedCount,
    lessons,
    lastCompleted: lessons.find((lesson) => lesson.status === 'completed') ?? null,
  };
}

function formatSlot(lesson: StudentLessonEntry): string {
  const day = lesson.scheduleDay && lesson.scheduleDay !== '—' ? `יום ${lesson.scheduleDay}` : '';
  const hour = lesson.hour && lesson.hour !== '—' ? formatHourSlot(lesson.hour) : '';
  return [day, hour, lesson.subject !== '—' ? lesson.subject : ''].filter(Boolean).join(' · ');
}

const ReceivedLessonsView: React.FC<ReceivedLessonsViewProps> = ({
  students,
  reports,
  schedules,
  teachers,
  onNotify,
}) => {
  const [search, setSearch] = useState('');
  const [className, setClassName] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [sortKey, setSortKey] = useState<SortKey>('name');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [showMissed, setShowMissed] = useState(false);

  const range = useMemo(() => {
    if (dateFrom && dateTo && dateFrom > dateTo) return { from: dateTo, to: dateFrom };
    return { from: dateFrom, to: dateTo };
  }, [dateFrom, dateTo]);

  const received = useMemo(
    () => indexReceivedStudents({ students, reports, schedules, teachers }),
    [students, reports, schedules, teachers],
  );

  const inRange = useMemo(
    () => received.flatMap((record) => {
      const narrowed = narrowRecord(record, range.from, range.to);
      return narrowed ? [narrowed] : [];
    }),
    [received, range.from, range.to],
  );

  const classOptions = useMemo(
    () => getUniqueClassNames(inRange.map((record) => record.student)),
    [inRange],
  );

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    const rows = inRange.filter((record) => {
      if (className && record.student.className !== className) return false;
      if (q && !record.student.name.toLowerCase().includes(q)) return false;
      return true;
    });
    const sorted = [...rows];
    sorted.sort((a, b) => {
      if (sortKey === 'recent') {
        const byDate = (b.lastCompleted?.date ?? '').localeCompare(a.lastCompleted?.date ?? '');
        if (byDate !== 0) return byDate;
      } else if (sortKey === 'count') {
        const byCount = b.completedCount - a.completedCount;
        if (byCount !== 0) return byCount;
      }
      return compareHebrewNames(a.student.name, b.student.name);
    });
    return sorted;
  }, [inRange, search, className, sortKey]);

  useEffect(() => {
    if (className && !classOptions.includes(className)) setClassName('');
  }, [className, classOptions]);

  useEffect(() => {
    const q = search.trim();
    if (q && filtered.length === 1) {
      setSelectedId(filtered[0].student.id);
      return;
    }
    if (selectedId && !filtered.some((record) => record.student.id === selectedId)) {
      setSelectedId(null);
    }
  }, [search, filtered, selectedId]);

  const selected = filtered.find((record) => record.student.id === selectedId) ?? null;
  const visibleLessons = selected
    ? selected.lessons.filter((lesson) => showMissed || lesson.status === 'completed')
    : [];

  const totalCompleted = filtered.reduce((sum, record) => sum + record.completedCount, 0);
  const filtersActive = Boolean(search.trim() || className || dateFrom || dateTo);

  const handleExport = () => {
    const { lessons, summary } = buildStudentPrivateLessonExport({
      students: filtered.map((record) => record.student),
      reports,
      schedules,
      teachers,
      startStr: range.from || undefined,
      endStr: range.to || undefined,
    });
    if (lessons.length === 0) {
      onNotify('אין שיעורים פרטניים לייצוא ברשימה הנוכחית', 'error');
      return;
    }
    const lessonsSheet = XLSX.utils.json_to_sheet(lessons);
    const summarySheet = XLSX.utils.json_to_sheet(summary);
    lessonsSheet['!cols'] = [
      { wch: 22 }, { wch: 12 }, { wch: 8 }, { wch: 14 }, { wch: 12 },
      { wch: 10 }, { wch: 16 }, { wch: 20 }, { wch: 12 }, { wch: 40 },
    ];
    summarySheet['!cols'] = [
      { wch: 22 }, { wch: 12 }, { wch: 8 }, { wch: 18 }, { wch: 16 }, { wch: 16 },
    ];
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, lessonsSheet, 'שיעורים');
    XLSX.utils.book_append_sheet(wb, summarySheet, 'סיכום');
    XLSX.writeFile(wb, `שיעורים_פרטניים_${formatDateInTZ(new Date(), ISRAEL_TIMEZONE)}.xlsx`);
    onNotify(`יוצאו ${lessons.length} שיעורים עבור ${summary.length} תלמידים`);
  };

  return (
    <div className="space-y-4">
      <div className="bg-white rounded-lg border border-gray-200 shadow-sm p-4 space-y-3">
        <div className="relative">
          <Search className="w-4 h-4 text-gray-400 absolute top-1/2 -translate-y-1/2 right-3 pointer-events-none" />
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="הקלידו שם תלמיד..."
            className="w-full p-2.5 pr-9 border rounded-lg text-sm focus:ring-2 focus:ring-blue-500 outline-none"
            aria-label="חיפוש תלמיד לפי שם"
          />
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          <select
            value={className}
            onChange={(e) => setClassName(e.target.value)}
            className="p-2 border rounded-lg text-sm bg-white"
            aria-label="סינון לפי כיתה"
          >
            <option value="">כל הכיתות</option>
            {classOptions.map((name) => (
              <option key={name} value={name}>{name}</option>
            ))}
          </select>
          <label className="flex items-center gap-2 text-sm text-gray-600">
            <span className="shrink-0 font-bold">מתאריך</span>
            <input
              type="date"
              value={dateFrom}
              onChange={(e) => setDateFrom(e.target.value)}
              className="min-w-0 flex-1 p-2 border rounded-lg text-sm bg-white"
            />
          </label>
          <label className="flex items-center gap-2 text-sm text-gray-600">
            <span className="shrink-0 font-bold">עד תאריך</span>
            <input
              type="date"
              value={dateTo}
              onChange={(e) => setDateTo(e.target.value)}
              className="min-w-0 flex-1 p-2 border rounded-lg text-sm bg-white"
            />
          </label>
          <select
            value={sortKey}
            onChange={(e) => setSortKey(e.target.value as SortKey)}
            className="p-2 border rounded-lg text-sm bg-white"
            aria-label="מיון הרשימה"
          >
            <option value="name">מיון לפי שם</option>
            <option value="recent">מיון לפי שיעור אחרון</option>
            <option value="count">מיון לפי מספר שיעורים</option>
          </select>
        </div>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-sm text-gray-600">
            <span className="font-bold text-gray-900">{filtered.length}</span>
            {' '}תלמידים קיבלו פרטני
            <span className="text-gray-400"> · </span>
            <span className="font-bold text-gray-900">{totalCompleted}</span>
            {' '}שיעורים
          </p>
          <div className="flex flex-wrap gap-2">
            {filtersActive && (
              <button
                type="button"
                onClick={() => {
                  setSearch('');
                  setClassName('');
                  setDateFrom('');
                  setDateTo('');
                }}
                className="press px-3 py-1.5 text-xs font-bold text-gray-600 bg-gray-100 hover:bg-gray-200 rounded-lg"
              >
                נקה סינון
              </button>
            )}
            <button
              type="button"
              onClick={handleExport}
              className="press px-3 py-1.5 text-xs font-bold text-white bg-teal-700 hover:bg-teal-800 rounded-lg flex items-center gap-1.5"
            >
              <Download className="w-3.5 h-3.5" /> ייצוא לאקסל
            </button>
          </div>
        </div>
      </div>

      {filtered.length === 0 ? (
        <div className="bg-white rounded-lg border border-gray-200 shadow-sm px-6 py-14 text-center">
          <p className="font-bold text-gray-800">
            {received.length === 0
              ? 'עדיין אין שיעורים פרטניים מתועדים'
              : 'לא נמצא תלמיד שקיבל שיעור פרטני לפי הסינון'}
          </p>
          <p className="text-sm text-gray-500 mt-1">נסו שם אחר, כיתה אחרת, או טווח תאריכים רחב יותר.</p>
        </div>
      ) : (
        <div className="grid lg:grid-cols-[minmax(260px,340px)_minmax(0,1fr)] gap-4 items-start">
          <div className={`${selected ? 'hidden lg:block' : ''} bg-white rounded-lg border border-gray-200 shadow-sm overflow-hidden`}>
            <div className="px-4 py-3 border-b bg-gray-50">
              <h3 className="text-sm font-bold text-gray-800">כל התלמידים שקיבלו פרטני</h3>
            </div>
            <ul className="max-h-[70vh] overflow-y-auto divide-y">
              {filtered.map((record) => {
                const active = record.student.id === selectedId;
                const last = record.lastCompleted;
                return (
                  <li key={record.student.id}>
                    <button
                      type="button"
                      onClick={() => setSelectedId(record.student.id)}
                      aria-pressed={active}
                      className={`press w-full text-right px-4 py-3 transition-colors ${
                        active ? 'bg-blue-50' : 'hover:bg-gray-50'
                      }`}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <div className="font-bold text-gray-900 break-words">
                            {record.student.name}
                            {!record.student.active && (
                              <span className="mr-2 text-[10px] font-bold text-red-700 bg-red-50 px-1.5 py-0.5 rounded">לא פעיל</span>
                            )}
                          </div>
                          <div className="text-xs text-gray-500 mt-0.5">
                            כיתה {record.student.className} · {record.completedCount} שיעורים
                          </div>
                          {last && (
                            <div className="text-xs text-blue-800 mt-1 break-words">
                              אחרון: {formatHebrewDateShort(last.date)} · {last.teacherName}
                            </div>
                          )}
                        </div>
                        <ChevronLeft className="w-4 h-4 text-gray-300 shrink-0 mt-1 lg:hidden" />
                      </div>
                    </button>
                  </li>
                );
              })}
            </ul>
          </div>

          <div className={`${selected ? '' : 'hidden lg:block'} bg-white rounded-lg border border-gray-200 shadow-sm min-h-[280px]`}>
            {!selected ? (
              <div className="px-6 py-16 text-center text-gray-500">
                <p className="font-bold text-gray-800">בחרו תלמיד מהרשימה</p>
                <p className="text-sm mt-1">או הקלידו שם כדי לראות מתי קיבל פרטני וממי.</p>
              </div>
            ) : (
              <div>
                <div className="px-4 py-4 border-b flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <button
                      type="button"
                      onClick={() => setSelectedId(null)}
                      className="press lg:hidden text-xs font-bold text-blue-700 mb-2"
                    >
                      חזרה לרשימה
                    </button>
                    <h3 className="text-lg font-bold text-gray-900 break-words">{selected.student.name}</h3>
                    <p className="text-sm text-gray-500 mt-0.5">
                      כיתה {selected.student.className}
                      {' · '}
                      <span className="font-bold text-green-700">{selected.completedCount} התקיימו</span>
                      {selected.missedCount > 0 && (
                        <>
                          {' · '}
                          <span className="text-red-700">{selected.missedCount} בוטלו</span>
                        </>
                      )}
                    </p>
                  </div>
                  {selected.missedCount > 0 && (
                    <button
                      type="button"
                      onClick={() => setShowMissed((value) => !value)}
                      className={`press px-3 py-1.5 rounded-full text-xs font-bold ${
                        showMissed ? 'bg-gray-800 text-white' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                      }`}
                    >
                      {showMissed ? 'הסתר ביטולים' : 'הצג גם ביטולים'}
                    </button>
                  )}
                </div>

                {visibleLessons.length === 0 ? (
                  <p className="text-sm text-gray-400 text-center py-10">אין שיעורים להצגה.</p>
                ) : (
                  <>
                    <ul className="sm:hidden divide-y max-h-[70vh] overflow-y-auto">
                      {visibleLessons.map((lesson) => (
                        <li key={lesson.reportId} className="px-4 py-3 space-y-1">
                          <div className="flex items-start justify-between gap-2">
                            <div>
                              <div className="font-bold text-gray-900" dir="ltr">{formatHebrewDateShort(lesson.date)}</div>
                              <div className="text-sm font-bold text-blue-800 mt-0.5">{lesson.teacherName}</div>
                            </div>
                            <StatusBadge status={lesson.status} />
                          </div>
                          <p className="text-xs text-gray-500">{formatSlot(lesson) || '—'}</p>
                          {lesson.text && <p className="text-xs text-gray-600 break-words">{lesson.text}</p>}
                        </li>
                      ))}
                    </ul>
                    <div className="hidden sm:block overflow-x-auto max-h-[70vh]">
                      <table className="w-full text-sm text-right">
                        <thead className="bg-gray-50 text-xs text-gray-500 sticky top-0">
                          <tr>
                            <th className="px-4 py-3 font-bold">תאריך</th>
                            <th className="px-4 py-3 font-bold">מורה</th>
                            <th className="px-4 py-3 font-bold">שיעור</th>
                            <th className="px-4 py-3 font-bold">סטטוס</th>
                            <th className="px-4 py-3 font-bold">פירוט</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y">
                          {visibleLessons.map((lesson) => (
                            <tr key={lesson.reportId} className="hover:bg-blue-50/30">
                              <td className="px-4 py-3 font-mono text-xs whitespace-nowrap" dir="ltr">
                                {formatHebrewDateShort(lesson.date)}
                              </td>
                              <td className="px-4 py-3 font-bold text-blue-900">{lesson.teacherName}</td>
                              <td className="px-4 py-3 text-gray-700">{formatSlot(lesson) || '—'}</td>
                              <td className="px-4 py-3"><StatusBadge status={lesson.status} /></td>
                              <td className="px-4 py-3 text-xs text-gray-600 max-w-[220px]">
                                {lesson.text || '—'}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </>
                )}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

function StatusBadge({ status }: { status: 'completed' | 'missed' }) {
  const completed = status === 'completed';
  return (
    <span className={`px-2 py-0.5 rounded text-xs font-bold whitespace-nowrap ${
      completed ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'
    }`}>
      {completed ? 'התקיים' : 'בוטל'}
    </span>
  );
}

export default ReceivedLessonsView;
