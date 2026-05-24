/**
 * Dynamic-import probe — loads each suspect module one-by-one in
 * try/catch, returning per-module status. Lets us see WHICH import
 * is crashing the real /api/cron/email-reminders handler.
 *
 * GET /api/debug
 */
export default async function handler(_req: any, res: any) {
  const probes: Record<string, { ok: boolean; error?: string; exports?: string[] }> = {};

  async function probe(name: string, fn: () => Promise<unknown>) {
    try {
      const mod = (await fn()) as Record<string, unknown>;
      probes[name] = {
        ok: true,
        exports: mod && typeof mod === 'object' ? Object.keys(mod).slice(0, 10) : [],
      };
    } catch (err) {
      probes[name] = {
        ok: false,
        error: err instanceof Error ? `${err.name}: ${err.message}` : String(err),
      };
    }
  }

  await probe('resend', () => import('resend'));
  await probe('firebase-admin/app', () => import('firebase-admin/app'));
  await probe('firebase-admin/firestore', () => import('firebase-admin/firestore'));
  await probe('local: ./_lib/firebase-admin.js', () => import('./_lib/firebase-admin.js'));
  await probe('local: ./_lib/email-template.js', () => import('./_lib/email-template.js'));
  await probe('local: ../src/lib/lesson-stats.js', () => import('../src/lib/lesson-stats.js'));
  await probe('local: ../src/types.js', () => import('../src/types.js'));

  res.status(200).json({
    ok: true,
    runtime: process.version,
    probes,
  });
}
