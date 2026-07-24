import React, { useMemo, useState } from 'react';
import { Search, Users, RotateCcw, CheckCheck } from 'lucide-react';
import { Student } from '../types';
import { getUniqueClassNames } from '../lib/students';

interface StudentPickerProps {
  students: Student[];
  selectedIds: string[];
  onChange: (ids: string[]) => void;
  /** Quick-select IDs from the teacher's previous session. */
  lastSessionIds?: string[];
  label?: string;
  maxHeight?: string;
  /** Show "select all active / clear" shortcuts (default true). */
  showSelectAll?: boolean;
}

const StudentRow: React.FC<{
  student: Student;
  checked: boolean;
  onToggle: () => void;
  badge?: string;
}> = ({ student, checked, onToggle, badge }) => (
  <label
    className={`flex items-center gap-2 px-3 py-2 cursor-pointer hover:bg-gray-50 border-b border-gray-50 last:border-0 ${
      checked ? 'bg-blue-50' : ''
    }`}
  >
    <input type="checkbox" checked={checked} onChange={onToggle} className="rounded" />
    <span className="text-sm font-medium text-gray-900 flex-1">{student.name}</span>
    {badge && (
      <span className="text-[10px] font-bold text-amber-800 bg-amber-100 px-1.5 py-0.5 rounded">
        {badge}
      </span>
    )}
    <span className="text-xs text-gray-500">{student.className}</span>
  </label>
);

const StudentPicker: React.FC<StudentPickerProps> = ({
  students,
  selectedIds,
  onChange,
  lastSessionIds = [],
  label = 'בחר תלמידים',
  maxHeight = 'max-h-48',
  showSelectAll = true,
}) => {
  const [search, setSearch] = useState('');
  const [classFilter, setClassFilter] = useState('');

  const activeStudents = useMemo(
    () => students.filter((s) => s.active).sort((a, b) => a.name.localeCompare(b.name, 'he')),
    [students],
  );

  const classNames = useMemo(() => getUniqueClassNames(students), [students]);

  const lastSessionSet = useMemo(() => new Set(lastSessionIds), [lastSessionIds]);

  const lastSessionStudents = useMemo(
    () => activeStudents.filter((s) => lastSessionSet.has(s.id)),
    [activeStudents, lastSessionSet],
  );

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return activeStudents.filter((s) => {
      if (classFilter && s.className !== classFilter) return false;
      if (!q) return true;
      return s.name.toLowerCase().includes(q) || s.className.toLowerCase().includes(q);
    });
  }, [activeStudents, search, classFilter]);

  const isFiltering = Boolean(search.trim() || classFilter);

  const filteredOthers = useMemo(
    () => filtered.filter((s) => !lastSessionSet.has(s.id)),
    [filtered, lastSessionSet],
  );

  const showGrouped = lastSessionStudents.length > 0 && !isFiltering;

  const toggle = (id: string) => {
    if (selectedIds.includes(id)) {
      onChange(selectedIds.filter((x) => x !== id));
    } else {
      onChange([...selectedIds, id]);
    }
  };

  const selectLastSession = () => {
    const valid = lastSessionIds.filter((id) => activeStudents.some((s) => s.id === id));
    if (valid.length > 0) onChange(valid);
  };

  const selectAllVisible = () => {
    const ids = filtered.map((s) => s.id);
    const merged = Array.from(new Set([...selectedIds, ...ids]));
    onChange(merged);
  };

  const clearSelection = () => onChange([]);

  const lastSessionAvailable = lastSessionStudents.length > 0;

  return (
    <div className="space-y-2">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
        <label className="text-xs font-bold text-gray-600">{label}</label>
        <div className="flex flex-wrap items-center gap-2 self-start sm:self-auto">
          {showSelectAll && filtered.length > 0 && (
            <button
              type="button"
              onClick={selectAllVisible}
              className="text-xs font-bold text-green-700 hover:text-green-900 flex items-center gap-1"
            >
              <CheckCheck className="w-3 h-3" />
              סמן הכל
            </button>
          )}
          {showSelectAll && selectedIds.length > 0 && (
            <button
              type="button"
              onClick={clearSelection}
              className="text-xs font-bold text-gray-500 hover:text-gray-800"
            >
              נקה
            </button>
          )}
          {lastSessionAvailable && (
            <button
              type="button"
              onClick={selectLastSession}
              className="text-xs font-bold text-blue-700 hover:text-blue-900 flex items-center gap-1"
            >
              <RotateCcw className="w-3 h-3" />
              כמו בפעם הקודמת
            </button>
          )}
        </div>
      </div>

      <div className="flex flex-col sm:flex-row gap-2">
        <div className="relative flex-1 min-w-0">
          <Search className="absolute right-2 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="חיפוש לפי שם..."
            className="w-full pr-8 pl-2 py-1.5 border rounded-lg text-sm focus:ring-2 focus:ring-blue-500 outline-none"
          />
        </div>
        <select
          value={classFilter}
          onChange={(e) => setClassFilter(e.target.value)}
          className="py-1.5 px-2 border rounded-lg text-sm bg-white w-full sm:w-auto sm:min-w-[90px]"
        >
          <option value="">כל הכיתות</option>
          {classNames.map((c) => (
            <option key={c} value={c}>{c}</option>
          ))}
        </select>
      </div>

      {selectedIds.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {selectedIds.map((id) => {
            const s = students.find((x) => x.id === id);
            if (!s) return null;
            return (
              <button
                key={id}
                type="button"
                onClick={() => toggle(id)}
                className="text-xs px-2 py-0.5 rounded-full bg-blue-100 text-blue-800 font-bold hover:bg-blue-200"
              >
                {s.name} ×
              </button>
            );
          })}
        </div>
      )}

      <div className={`border rounded-lg overflow-y-auto ${maxHeight} bg-white`}>
        {filtered.length === 0 ? (
          <p className="text-xs text-gray-400 p-3 text-center">לא נמצאו תלמידים</p>
        ) : showGrouped ? (
          <>
            <div className="sticky top-0 z-10 px-3 py-1.5 bg-amber-50 border-b border-amber-100 text-[10px] font-bold text-amber-900">
              מהשיעור הקודם ({lastSessionStudents.length})
            </div>
            {lastSessionStudents.map((s) => (
              <StudentRow
                key={s.id}
                student={s}
                checked={selectedIds.includes(s.id)}
                onToggle={() => toggle(s.id)}
              />
            ))}
            {filteredOthers.length > 0 && (
              <>
                <div className="sticky top-0 z-10 px-3 py-1.5 bg-gray-50 border-b border-gray-100 text-[10px] font-bold text-gray-500">
                  שאר התלמידים
                </div>
                {filteredOthers.map((s) => (
                  <StudentRow
                    key={s.id}
                    student={s}
                    checked={selectedIds.includes(s.id)}
                    onToggle={() => toggle(s.id)}
                  />
                ))}
              </>
            )}
          </>
        ) : (
          filtered.map((s) => (
            <StudentRow
              key={s.id}
              student={s}
              checked={selectedIds.includes(s.id)}
              onToggle={() => toggle(s.id)}
              badge={lastSessionSet.has(s.id) ? 'קודם' : undefined}
            />
          ))
        )}
      </div>

      <p className="text-[10px] text-gray-400 flex items-center gap-1">
        <Users className="w-3 h-3" />
        {selectedIds.length} נבחרו מתוך {activeStudents.length}
        {lastSessionAvailable && !isFiltering && (
          <span>· {lastSessionStudents.length} מהשיעור הקודם</span>
        )}
      </p>
    </div>
  );
};

export default StudentPicker;
