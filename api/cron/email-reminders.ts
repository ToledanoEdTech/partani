/**
 * Weekly email reminder cron.
 *
 * Triggered by Vercel Cron (see `vercel.json`). See
 * `api/_lib/run-email-reminders.ts` for the send logic.
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

import { runEmailReminders } from '../_lib/run-email-reminders.js';

function isAuthorized(req: VercelRequest): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
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

  const dryRun = parseFlag(req.query.dryRun);
  const force = parseFlag(req.query.force);

  try {
    const result = await runEmailReminders({ dryRun, force });
    res.status(200).json(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    res.status(500).json({
      ok: false,
      error: dryRun
        ? message
        : `${message} (or invoke with ?dryRun=1 to test without sending).`,
    });
  }
}
