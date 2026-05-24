# מערכת דיווח ומעקב - שיעורים פרטניים

ישיבת צביה אלישיב לוד

## הפעלה לוקאלית מהירה (Windows)

לחיצה כפולה על אחד מהקבצים:

- `start-local.bat` - לפתיחה רגילה ב-CMD
- `start-local.ps1` - לפתיחה ב-PowerShell

הסקריפט יתקין באופן אוטומטי את כל החבילות (אם צריך) ויפתח את האתר בדפדפן בכתובת [http://localhost:3000](http://localhost:3000).

## הפעלה ידנית

דרישות: [Node.js](https://nodejs.org/) (מומלץ גרסה 20 ומעלה).

```bash
npm install
npm run dev
```

האתר יפתח בכתובת `http://localhost:3000`.

## הגדרת Firebase (חיוני להתחברות)

האתר משתמש ב-Firebase Authentication עבור התחברות עם חשבון Google. צריך לוודא:

1. **קונפיגורציה תקינה** - בקובץ `firebase-applet-config.json` או דרך משתני סביבה (`VITE_FIREBASE_*` בקובץ `.env.local` או ב-Vercel).
2. **דומיינים מורשים** ב-Firebase Console: `Authentication > Settings > Authorized domains`. יש להוסיף:
   - `localhost`
   - `partani-topaz.vercel.app`
   - כל דומיין מותאם אישית אם יש.
3. **Google Sign-in מופעל** ב-`Authentication > Sign-in method`.
4. **חוקי Firestore** מהקובץ `firestore.rules` הועלו ל-Firebase Console.

## משתני סביבה

ראה דוגמה ב-[.env.example](.env.example). העתק לקובץ `.env.local` ומלא ערכים אם רוצים להחליף את הקונפיגורציה הקבועה ב-`firebase-applet-config.json`.
