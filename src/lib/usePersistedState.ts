import { useEffect, useRef, useState, type Dispatch, type SetStateAction } from 'react';

/**
 * useState שעוטף sessionStorage / localStorage כדי שהמצב ישרוד רענון דף.
 *
 * שימושי במיוחד למצב ניווט (טאבים פעילים, "צופה כמורה" וכו') כך
 * שגם אם Vite מבצע full page reload בפיתוח או הדפדפן מתרענן מסיבה
 * אחרת — המשתמש נשאר באותה תצוגה במקום לחזור לעמוד הראשי.
 */
export function usePersistedState<T>(
  key: string,
  initialValue: T,
  storage: 'session' | 'local' = 'session'
): [T, Dispatch<SetStateAction<T>>] {
  const storageRef = useRef<Storage | null>(null);

  if (storageRef.current === null && typeof window !== 'undefined') {
    try {
      storageRef.current = storage === 'local' ? window.localStorage : window.sessionStorage;
    } catch {
      storageRef.current = null;
    }
  }

  const [state, setState] = useState<T>(() => {
    const store = storageRef.current;
    if (!store) return initialValue;
    try {
      const raw = store.getItem(key);
      if (raw === null) return initialValue;
      return JSON.parse(raw) as T;
    } catch {
      return initialValue;
    }
  });

  useEffect(() => {
    const store = storageRef.current;
    if (!store) return;
    try {
      if (state === undefined || state === null) {
        store.removeItem(key);
      } else {
        store.setItem(key, JSON.stringify(state));
      }
    } catch {
      // Quota exceeded / private mode — ignore silently
    }
  }, [key, state]);

  return [state, setState];
}
