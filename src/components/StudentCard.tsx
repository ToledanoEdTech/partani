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
          <div>
            <h2 className="text-xl font-bold text-gray-900">כרטיס תלמיד: {student.name}</h2>
            <p className="text-sm text-gray-500 mt-1">
              כיתה {student.className} • {student.active ? 'פעיל' : 'לא פעיל'}
            </p>
            {rangeLabel && (
              <p className="text-xs text-gray-400 mt-1">תקופת ניתוח: {rangeLabel}</p>
            )}
          </div>
        </div>

        <div className="grid grid-cols-3 gap-3">
          <div className="bg-green-50 border border-green-100 rounded-lg p-4 text-center">
            <CheckCircle className="w-5 h-5 text-green-600 mx-auto mb-1" />
            <div className="text-2xl font-bold text-green-700">{summary.completedCount}</div>
            <div className="text-xs text-green-800 font-bold">שעות שהתקיימו</div>
          </div>
          <div className="bg-red-50 border border-red-100 rounded-lg p-4 text-center">
            <XCircle className="w-5 h-5 text-red-600 mx-auto mb-1" />
            <div className="text-2xl font-bold text-red-700">{summary.missedCount}</div>
            <div className="text-xs text-red-800 font-bold">שעות שבוטלו</div>
          </div>
          <div className="bg-blue-50 border border-blue-100 rounded-lg p-4 text-center">
            <Calendar className="w-5 h-5 text-blue-600 mx-auto mb-1" />
            <div className="text-2xl font-bold text-blue-700">{summary.fixedSchedules.length}</div>
            <div className="text-xs text-blue-800 font-bold">שעות קבועות במערכת</div>
          </div>
        </div>

        {summary.fixedSchedules.length > 0 && (
          <div>
            <h3 className="font-bold text-gray-800 mb-2 flex items-center gap-2">
              <Clock className="w-4 h-4 text-indigo-600" />
              שעות פרטניות קבועות
            </h3>
            <div className="bg-gray-50 rounded-lg border overflow-hidden">
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
            <User className="w-4 h-4 text-indigo-600" />
            היסטוריית שיעורים ({summary.totalCount})
          </h3>
          {summary.lessons.length === 0 ? (
            <p className="text-sm text-gray-400 text-center py-6 bg-gray-50 rounded-lg border">
              אין שיעורים מתועדים לתלמיד זה בתקופה הנבחרת.
            </p>
          ) : (
            <div className="bg-white rounded-lg border overflow-hidden max-h-72 overflow-y-auto">
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
          )}
        </div>

        <div className="flex justify-end pt-2 border-t">
          <button
            type="button"
            onClick={onClose}
            className="press px-4 py-2 bg-gray-100 hover:bg-gray-200 rounded font-bold transition-colors"
          >
            סגור
          </button>
        </div>
      </div>
    </Modal>
  );
};

export default StudentCard;
