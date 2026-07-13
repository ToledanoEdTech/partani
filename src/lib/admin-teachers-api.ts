/**
 * Authenticated client for admin teacher CRUD (Admin SDK via /api/admin/teachers).
 */
import { auth } from '../firebase';
import type { Teacher } from '../types';

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

function errorFromResponse(res: Response, data: Record<string, unknown>, fallback: string): Error {
  const err = data.error;
  const message =
    typeof err === 'string'
      ? err
      : `שגיאה (${res.status}): ${fallback}`;
  return new Error(message);
}

export async function adminAddTeacher(
  teacher: Omit<Teacher, 'id'>
): Promise<string> {
  const headers = await getAdminAuthHeader();
  const res = await fetch('/api/admin/teachers', {
    method: 'POST',
    headers,
    body: JSON.stringify(teacher),
  });
  const data = await parseJson(res);
  if (!res.ok) throw errorFromResponse(res, data, 'הוספת מורה נכשלה');
  const id = data.id;
  if (typeof id !== 'string' || !id) throw new Error('תשובת שרת לא תקינה');
  return id;
}

export async function adminUpdateTeacher(
  id: string,
  updates: Partial<Omit<Teacher, 'id'>>
): Promise<void> {
  const headers = await getAdminAuthHeader();
  const res = await fetch('/api/admin/teachers', {
    method: 'PATCH',
    headers,
    body: JSON.stringify({ id, ...updates }),
  });
  const data = await parseJson(res);
  if (!res.ok) throw errorFromResponse(res, data, 'עדכון מורה נכשל');
}

export async function adminDeleteTeacher(id: string): Promise<void> {
  const headers = await getAdminAuthHeader();
  const res = await fetch(`/api/admin/teachers?id=${encodeURIComponent(id)}`, {
    method: 'DELETE',
    headers,
  });
  const data = await parseJson(res);
  if (!res.ok) throw errorFromResponse(res, data, 'מחיקת מורה נכשלה');
}
