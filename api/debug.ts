/**
 * Tiny diagnostic endpoint — no external imports. Used to verify the
 * Vercel serverless runtime is operational and to inspect which env
 * vars are visible to the function (without leaking their values).
 *
 * GET /api/debug
 */
export default function handler(req: any, res: any) {
  const envKeys = Object.keys(process.env)
    .filter(
      (k) =>
        k.startsWith('FIREBASE_ADMIN_') ||
        k === 'RESEND_API_KEY' ||
        k === 'MAIL_FROM' ||
        k === 'APP_URL' ||
        k === 'CRON_SECRET' ||
        k === 'VERCEL' ||
        k === 'VERCEL_ENV' ||
        k === 'NODE_ENV'
    )
    .sort();

  const envPresence: Record<string, string> = {};
  for (const k of envKeys) {
    const v = process.env[k];
    if (k === 'CRON_SECRET' || k === 'RESEND_API_KEY' || k === 'FIREBASE_ADMIN_PRIVATE_KEY') {
      envPresence[k] = v ? `set (length: ${v.length})` : 'MISSING';
    } else {
      envPresence[k] = v ? `set: ${v.slice(0, 80)}${v.length > 80 ? '...' : ''}` : 'MISSING';
    }
  }

  res.status(200).json({
    ok: true,
    runtime: process.version,
    cwd: process.cwd(),
    method: req.method,
    url: req.url,
    envPresence,
  });
}
