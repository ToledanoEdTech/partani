/**
 * Admin test-email endpoint.
 *
 * Sends ONE Hebrew reminder email with sample/synthetic data to the
 * address in the request body / query. Used from the settings UI to
 * verify SMTP + template delivery without waiting for real missing lessons.
 *
 * Auth: Firebase ID token of the admin user, or CRON_SECRET Bearer.
 *
 *   POST /api/admin/test-email
 *   Authorization: Bearer <Firebase ID token>
 *   Body: { "to": "you@example.com" }
 *
 * Also accepts `?to=` for curl convenience.
 */
import type { VercelRequest, VercelResponse } from '@vercel/node';

import { requireAdmin } from '../_lib/admin-auth.js';
import { EMAIL_SUBJECT, renderReminderEmail } from '../_lib/email-template.js';
import { resolveMailFrom, sendMail } from '../_lib/mailer.js';
import type { MissingLesson } from '../../src/lib/lesson-stats.js';

function readTo(req: VercelRequest): string | null {
  const q = req.query.to;
  if (typeof q === 'string' && q.trim()) return q.trim();

  const body = req.body;
  if (body && typeof body === 'object' && typeof (body as { to?: unknown }).to === 'string') {
    return ((body as { to: string }).to || '').trim();
  }
  return null;
}

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

  const to = readTo(req);
  if (!to || !/.+@.+\..+/.test(to)) {
    res.status(400).json({
      ok: false,
      error: 'Missing or invalid email address (`to`).',
    });
    return;
  }

  const appUrl = process.env.APP_URL || 'https://partani-topaz.vercel.app';

  let mailFrom: string;
  try {
    mailFrom = resolveMailFrom();
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    res.status(500).json({ ok: false, error: message });
    return;
  }

  const today = new Date();
  const fmt = (offset: number) => {
    const d = new Date(today.getTime() - offset * 86_400_000);
    return d.toISOString().slice(0, 10);
  };

  const sample: MissingLesson[] = [
    {
      scheduleId: 'demo-1',
      date: fmt(2),
      day: 'חמישי',
      hour: '2',
      studentName: 'אברהם פריד (לדוגמה)',
      subject: 'גמרא',
    },
    {
      scheduleId: 'demo-2',
      date: fmt(1),
      day: 'שישי',
      hour: '3',
      studentName: 'יעקב שמעוני (לדוגמה)',
      subject: 'תנ"ך',
    },
    {
      scheduleId: 'demo-3',
      date: fmt(0),
      day: 'ראשון',
      hour: '1',
      studentName: 'דוד כהן (לדוגמה)',
      subject: 'מתמטיקה',
    },
  ];

  const { html, text } = renderReminderEmail({
    teacherName: 'מורה לדוגמה',
    missingLessons: sample,
    totalMissing: sample.length,
    appUrl,
  });

  const result = await sendMail({
    from: mailFrom,
    to,
    subject: `[בדיקה] ${EMAIL_SUBJECT}`,
    html,
    text,
    headers: { 'Content-Language': 'he' },
  });

  if (result.ok === false) {
    res.status(502).json({
      ok: false,
      from: mailFrom,
      attemptedTo: to,
      error: result.error,
    });
    return;
  }

  res.status(200).json({
    ok: true,
    from: mailFrom,
    sentTo: to,
    messageId: result.messageId,
    accepted: result.accepted,
    rejected: result.rejected,
  });
}
