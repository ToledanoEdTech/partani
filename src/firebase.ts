import { initializeApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import { initializeFirestore } from 'firebase/firestore';

import localConfig from '../firebase-applet-config.json';

const env = import.meta.env;

const firebaseConfig = {
  apiKey: env.VITE_FIREBASE_API_KEY || localConfig.apiKey,
  authDomain: env.VITE_FIREBASE_AUTH_DOMAIN || localConfig.authDomain,
  projectId: env.VITE_FIREBASE_PROJECT_ID || localConfig.projectId,
  storageBucket: env.VITE_FIREBASE_STORAGE_BUCKET || localConfig.storageBucket,
  messagingSenderId: env.VITE_FIREBASE_MESSAGING_SENDER_ID || localConfig.messagingSenderId,
  appId: env.VITE_FIREBASE_APP_ID || localConfig.appId,
  measurementId: env.VITE_FIREBASE_MEASUREMENT_ID || (localConfig as any).measurementId || '',
  firestoreDatabaseId:
    env.VITE_FIREBASE_DATABASE_ID || localConfig.firestoreDatabaseId || '(default)'
};

const missing = ['apiKey', 'authDomain', 'projectId', 'appId'].filter(
  (k) => !firebaseConfig[k as keyof typeof firebaseConfig]
);

if (missing.length > 0) {
  const message =
    `[Firebase] Missing required config keys: ${missing.join(', ')}. ` +
    `Create a .env.local file (see .env.example) or set these as Vercel environment variables.`;
  console.error(message);
  if (typeof document !== 'undefined') {
    const host = window.location.hostname;
    const onVercel = host.endsWith('.vercel.app');
    const onLocal = host === 'localhost' || host === '127.0.0.1';

    const instructionsHtml = onVercel
      ? `
        <h3 style="margin-bottom:8px">איך לתקן (הגדרה ב-Vercel)</h3>
        <ol style="padding-right:20px;margin:0">
          <li>היכנס ל-<a href="https://vercel.com/dashboard" target="_blank" style="color:#1d4ed8;text-decoration:underline">Vercel Dashboard</a></li>
          <li>בחר את הפרויקט <b>partani-topaz</b></li>
          <li>לחץ על <b>Settings</b> ← <b>Environment Variables</b></li>
          <li>הוסף את כל המשתנים <code>VITE_FIREBASE_*</code> מהקובץ <code>.env.local</code> המקומי שלך (החל על Production, Preview ו-Development)</li>
          <li>לאחר השמירה - כנס ל-<b>Deployments</b>, לחץ <b>…</b> על הדפלוימנט האחרון ובחר <b>Redeploy</b></li>
        </ol>
        <p style="margin-top:14px;padding-top:12px;border-top:1px solid #fecaca">
          טיפ: יש סקריפט אוטומטי במאגר - <code>setup-vercel-env.bat</code> - שעושה את כל זה בלחיצה אחת.
        </p>`
      : onLocal
      ? `
        <h3 style="margin-bottom:8px">איך לתקן (הפעלה לוקאלית)</h3>
        <ol style="padding-right:20px;margin:0">
          <li>וודא שקיים קובץ <code>.env.local</code> בתיקיית הפרויקט (העתק מ-<code>.env.example</code> אם צריך)</li>
          <li>מלא את כל ערכי <code>VITE_FIREBASE_*</code> מ-Firebase Console ← Project Settings</li>
          <li>הפסק את השרת (Ctrl+C) והפעל שוב <code>npm run dev</code> או <code>start-local.bat</code></li>
        </ol>`
      : `
        <h3 style="margin-bottom:8px">איך לתקן</h3>
        <p>הגדר את משתני הסביבה <code>VITE_FIREBASE_*</code> בפלטפורמת האירוח שלך, או צור קובץ <code>.env.local</code> בפיתוח לוקאלי.</p>`;

    document.body.innerHTML = `
      <div style="font-family:system-ui,-apple-system,'Segoe UI',sans-serif;padding:40px;max-width:720px;margin:40px auto;
        border:1px solid #fca5a5;background:#fef2f2;border-radius:14px;color:#7f1d1d;
        direction:rtl;text-align:right;line-height:1.7;box-shadow:0 4px 14px rgba(0,0,0,0.06)">
        <h2 style="margin:0 0 10px 0;color:#991b1b">שגיאת תצורה - Firebase</h2>
        <p style="margin:0 0 8px 0">
          קונפיגורציית Firebase חסרה. שדות חסרים:
          <code style="background:#fee2e2;padding:2px 6px;border-radius:4px">${missing.join(', ')}</code>
        </p>
        <p style="margin:0 0 16px 0;font-size:14px;color:#9f1239">
          דומיין נוכחי: <code>${host}</code>
        </p>
        ${instructionsHtml}
      </div>`;
  }
  throw new Error(message);
}

if (env.DEV) {
  console.info(
    `[Firebase] Connected to project "${firebaseConfig.projectId}" ` +
    `(authDomain: ${firebaseConfig.authDomain}, db: ${firebaseConfig.firestoreDatabaseId})`
  );
}

const app = initializeApp(firebaseConfig);
export const db = initializeFirestore(app, {
  experimentalForceLongPolling: true
}, firebaseConfig.firestoreDatabaseId);
export const auth = getAuth(app);

