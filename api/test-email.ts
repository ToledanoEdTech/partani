/**
 * End-to-end SMTP smoke-test endpoint.
 *
 * Sends ONE Hebrew reminder email with sample/synthetic data to the
 * address passed in `?to=...`. Useful when you want to verify the
 * complete pipeline (env vars → nodemailer transport → template →
 * delivery) without waiting for a teacher to have real missing lessons.
 *
 * Auth: same Bearer-token model as the cron — protected by
 * `CRON_SECRET` so the endpoint can't be abused as a spam relay.
 *
 *   curl --ssl-no-revoke -H "Authorization: Bearer $CRON_SECRET" \
 *     "https://partani-topaz.vercel.app/api/test-email?to=you@example.com"
 *
 * Optional `?from=...` override is supported mainly so the operator
 * can preview different display-name formats; the address part must
 * still match SMTP_USER (or a configured Gmail alias) or Gmail will
 * rewrite the From header.
 */
import type { VercelRequest, VercelResponse } from '@vercel/node';

import { EMAIL_SUBJECT, renderReminderEmail } from './_lib/email-template.js';
import { resolveMailFrom, sendMail } from './_lib/mailer.js';
import type { MissingLesson } from '../src/lib/lesson-stats.js';

function isAuthorized(req: VercelRequest): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return process.env.NODE_ENV !== 'production';
  return req.headers['authorization'] === `Bearer ${secret}`;
}

export default async function handler(req: VercelRequest, res: VercelResponse): Promise<void> {
  if (!isAuthorized(req)) {
    res.status(401).json({ ok: false, error: 'unauthorized' });
    return;
  }

  const to = req.query.to;
  if (typeof to !== 'string' || !/.+@.+\..+/.test(to)) {
    res.status(400).json({
      ok: false,
      error: "Missing or invalid `?to=` query param (expected an email address).",
    });
    return;
  }

  const fromOverride = typeof req.query.from === 'string' ? req.query.from : undefined;
  const appUrl = process.env.APP_URL || 'https://partani-topaz.vercel.app';

  let mailFrom: string;
  try {
    mailFrom = resolveMailFrom(fromOverride);
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
    subject: `[TEST] ${EMAIL_SUBJECT}`,
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
    smtpResponse: result.response,
  });
}
