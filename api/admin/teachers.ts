/**
 * Admin CRUD for teachers — uses Firebase Admin SDK (bypasses Firestore rules).
 *
 * Auth: Firebase ID token of the admin user, or CRON_SECRET Bearer.
 *
 *   POST   /api/admin/teachers          body: { name, email, subject, active?, emailRemindersEnabled? }
 *   PATCH  /api/admin/teachers          body: { id, name?, email?, subject?, active?, emailRemindersEnabled? }
 *   DELETE /api/admin/teachers?id=...
 */
import type { VercelRequest, VercelResponse } from '@vercel/node';

import { requireAdmin } from '../_lib/admin-auth.js';
import { getAdminDb } from '../_lib/firebase-admin.js';

type TeacherFields = {
  name?: string;
  email?: string;
  subject?: string;
  active?: boolean;
  emailRemindersEnabled?: boolean;
};

function cleanString(value: unknown, max = 128): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  if (!trimmed || trimmed.length > max) return null;
  return trimmed;
}

function buildTeacherData(
  input: TeacherFields,
  opts: { requireAll: boolean }
): { ok: true; data: Record<string, unknown> } | { ok: false; error: string } {
  const data: Record<string, unknown> = {};

  if (input.name !== undefined || opts.requireAll) {
    const name = cleanString(input.name);
    if (!name) return { ok: false, error: 'name is required' };
    data.name = name;
  }

  if (input.email !== undefined || opts.requireAll) {
    const email = cleanString(input.email)?.toLowerCase();
    if (!email || !email.includes('@')) return { ok: false, error: 'valid email is required' };
    data.email = email;
  }

  if (input.subject !== undefined || opts.requireAll) {
    const subject = typeof input.subject === 'string' ? input.subject.trim() : '';
    if (subject.length > 128) return { ok: false, error: 'subject too long' };
    data.subject = subject || 'כללי';
  }

  if (input.active !== undefined) {
    if (typeof input.active !== 'boolean') return { ok: false, error: 'active must be boolean' };
    data.active = input.active;
  } else if (opts.requireAll) {
    data.active = true;
  }

  if (input.emailRemindersEnabled !== undefined) {
    if (typeof input.emailRemindersEnabled !== 'boolean') {
      return { ok: false, error: 'emailRemindersEnabled must be boolean' };
    }
    data.emailRemindersEnabled = input.emailRemindersEnabled;
  }

  return { ok: true, data };
}

async function cascadeTeacherEmail(
  teacherId: string,
  oldEmail: string,
  newEmail: string
): Promise<void> {
  if (!oldEmail || oldEmail === newEmail) return;
  const db = getAdminDb();
  const [schedulesSnap, reportsSnap] = await Promise.all([
    db.collection('schedules').where('teacherId', '==', teacherId).get(),
    db.collection('reports').where('teacherId', '==', teacherId).get(),
  ]);

  const batch = db.batch();
  let ops = 0;
  for (const doc of schedulesSnap.docs) {
    batch.update(doc.ref, { teacherEmail: newEmail });
    ops++;
  }
  for (const doc of reportsSnap.docs) {
    batch.update(doc.ref, { teacherEmail: newEmail });
    ops++;
  }
  if (ops > 0) await batch.commit();
}

export default async function handler(req: VercelRequest, res: VercelResponse): Promise<void> {
  const auth = await requireAdmin(req);
  if (auth.ok === false) {
    res.status(auth.status).json({ ok: false, error: auth.error });
    return;
  }

  try {
    const db = getAdminDb();
    const body = (typeof req.body === 'object' && req.body !== null ? req.body : {}) as TeacherFields & {
      id?: string;
    };

    if (req.method === 'POST') {
      const built = buildTeacherData(body, { requireAll: true });
      if (built.ok === false) {
        res.status(400).json({ ok: false, error: built.error });
        return;
      }
      const ref = db.collection('teachers').doc();
      await ref.set(built.data);
      res.status(200).json({ ok: true, id: ref.id });
      return;
    }

    if (req.method === 'PATCH') {
      const id = typeof body.id === 'string' ? body.id.trim() : '';
      if (!id) {
        res.status(400).json({ ok: false, error: 'id is required' });
        return;
      }
      const ref = db.collection('teachers').doc(id);
      const snap = await ref.get();
      if (!snap.exists) {
        res.status(404).json({ ok: false, error: 'teacher not found' });
        return;
      }

      const built = buildTeacherData(body, { requireAll: false });
      if (built.ok === false) {
        res.status(400).json({ ok: false, error: built.error });
        return;
      }
      if (Object.keys(built.data).length === 0) {
        res.status(400).json({ ok: false, error: 'no fields to update' });
        return;
      }

      const prev = snap.data() || {};
      const prevEmail = typeof prev.email === 'string' ? prev.email : '';
      await ref.set(built.data, { merge: true });

      const nextEmail = typeof built.data.email === 'string' ? built.data.email : prevEmail;
      if (nextEmail && prevEmail && nextEmail !== prevEmail) {
        await cascadeTeacherEmail(id, prevEmail, nextEmail);
      }

      res.status(200).json({ ok: true, id });
      return;
    }

    if (req.method === 'DELETE') {
      const idParam = req.query.id;
      const id = typeof idParam === 'string' ? idParam.trim() : typeof body.id === 'string' ? body.id.trim() : '';
      if (!id) {
        res.status(400).json({ ok: false, error: 'id is required' });
        return;
      }
      await db.collection('teachers').doc(id).delete();
      res.status(200).json({ ok: true, id });
      return;
    }

    res.status(405).json({ ok: false, error: 'method not allowed' });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('[admin/teachers]', message);
    res.status(500).json({ ok: false, error: message });
  }
}
