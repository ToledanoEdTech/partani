/**
 * Auth helpers for admin-only API routes invoked from the browser.
 *
 * Accepts either:
 *   1. `Authorization: Bearer <Firebase ID token>` from a signed-in admin
 *   2. `Authorization: Bearer ${CRON_SECRET}` (same as cron / curl tooling)
 *
 * Admin identity: primary ADMIN_EMAIL, or a document in Firestore
 * `admins/{email}` (same as firestore.rules / frontend).
 */
import type { VercelRequest } from '@vercel/node';

import { getAdminAuth, getAdminDb } from './firebase-admin.js';

const DEFAULT_ADMIN_EMAIL = 'yossitole@gmail.com';

export function getAdminEmail(): string {
  return (process.env.ADMIN_EMAIL || DEFAULT_ADMIN_EMAIL).trim().toLowerCase();
}

function extractBearer(req: VercelRequest): string | null {
  const header = req.headers['authorization'];
  if (typeof header !== 'string') return null;
  const match = /^Bearer\s+(.+)$/i.exec(header.trim());
  return match?.[1]?.trim() || null;
}

function isCronSecret(token: string): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return process.env.NODE_ENV !== 'production' && token === 'dev';
  return token === secret;
}

async function isEmailAdmin(email: string): Promise<boolean> {
  const normalized = email.trim().toLowerCase();
  if (!normalized) return false;
  if (normalized === getAdminEmail()) return true;
  try {
    const snap = await getAdminDb().collection('admins').doc(normalized).get();
    return snap.exists;
  } catch (err) {
    console.error('[admin-auth] failed to read admins doc', err);
    return false;
  }
}

export type AdminAuthResult =
  | { ok: true; email: string; via: 'firebase' | 'cron' }
  | { ok: false; status: number; error: string };

/**
 * Verify the caller is an admin. Prefer Firebase ID tokens from the UI;
 * CRON_SECRET remains valid for curl / ops.
 */
export async function requireAdmin(req: VercelRequest): Promise<AdminAuthResult> {
  const token = extractBearer(req);

  // Local/dev convenience: no secret configured and no Bearer → allow.
  if (!token) {
    if (!process.env.CRON_SECRET && process.env.NODE_ENV !== 'production') {
      return { ok: true, email: getAdminEmail(), via: 'cron' };
    }
    return { ok: false, status: 401, error: 'unauthorized' };
  }

  if (isCronSecret(token)) {
    return { ok: true, email: getAdminEmail(), via: 'cron' };
  }

  try {
    const decoded = await getAdminAuth().verifyIdToken(token);
    const email = (decoded.email || '').trim().toLowerCase();
    if (!email) {
      return { ok: false, status: 403, error: 'forbidden' };
    }
    const allowed = await isEmailAdmin(email);
    if (!allowed) {
      return { ok: false, status: 403, error: 'forbidden' };
    }
    return { ok: true, email, via: 'firebase' };
  } catch {
    return { ok: false, status: 401, error: 'unauthorized' };
  }
}
