/**
 * Admin "send reminders now" endpoint.
 *
 * Runs the same logic as the weekly cron with `force=1` (bypasses
 * once-per-week dedup) so the admin can push reminders immediately
 * from the settings UI.
 *
 * Auth: Firebase ID token of the admin user, or CRON_SECRET Bearer.
 *
 *   POST /api/admin/send-reminders
 *   Authorization: Bearer <Firebase ID token>
 */
import type { VercelRequest, VercelResponse } from '@vercel/node';

import { requireAdmin } from '../_lib/admin-auth.js';
import { runEmailReminders } from '../_lib/run-email-reminders.js';

export default async function handler(req: VercelRequest, res: VercelResponse): Promise<void> {
  if (req.method !== 'POST' && req.method !== 'GET') {
    res.status(405).json({ ok: false, error: 'method not allowed' });
    return;
  }

  const auth = await requireAdmin(req);
  if (auth.ok === false) {
    res.status(auth.status).json({ ok: false, error: auth.error });
    return;
  }

  try {
    const result = await runEmailReminders({ force: true, dryRun: false });
    res.status(200).json(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('[admin/send-reminders]', message);
    res.status(500).json({ ok: false, error: message });
  }
}
