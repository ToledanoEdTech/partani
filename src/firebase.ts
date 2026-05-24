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
    document.body.innerHTML =
      `<div style="font-family:system-ui;padding:40px;max-width:680px;margin:40px auto;` +
      `border:1px solid #fca5a5;background:#fef2f2;border-radius:12px;color:#7f1d1d;` +
      `direction:rtl;text-align:right;line-height:1.7">` +
      `<h2 style="margin-top:0">שגיאת תצורה - Firebase</h2>` +
      `<p>קונפיגורציית Firebase חסרה. שדות חסרים: <code>${missing.join(', ')}</code></p>` +
      `<p>צור קובץ <code>.env.local</code> לפי הדוגמה ב-<code>.env.example</code>, ` +
      `או הגדר את משתני הסביבה ב-Vercel.</p>` +
      `</div>`;
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

