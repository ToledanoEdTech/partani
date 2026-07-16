import type { ReactNode } from 'react';

export type AdminTabId =
  | 'overview'
  | 'teachers'
  | 'students'
  | 'schedule'
  | 'timetable'
  | 'reports'
  | 'settings';

export interface AdminNavItem {
  id: AdminTabId;
  label: string;
  /** Shorter label for compact UI */
  shortLabel: string;
}

/** Canonical admin navigation — shared by drawer + desktop sidebar. */
export const ADMIN_NAV_ITEMS: AdminNavItem[] = [
  { id: 'overview', label: 'סטטיסטיקה', shortLabel: 'סטטיסטיקה' },
  { id: 'teachers', label: 'מורים', shortLabel: 'מורים' },
  { id: 'students', label: 'תלמידים', shortLabel: 'תלמידים' },
  { id: 'schedule', label: 'שיבוץ שיעורים', shortLabel: 'שיבוץ' },
  { id: 'timetable', label: 'לוח שבועי', shortLabel: 'לוח שבועי' },
  { id: 'reports', label: 'דיווחים', shortLabel: 'דיווחים' },
  { id: 'settings', label: 'הגדרות', shortLabel: 'הגדרות' },
];

export function getAdminTabLabel(tabId: string): string {
  return ADMIN_NAV_ITEMS.find((i) => i.id === tabId)?.label ?? 'ניהול';
}

/** Icon key mapped in App.tsx to lucide icons (keeps this module free of JSX). */
export type AdminNavIconKey =
  | 'overview'
  | 'teachers'
  | 'students'
  | 'schedule'
  | 'timetable'
  | 'reports'
  | 'settings';

export function adminNavIconKey(id: AdminTabId): AdminNavIconKey {
  return id;
}

export type AdminNavRenderItem = AdminNavItem & { icon: ReactNode };
