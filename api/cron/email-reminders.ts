/**
 * Weekly email reminder cron.
 *
 * Triggered by Vercel Cron (see `vercel.json`). Iterates over active
 * teachers whose `emailRemindersEnabled` is not explicitly `false`,
 * counts the lessons in the *current IL calendar week* that have already
 * passed (date ≤ today, Asia/Jerusalem) and were not yet reported, and
 * emails the teacher via Resend if `missingCount >= minMissingLessons`.
 *
 * Dedup: at most one email per teacher per IL week. The dedup state lives
 * in `settings/general.emailReminders.lastSentByTeacher[teacherId] = weekKey`.
 *
 * Manual / dry-run invocation:
 *   GET /api/cron/email-reminders?dryRun=1
 *   GET /api/cron/email-reminders?force=1   (ignores the once-per-week dedup)
 *
 * Auth: Vercel Cron sends `Authorization: Bearer ${CRON_SECRET}` when
 * `CRON_SECRET` is configured. In production the secret is *required*;
 * locally (no NODE_ENV=production) we let unauthenticated requests through
 * to make dry-runs easier.
 */
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { Resend } from 'resend';

// Explicit ".js" extensions on local imports are mandatory because
// `package.json` declares `"type": "module"` — Node ESM resolution
// in the Vercel runtime rejects extensionless relative specifiers.
// TypeScript with `moduleResolution: "bundler"` understands these
// `.js` paths as referring to the corresponding `.ts` source files.
import { EMAIL_SUBJECT, renderReminderEmail } from '../_lib/email-template.js';
import { getAdminDb } from '../_lib/firebase-admin.js';
import {
  formatDateInTZ,
  getMissingLessonsForTeacherThisWeek,
  getWeekKey,
  ISRAEL_TIMEZONE,
} from '../../src/lib/lesson-stats.js';
import type { EmailReminderSettings, Report, Schedule, Teacher } from '../../src/types.js';

const DEFAULT_MIN_MISSING = 2;

type SkipReason =
  | 'inactive'
  | 'opt-out'
  | 'no-email'
  | 'dedup'
  | 'not-enough-missing';

interface ResultEntry {
  teacherId: string;
  teacherEmail: string;
  teacherName: string;
  status: 'sent' | 'skipped' | 'error';
  reason?: SkipReason | string;
  missingCount?: number;
}

interface RunSummary {
  sent: number;
  skipped: number;
  errors: number;
}

function isAuthorized(req: VercelRequest): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    // No secret configured. In production, require one. Locally we allow.
    return process.env.NODE_ENV !== 'production';
  }
  const header = req.headers['authorization'];
  return header === `Bearer ${secret}`;
}

function parseFlag(value: string | string[] | undefined): boolean {
  if (Array.isArray(value)) value = value[0];
  return value === '1' || value === 'true' || value === 'yes';
}

export default async function handler(req: VercelRequest, res: VercelResponse): Promise<void> {
  if (req.method !== 'GET' && req.method !== 'POST') {
    res.status(405).json({ ok: false, error: 'method not allowed' });
    return;
  }

  if (!isAuthorized(req)) {
    res.status(401).json({ ok: false, error: 'unauthorized' });
    return;
  }

  const now = new Date();
  const weekKey = getWeekKey(now, ISRAEL_TIMEZONE);
  const todayStr = formatDateInTZ(now, ISRAEL_TIMEZONE);

  const dryRun = parseFlag(req.query.dryRun);
  const force = parseFlag(req.query.force);

  let db: ReturnType<typeof getAdminDb>;
  try {
    db = getAdminDb();
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    res.status(500).json({ ok: false, error: message });
    return;
  }

  const settingsRef = db.collection('settings').doc('general');
  const settingsSnap = await settingsRef.get();
  const settings = settingsSnap.exists ? (settingsSnap.data() as Record<string, unknown>) : {};
  const reminderCfg: EmailReminderSettings = (settings.emailReminders as EmailReminderSettings) || {};

  const globalEnabled = reminderCfg.enabled !== false; // default true
  const minMissing = Math.max(
    2,
    Number.isFinite(Number(reminderCfg.minMissingLessons))
      ? Number(reminderCfg.minMissingLessons)
      : DEFAULT_MIN_MISSING
  );
  const lastSentByTeacher: Record<string, string> = { ...(reminderCfg.lastSentByTeacher || {}) };

  if (!globalEnabled) {
    res.status(200).json({
      ok: true,
      skipped: true,
      reason: 'globally-disabled',
      now: now.toISOString(),
      todayStr,
      weekKey,
    });
    return;
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

  const summary: RunSummary = { sent: 0, skipped: 0, errors: 0 };
  const results: ResultEntry[] = [];
  const newLastSent: Record<string, string> = { ...lastSentByTeacher };

  // Resolve mail config up-front so we fail fast if misconfigured.
  const resendKey = process.env.RESEND_API_KEY;
  const mailFrom = process.env.MAIL_FROM;
  const appUrl = process.env.APP_URL || 'https://partani-topaz.vercel.app';

  if (!dryRun && (!resendKey || !mailFrom)) {
    res.status(500).json({
      ok: false,
      error:
        'Missing mail config: RESEND_API_KEY and/or MAIL_FROM are not set. ' +
        'Set them in the Vercel environment, or call this endpoint with ?dryRun=1.',
    });
    return;
  }

  const resend = dryRun || !resendKey ? null : new Resend(resendKey);

  for (const t of teachers) {
    const base: Omit<ResultEntry, 'status' | 'reason'> = {
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

    try {
      const { html, text } = renderReminderEmail({
        teacherName: t.name,
        missingLessons: missing,
        totalMissing: missing.length,
        appUrl,
      });

      await resend!.emails.send({
        from: mailFrom!,
        to: t.email,
        subject: EMAIL_SUBJECT,
        html,
        text,
        headers: {
          // Helps email clients render Hebrew correctly even when "lang"
          // attribute parsing is shaky.
          'Content-Language': 'he',
        },
      });

      results.push({ ...base, status: 'sent', missingCount: missing.length });
      summary.sent++;
      newLastSent[t.id] = weekKey;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.error(`[email-reminders] failed to send to ${t.email}:`, message);
      results.push({
        ...base,
        status: 'error',
        reason: message,
        missingCount: missing.length,
      });
      summary.errors++;
    }
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

  res.status(200).json({
    ok: true,
    now: now.toISOString(),
    todayStr,
    weekKey,
    dryRun,
    force,
    minMissing,
    summary,
    results,
  });
}
