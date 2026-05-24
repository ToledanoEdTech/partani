/**
 * End-to-end Resend smoke-test endpoint.
 *
 * Sends ONE Hebrew reminder email with sample/synthetic data to the
 * address passed in `?to=...`. Useful when you want to verify the
 * complete pipeline (env vars → Resend client → template → delivery)
 * without waiting for a teacher to have real missing lessons.
 *
 * Auth: same Bearer-token model as the cron — protected by
 * `CRON_SECRET` so the endpoint can't be abused as a spam relay.
 *
 *   curl --ssl-no-revoke -H "Authorization: Bearer $CRON_SECRET" \
 *     "https://partani-topaz.vercel.app/api/test-email?to=you@example.com"
 */
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { Resend } from 'resend';

import { EMAIL_SUBJECT, renderReminderEmail } from './_lib/email-template.js';
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

  const resendKey = process.env.RESEND_API_KEY;
  // Allow overriding MAIL_FROM via `?from=` to test verified-domain vs
  // sandbox sender quickly, without round-tripping through the Vercel UI.
  const fromOverride = typeof req.query.from === 'string' ? req.query.from : undefined;
  const mailFrom = fromOverride || process.env.MAIL_FROM;
  const appUrl = process.env.APP_URL || 'https://partani-topaz.vercel.app';

  if (!resendKey || !mailFrom) {
    res.status(500).json({
      ok: false,
      error: 'Missing RESEND_API_KEY or MAIL_FROM env vars.',
    });
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

  const resend = new Resend(resendKey);
  try {
    const result = await resend.emails.send({
      from: mailFrom,
      to,
      subject: `[TEST] ${EMAIL_SUBJECT}`,
      html,
      text,
      headers: { 'Content-Language': 'he' },
    });

    // The Resend SDK does NOT throw on API errors — it returns
    // `{ data: null, error: {...} }`. We surface that explicitly so the
    // caller can rely on the HTTP status / `ok` flag alone.
    const resendError = (result as any)?.error;
    if (resendError) {
      const statusCode = Number(resendError.statusCode) || 500;
      res.status(statusCode).json({
        ok: false,
        from: mailFrom,
        attemptedTo: to,
        error: {
          name: resendError.name,
          statusCode: resendError.statusCode,
          message: resendError.message,
        },
      });
      return;
    }

    res.status(200).json({
      ok: true,
      sentTo: to,
      from: mailFrom,
      resendId: (result as any)?.data?.id ?? null,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('[test-email] send failed:', err);
    res.status(500).json({ ok: false, error: message });
  }
}
