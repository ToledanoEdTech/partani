/**
 * Promote Hebrew yeshiva class names one grade forward.
 * Examples: ז3 → ח3, י1 → יא1, יא2 → יב2, יב1 → graduated.
 */

const GRADE_ORDER = ['ז', 'ח', 'ט', 'י', 'יא', 'יב'] as const;
type Grade = (typeof GRADE_ORDER)[number];

/** Longest-first so יא/יב win over י. */
const GRADES_PARSE_ORDER: Grade[] = ['יב', 'יא', 'י', 'ט', 'ח', 'ז'];

export interface ParsedClassName {
  grade: Grade;
  /** Track / parallel class number, e.g. "1" in י1. Empty if none. */
  track: string;
  normalized: string;
}

export type PromoteResult =
  | { kind: 'promoted'; from: string; to: string }
  | { kind: 'graduated'; from: string; to: string }
  | { kind: 'unchanged'; from: string; reason: string };

export interface StudentPromotionPlan {
  id: string;
  name: string;
  from: string;
  to: string;
  kind: 'promoted' | 'graduated' | 'unchanged';
  reason?: string;
  /** Payload to write when applying. */
  updates?: { className: string; active?: boolean };
}

/** Strip geresh / quotes / spaces for parsing. */
export function normalizeClassToken(raw: string): string {
  return String(raw || '')
    .trim()
    .replace(/['׳`"״]/g, '')
    .replace(/\s+/g, '');
}

export function parseClassName(raw: string): ParsedClassName | null {
  const s = normalizeClassToken(raw);
  if (!s) return null;

  for (const grade of GRADES_PARSE_ORDER) {
    if (!s.startsWith(grade)) continue;
    const rest = s.slice(grade.length);
    if (rest === '' || /^\d{1,2}$/.test(rest)) {
      return { grade, track: rest, normalized: `${grade}${rest}` };
    }
  }
  return null;
}

export function nextGrade(grade: Grade): Grade | null {
  const i = GRADE_ORDER.indexOf(grade);
  if (i < 0 || i >= GRADE_ORDER.length - 1) return null;
  return GRADE_ORDER[i + 1]!;
}

/** Yeshiva class order (ז→יב, then track number), with Hebrew fallback. */
export function compareHebrewClassNames(a: string, b: string): number {
  const pa = parseClassName(a);
  const pb = parseClassName(b);

  if (pa && pb) {
    const gradeCmp = GRADE_ORDER.indexOf(pa.grade) - GRADE_ORDER.indexOf(pb.grade);
    if (gradeCmp !== 0) return gradeCmp;
    const trackA = pa.track ? Number.parseInt(pa.track, 10) : 0;
    const trackB = pb.track ? Number.parseInt(pb.track, 10) : 0;
    if (trackA !== trackB) return trackA - trackB;
    return pa.normalized.localeCompare(pb.normalized, 'he');
  }

  return normalizeClassToken(a).localeCompare(normalizeClassToken(b), 'he');
}

/** Compute next class label for a single className string. */
export function promoteClassName(className: string): PromoteResult {
  const parsed = parseClassName(className);
  if (!parsed) {
    return { kind: 'unchanged', from: className, reason: 'פורמט כיתה לא מזוהה' };
  }

  const nxt = nextGrade(parsed.grade);
  if (!nxt) {
    return {
      kind: 'graduated',
      from: className,
      to: `בוגר (${parsed.normalized})`,
    };
  }

  return {
    kind: 'promoted',
    from: className,
    to: `${nxt}${parsed.track}`,
  };
}

export function buildStudentPromotionPlan(
  students: Array<{ id: string; name: string; className: string; active: boolean }>,
  options: { onlyActive?: boolean } = { onlyActive: true },
): StudentPromotionPlan[] {
  const list = options.onlyActive === false ? students : students.filter((s) => s.active);

  return list.map((s) => {
    const result = promoteClassName(s.className);
    if (result.kind === 'promoted') {
      return {
        id: s.id,
        name: s.name,
        from: s.className,
        to: result.to,
        kind: 'promoted',
        updates: { className: result.to },
      };
    }
    if (result.kind === 'graduated') {
      return {
        id: s.id,
        name: s.name,
        from: s.className,
        to: result.to,
        kind: 'graduated',
        updates: { className: result.to, active: false },
      };
    }
    return {
      id: s.id,
      name: s.name,
      from: s.className,
      to: s.className,
      kind: 'unchanged',
      reason: result.reason,
    };
  });
}

export function summarizePromotionPlan(plan: StudentPromotionPlan[]) {
  return {
    total: plan.length,
    promoted: plan.filter((p) => p.kind === 'promoted').length,
    graduated: plan.filter((p) => p.kind === 'graduated').length,
    unchanged: plan.filter((p) => p.kind === 'unchanged').length,
    actionable: plan.filter((p) => p.updates).length,
  };
}
