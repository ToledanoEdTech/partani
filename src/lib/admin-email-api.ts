/**
 * Authenticated fetch helpers for admin-only email reminder APIs.
 */
import { auth } from '../firebase';

async function getAdminAuthHeader(): Promise<HeadersInit> {
  const user = auth.currentUser;
  if (!user) {
    throw new Error('יש להתחבר מחדש כדי לבצע פעולה זו');
  }
  const token = await user.getIdToken();
  return {
    Authorization: `Bearer ${token}`,
    'Content-Type': 'application/json',
  };
}

async function parseJson(res: Response): Promise<Record<string, unknown>> {
  try {
    return (await res.json()) as Record<string, unknown>;
  } catch {
    return {};
  }
}

export interface SendRemindersNowResult {
  ok: boolean;
  skipped?: boolean;
  reason?: string;
  summary?: { sent: number; skipped: number; errors: number };
  error?: string;
}

export async function sendRemindersNow(): Promise<SendRemindersNowResult> {
  const headers = await getAdminAuthHeader();
  const res = await fetch('/api/admin/send-reminders', {
    method: 'POST',
    headers,
  });
  const data = await parseJson(res);
  if (!res.ok) {
    return {
      ok: false,
      error: typeof data.error === 'string' ? data.error : `שגיאה (${res.status})`,
    };
  }
  return data as unknown as SendRemindersNowResult;
}

export interface SendTestReminderResult {
  ok: boolean;
  sentTo?: string;
  error?: string | { message?: string };
}

export async function sendTestReminderEmail(to: string): Promise<SendTestReminderResult> {
  const headers = await getAdminAuthHeader();
  const res = await fetch('/api/admin/test-email', {
    method: 'POST',
    headers,
    body: JSON.stringify({ to }),
  });
  const data = await parseJson(res);
  if (!res.ok) {
    const err = data.error;
    const message =
      typeof err === 'string'
        ? err
        : err && typeof err === 'object' && typeof (err as { message?: string }).message === 'string'
          ? (err as { message: string }).message
          : `שגיאה (${res.status})`;
    return { ok: false, error: message };
  }
  return data as unknown as SendTestReminderResult;
}
