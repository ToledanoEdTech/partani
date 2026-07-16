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

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return activeStudents.filter((s) => {
      if (classFilter && s.className !== classFilter) return false;
      if (!q) return true;
      return s.name.toLowerCase().includes(q) || s.className.toLowerCase().includes(q);
    });
  }, [activeStudents, search, classFilter]);

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

  const lastSessionAvailable = lastSessionIds.some((id) => activeStudents.some((s) => s.id === id));

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
        ) : (
          filtered.map((s) => {
            const checked = selectedIds.includes(s.id);
            return (
              <label
                key={s.id}
                className={`flex items-center gap-2 px-3 py-2 cursor-pointer hover:bg-gray-50 border-b border-gray-50 last:border-0 ${checked ? 'bg-blue-50' : ''}`}
              >
                <input
                  type="checkbox"
                  checked={checked}
                  onChange={() => toggle(s.id)}
                  className="rounded"
                />
                <span className="text-sm font-medium text-gray-900 flex-1">{s.name}</span>
                <span className="text-xs text-gray-500">{s.className}</span>
              </label>
            );
          })
        )}
      </div>

      <p className="text-[10px] text-gray-400 flex items-center gap-1">
        <Users className="w-3 h-3" />
        {selectedIds.length} נבחרו מתוך {activeStudents.length}
      </p>
    </div>
  );
};

export default StudentPicker;
