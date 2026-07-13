/**
 * Shared runner for weekly teacher reminder emails.
 * Used by the Vercel cron and by the admin "send now" endpoint.
 */
import { EMAIL_SUBJECT, renderReminderEmail } from './email-template.js';
import { getAdminDb } from './firebase-admin.js';
import { resolveMailFrom, sendMail } from './mailer.js';
import {
  formatDateInTZ,
  getMissingLessonsForTeacherThisWeek,
  getWeekKey,
  ISRAEL_TIMEZONE,
} from '../../src/lib/lesson-stats.js';
import type { EmailReminderSettings, Report, Schedule, Teacher } from '../../src/types.js';

const DEFAULT_MIN_MISSING = 1;

type SkipReason =
  | 'inactive'
  | 'opt-out'
  | 'no-email'
  | 'dedup'
  | 'not-enough-missing';

export interface ReminderResultEntry {
  teacherId: string;
  teacherEmail: string;
  teacherName: string;
  status: 'sent' | 'skipped' | 'error';
  reason?: SkipReason | string;
  missingCount?: number;
}

export interface ReminderRunSummary {
  sent: number;
  skipped: number;
  errors: number;
}

export interface ReminderRunOptions {
  dryRun?: boolean;
  /** Bypass once-per-week dedup (used by admin "send now"). */
  force?: boolean;
}

export interface ReminderRunResult {
  ok: true;
  now: string;
  todayStr: string;
  weekKey: string;
  dryRun: boolean;
  force: boolean;
  minMissing: number;
  skipped?: true;
  reason?: string;
  summary?: ReminderRunSummary;
  results?: ReminderResultEntry[];
}

export async function runEmailReminders(
  options: ReminderRunOptions = {}
): Promise<ReminderRunResult> {
  const dryRun = Boolean(options.dryRun);
  const force = Boolean(options.force);

  const now = new Date();
  const weekKey = getWeekKey(now, ISRAEL_TIMEZONE);
  const todayStr = formatDateInTZ(now, ISRAEL_TIMEZONE);

  const db = getAdminDb();
  const settingsRef = db.collection('settings').doc('general');
  const settingsSnap = await settingsRef.get();
  const settings = settingsSnap.exists ? (settingsSnap.data() as Record<string, unknown>) : {};
  const reminderCfg: EmailReminderSettings = (settings.emailReminders as EmailReminderSettings) || {};

  const globalEnabled = reminderCfg.enabled !== false;
  const minMissing = Math.max(
    1,
    Number.isFinite(Number(reminderCfg.minMissingLessons))
      ? Number(reminderCfg.minMissingLessons)
      : DEFAULT_MIN_MISSING
  );
  const lastSentByTeacher: Record<string, string> = { ...(reminderCfg.lastSentByTeacher || {}) };

  if (!globalEnabled) {
    return {
      ok: true,
      skipped: true,
      reason: 'globally-disabled',
      now: now.toISOString(),
      todayStr,
      weekKey,
      dryRun,
      force,
      minMissing,
    };
  }

  const [teachersSnap, schedulesSnap, reportsSnap] = await Promise.all([
    db.collection('teachers').get(),
    db.collection('schedules').get(),
    db.collection('reports').get(),
  ]);

  const teachers: Teacher[] = teachersSnap.docs.map(
    (d) => ({ id: d.id, ...(d.data() as Omit<Teacher, 'id'>) })
  );
  const schedules: Schedule[] = schedulesSnap.docs.map(
    (d) => ({ id: d.id, ...(d.data() as Omit<Schedule, 'id'>) })
  );
  const reports: Report[] = reportsSnap.docs.map(
    (d) => ({ id: d.id, ...(d.data() as Omit<Report, 'id'>) })
  );

  const summary: ReminderRunSummary = { sent: 0, skipped: 0, errors: 0 };
  const results: ReminderResultEntry[] = [];
  const newLastSent: Record<string, string> = { ...lastSentByTeacher };

  const appUrl = process.env.APP_URL || 'https://partani-topaz.vercel.app';
  let mailFrom: string | null = null;
  if (!dryRun) {
    mailFrom = resolveMailFrom();
  }

  for (const t of teachers) {
    const base: Omit<ReminderResultEntry, 'status' | 'reason'> = {
      teacherId: t.id,
      teacherEmail: t.email || '',
      teacherName: t.name || '',
    };

    if (!t.active) {
      results.push({ ...base, status: 'skipped', reason: 'inactive' });
      summary.skipped++;
      continue;
    }
    if (t.emailRemindersEnabled === false) {
      results.push({ ...base, status: 'skipped', reason: 'opt-out' });
      summary.skipped++;
      continue;
    }
    if (!t.email) {
      results.push({ ...base, status: 'skipped', reason: 'no-email' });
      summary.skipped++;
      continue;
    }
    if (!force && lastSentByTeacher[t.id] === weekKey) {
      results.push({ ...base, status: 'skipped', reason: 'dedup' });
      summary.skipped++;
      continue;
    }

    const missing = getMissingLessonsForTeacherThisWeek({
      teacherId: t.id,
      schedules,
      reports,
      now,
      timeZone: ISRAEL_TIMEZONE,
    });

    if (missing.length < minMissing) {
      results.push({
        ...base,
        status: 'skipped',
        reason: 'not-enough-missing',
        missingCount: missing.length,
      });
      summary.skipped++;
      continue;
    }

    if (dryRun) {
      results.push({
        ...base,
        status: 'sent',
        reason: 'dry-run',
        missingCount: missing.length,
      });
      summary.sent++;
      newLastSent[t.id] = weekKey;
      continue;
    }

    const { html, text } = renderReminderEmail({
      teacherName: t.name,
      missingLessons: missing,
      totalMissing: missing.length,
      appUrl,
    });

    const sendResult = await sendMail({
      from: mailFrom!,
      to: t.email,
      subject: EMAIL_SUBJECT,
      html,
      text,
      headers: { 'Content-Language': 'he' },
    });

    if (sendResult.ok === false) {
      const errMsg = `${sendResult.error.name}: ${sendResult.error.message}`;
      console.error(`[email-reminders] smtp rejected send to ${t.email}:`, sendResult.error);
      results.push({
        ...base,
        status: 'error',
        reason: errMsg,
        missingCount: missing.length,
      });
      summary.errors++;
      continue;
    }

    results.push({ ...base, status: 'sent', missingCount: missing.length });
    summary.sent++;
    newLastSent[t.id] = weekKey;
  }

  if (!dryRun) {
    const updated: EmailReminderSettings = {
      ...reminderCfg,
      enabled: globalEnabled,
      minMissingLessons: minMissing,
      lastRunAt: new Date().toISOString(),
      lastRunSummary: summary,
      lastSentByTeacher: newLastSent,
    };
    await settingsRef.set({ emailReminders: updated }, { merge: true });
  }

  return {
    ok: true,
    now: now.toISOString(),
    todayStr,
    weekKey,
    dryRun,
    force,
    minMissing,
    summary,
    results,
  };
}
