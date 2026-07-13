/** Hour slots shown in the weekly timetable and schedule forms (0–10). */
export const SCHEDULE_HOUR_OPTIONS = [
  '0', '1', '2', '3', '4', '5', '6', '7', '8', '9', '10',
] as const;

/** Built-in subjects for private-tutoring schedule entry. */
export const DEFAULT_SCHEDULE_SUBJECTS = [
  'אנגלית',
  'מתמטיקה',
  'גמרא',
  'עברית',
  'היסטוריה',
  'ספרות',
  'חנ"מ',
  'אחר',
] as const;

/** Merge default subjects with admin-added custom ones (deduped, defaults first). */
export function mergeScheduleSubjects(custom: string[] | undefined | null): string[] {
  const seen = new Set<string>(DEFAULT_SCHEDULE_SUBJECTS);
  const result: string[] = [...DEFAULT_SCHEDULE_SUBJECTS];
  for (const raw of custom || []) {
    const s = String(raw).trim();
    if (!s || seen.has(s)) continue;
    seen.add(s);
    result.push(s);
  }
  return result;
}
