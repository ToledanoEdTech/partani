import React from 'react';
import { Calendar, CheckCircle, Clock, User, XCircle } from 'lucide-react';
import Modal from './Modal';
import { Student } from '../types';
import { StudentLessonSummary } from '../lib/students';

interface StudentCardProps {
  student: Student | null;
  summary: StudentLessonSummary | null;
  rangeLabel?: string;
  onClose: () => void;
}

const formatDateHe = (dateStr: string) => {
  const [y, m, d] = dateStr.split('-');
  return `${d}/${m}/${y}`;
};

const StudentCard: React.FC<StudentCardProps> = ({
  student,
  summary,
  rangeLabel,
  onClose,
}) => {
  if (!student || !summary) return null;

  return (
    <Modal
      open
      onClose={onClose}
      title={`כרטיס תלמיד: ${student.name}`}
      maxWidthClassName="max-w-3xl"
    >
      <div className="space-y-6 max-h-[80vh] overflow-y-auto">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <h2 className="text-lg sm:text-xl font-bold text-gray-900 break-words">כרטיס תלמיד: {student.name}</h2>
            <p className="text-sm text-gray-500 mt-1">
              כיתה {student.className} • {student.active ? 'פעיל' : 'לא פעיל'}
            </p>
            {rangeLabel && (
              <p className="text-xs text-gray-400 mt-1">תקופת ניתוח: {rangeLabel}</p>
            )}
          </div>
        </div>

        <div className="grid grid-cols-3 gap-2 sm:gap-3">
          <div className="bg-green-50 border border-green-100 rounded-lg p-2 sm:p-4 text-center">
            <CheckCircle className="w-4 h-4 sm:w-5 sm:h-5 text-green-600 mx-auto mb-1" />
            <div className="text-xl sm:text-2xl font-bold text-green-700">{summary.completedCount}</div>
            <div className="text-[10px] sm:text-xs text-green-800 font-bold leading-tight">שעות שהתקיימו</div>
          </div>
          <div className="bg-red-50 border border-red-100 rounded-lg p-2 sm:p-4 text-center">
            <XCircle className="w-4 h-4 sm:w-5 sm:h-5 text-red-600 mx-auto mb-1" />
            <div className="text-xl sm:text-2xl font-bold text-red-700">{summary.missedCount}</div>
            <div className="text-[10px] sm:text-xs text-red-800 font-bold leading-tight">שעות שבוטלו</div>
          </div>
          <div className="bg-blue-50 border border-blue-100 rounded-lg p-2 sm:p-4 text-center">
            <Calendar className="w-4 h-4 sm:w-5 sm:h-5 text-blue-600 mx-auto mb-1" />
            <div className="text-xl sm:text-2xl font-bold text-blue-700">{summary.fixedSchedules.length}</div>
            <div className="text-[10px] sm:text-xs text-blue-800 font-bold leading-tight">שעות קבועות במערכת</div>
          </div>
        </div>

        {summary.fixedSchedules.length > 0 && (
          <div>
            <h3 className="font-bold text-gray-800 mb-2 flex items-center gap-2">
              <Clock className="w-4 h-4 text-indigo-600 shrink-0" />
              שעות פרטניות קבועות
            </h3>
            <div className="sm:hidden space-y-2">
              {summary.fixedSchedules.map((slot) => (
                <div key={slot.scheduleId} className="bg-gray-50 rounded-lg border p-3 text-sm space-y-0.5">
                  <div className="font-bold text-gray-900">{slot.day} · שעה {slot.hour}</div>
                  <div className="text-gray-700">{slot.subject}</div>
                  <div className="text-xs text-gray-500">{slot.teacherName}</div>
                </div>
              ))}
            </div>
            <div className="hidden sm:block bg-gray-50 rounded-lg border overflow-hidden">
              <table className="w-full text-sm text-right">
                <thead className="bg-gray-100 text-xs text-gray-500">
                  <tr>
                    <th className="p-2 font-bold">יום</th>
                    <th className="p-2 font-bold">שעה</th>
                    <th className="p-2 font-bold">מקצוע</th>
                    <th className="p-2 font-bold">מורה</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {summary.fixedSchedules.map((slot) => (
                    <tr key={slot.scheduleId} className="hover:bg-white">
                      <td className="p-2 font-bold">{slot.day}</td>
                      <td className="p-2">{slot.hour}</td>
                      <td className="p-2">{slot.subject}</td>
                      <td className="p-2">{slot.teacherName}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        <div>
          <h3 className="font-bold text-gray-800 mb-2 flex items-center gap-2">
            <User className="w-4 h-4 text-indigo-600 shrink-0" />
            היסטוריית שיעורים ({summary.totalCount})
          </h3>
          {summary.lessons.length === 0 ? (
            <p className="text-sm text-gray-400 text-center py-6 bg-gray-50 rounded-lg border">
              אין שיעורים מתועדים לתלמיד זה בתקופה הנבחרת.
            </p>
          ) : (
            <>
              <div className="sm:hidden space-y-2 max-h-72 overflow-y-auto">
                {summary.lessons.map((lesson) => (
                  <div key={lesson.reportId} className="bg-white rounded-lg border p-3 text-sm space-y-1">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <div className="font-bold text-gray-900" dir="ltr">{formatDateHe(lesson.date)}</div>
                        <div className="text-xs text-gray-500">{lesson.scheduleDay} · שעה {lesson.hour}</div>
                        <div className="text-gray-700 break-words">{lesson.subject} · {lesson.teacherName}</div>
                      </div>
                      <span
                        className={`px-2 py-0.5 rounded text-xs font-bold shrink-0 ${
                          lesson.status === 'completed'
                            ? 'bg-green-100 text-green-700'
                            : 'bg-red-100 text-red-700'
                        }`}
                      >
                        {lesson.status === 'completed' ? 'התקיים' : 'בוטל'}
                      </span>
                    </div>
                    {lesson.text && (
                      <p className="text-xs text-gray-600 break-words">{lesson.text}</p>
                    )}
                  </div>
                ))}
              </div>
              <div className="hidden sm:block bg-white rounded-lg border overflow-hidden max-h-72 overflow-y-auto">
                <table className="w-full text-sm text-right">
                  <thead className="bg-gray-50 text-xs text-gray-500 sticky top-0">
                    <tr>
                      <th className="p-2 font-bold">תאריך</th>
                      <th className="p-2 font-bold">יום</th>
                      <th className="p-2 font-bold">שעה</th>
                      <th className="p-2 font-bold">מקצוע</th>
                      <th className="p-2 font-bold">מורה</th>
                      <th className="p-2 font-bold">סטטוס</th>
                      <th className="p-2 font-bold">פירוט</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {summary.lessons.map((lesson) => (
                      <tr key={lesson.reportId} className="hover:bg-blue-50/30">
                        <td className="p-2 font-mono text-xs" dir="ltr">
                          {formatDateHe(lesson.date)}
                        </td>
                        <td className="p-2">{lesson.scheduleDay}</td>
                        <td className="p-2">{lesson.hour}</td>
                        <td className="p-2">{lesson.subject}</td>
                        <td className="p-2">{lesson.teacherName}</td>
                        <td className="p-2">
                          <span
                            className={`px-2 py-0.5 rounded text-xs font-bold ${
                              lesson.status === 'completed'
                                ? 'bg-green-100 text-green-700'
                                : 'bg-red-100 text-red-700'
                            }`}
                          >
                            {lesson.status === 'completed' ? 'התקיים' : 'בוטל'}
                          </span>
                        </td>
                        <td className="p-2 text-xs text-gray-600 max-w-[200px] truncate" title={lesson.text}>
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

        <div className="flex justify-end pt-2 border-t">
          <button
            type="button"
            onClick={onClose}
            className="press px-4 py-2 bg-gray-100 hover:bg-gray-200 rounded font-bold transition-colors w-full sm:w-auto"
          >
            סגור
          </button>
        </div>
      </div>
    </Modal>
  );
};

export default StudentCard;
