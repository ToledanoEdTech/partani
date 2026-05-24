import { cert, getApps, initializeApp, type App } from 'firebase-admin/app';
import { getFirestore, type Firestore } from 'firebase-admin/firestore';

/**
 * Lazily initialise the Firebase Admin SDK for use inside Vercel
 * serverless functions. Credentials come from environment variables
 * provisioned in the Vercel dashboard (see README).
 *
 * Required env vars:
 *   - FIREBASE_ADMIN_PROJECT_ID
 *   - FIREBASE_ADMIN_CLIENT_EMAIL
 *   - FIREBASE_ADMIN_PRIVATE_KEY  (may contain literal "\n" sequences)
 *
 * Optional:
 *   - FIREBASE_ADMIN_DATABASE_ID  (defaults to "(default)")
 */
function getAdminApp(): App {
  const apps = getApps();
  if (apps.length > 0) return apps[0]!;

  const projectId = process.env.FIREBASE_ADMIN_PROJECT_ID;
  const clientEmail = process.env.FIREBASE_ADMIN_CLIENT_EMAIL;
  let privateKey = process.env.FIREBASE_ADMIN_PRIVATE_KEY;

  if (!projectId || !clientEmail || !privateKey) {
    throw new Error(
      '[firebase-admin] Missing required env vars. Need ' +
        'FIREBASE_ADMIN_PROJECT_ID, FIREBASE_ADMIN_CLIENT_EMAIL, and FIREBASE_ADMIN_PRIVATE_KEY.'
    );
  }

  // Vercel stores newlines as literal "\n" in env values; convert back.
  if (privateKey.includes('\\n')) {
    privateKey = privateKey.replace(/\\n/g, '\n');
  }

  return initializeApp({
    credential: cert({ projectId, clientEmail, privateKey }),
    projectId,
  });
}

export function getAdminDb(): Firestore {
  const app = getAdminApp();
  const dbId = process.env.FIREBASE_ADMIN_DATABASE_ID || '(default)';
  // The two-arg form exists since firebase-admin v12 for named databases.
  // For "(default)" the single-arg form is equivalent.
  return dbId && dbId !== '(default)' ? getFirestore(app, dbId) : getFirestore(app);
}
