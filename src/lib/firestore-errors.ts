import { auth } from '../firebase';

export enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId?: string | null;
    email?: string | null;
    emailVerified?: boolean | null;
    isAnonymous?: boolean | null;
    tenantId?: string | null;
    providerInfo?: {
      providerId?: string | null;
      email?: string | null;
    }[];
  }
}

/**
 * Build a structured Firestore-error log payload. Pure — does not throw,
 * does not log. Use it from both write paths (where you want to surface
 * the error to the caller via re-throw) and read/snapshot paths (where
 * throwing inside the listener callback can break the listener and bubble
 * up as an unhandled rejection that may even trigger a dev-mode reload).
 */
function buildErrorInfo(error: unknown, operationType: OperationType, path: string | null): FirestoreErrorInfo {
  return {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email,
      emailVerified: auth.currentUser?.emailVerified,
      isAnonymous: auth.currentUser?.isAnonymous,
      tenantId: auth.currentUser?.tenantId,
      providerInfo: auth.currentUser?.providerData?.map(provider => ({
        providerId: provider.providerId,
        email: provider.email,
      })) || []
    },
    operationType,
    path
  };
}

/**
 * Original entry point for write/get operations: log + throw so the caller
 * sees the failure. Snapshot listeners must NOT use this — see
 * `reportFirestoreSnapshotError` below.
 */
export function handleFirestoreError(error: unknown, operationType: OperationType, path: string | null) {
  const errInfo = buildErrorInfo(error, operationType, path);
  console.error('Firestore Error: ', JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}

/**
 * Variant for `onSnapshot` error callbacks — logs but does NOT throw.
 * Throwing inside an `onSnapshot` error callback yields an unhandled
 * promise rejection inside Firebase's stream handling, which in some
 * setups (e.g. Vite dev server) can manifest as the page seemingly
 * "refreshing every few seconds" while the listener silently dies.
 */
/** Map a thrown Firestore error to a short Hebrew message for toasts. */
export function getFirestoreUserMessage(error: unknown, fallback = 'שגיאה בפעולה'): string {
  const raw = error instanceof Error ? error.message : String(error);
  if (raw.includes('permission') || raw.includes('PERMISSION_DENIED') || raw.includes('insufficient permissions')) {
    return 'אין הרשאה לשמור ב-Firestore. יש לפרוס את חוקי האבטחה: הרץ deploy-firestore-rules.bat (או firebase deploy --only firestore:rules).';
  }
  if (raw.includes('יש להתחבר מחדש')) {
    return raw;
  }
  try {
    const parsed = JSON.parse(raw) as { error?: string };
    if (parsed.error?.includes('permission') || parsed.error?.includes('PERMISSION_DENIED') || parsed.error?.includes('insufficient permissions')) {
      return 'אין הרשאה לשמור ב-Firestore. יש לפרוס את חוקי האבטחה: הרץ deploy-firestore-rules.bat (או firebase deploy --only firestore:rules).';
    }
    if (parsed.error === 'forbidden' || parsed.error === 'unauthorized') {
      return 'אין הרשאת מנהל לפעולה זו. יש להתחבר עם חשבון המנהל.';
    }
    if (typeof parsed.error === 'string' && parsed.error.trim()) {
      return parsed.error;
    }
  } catch {
    // not JSON — use fallback / raw heuristics below
  }
  if (raw === 'forbidden' || raw === 'unauthorized') {
    return 'אין הרשאת מנהל לפעולה זו. יש להתחבר עם חשבון המנהל.';
  }
  return fallback;
}

export function reportFirestoreSnapshotError(
  error: unknown,
  operationType: OperationType,
  path: string | null,
) {
  const errInfo = buildErrorInfo(error, operationType, path);
  console.error('Firestore Snapshot Error: ', JSON.stringify(errInfo));
}
