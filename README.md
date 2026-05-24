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

ראה דוגמה ב-[.env.example](.env.example). העתק לקובץ `.env.local` ומלא ערכים. הקובץ הזה חסום מגיט ולא יעלה למאגר.

## פריסה ל-Vercel

`.env.local` הוא רק ללוקאלית - הוא **לא** מסונכרן אוטומטית ל-Vercel.

הוספת משתנים ידנית (חד-פעמית):

1. [Vercel Dashboard](https://vercel.com/dashboard) ← הפרויקט ← `Settings` ← `Environment Variables`
2. הוסף את כל המשתנים מ-`.env.local` (אותם שמות בדיוק) - החל על Production, Preview ו-Development
3. `Deployments` ← `...` על הדפלוימנט האחרון ← `Redeploy` (בטל את `Use existing Build Cache`)

> **אזהרה:** אל תריץ `vercel link`, `vercel env pull` או פקודות דומות בתיקייה - הן ידרסו את `.env.local` שלך!

## תזכורות מייל אוטומטיות

המערכת שולחת מייל בעברית למורים פעילים שלא דיווחו על **לפחות 2 שיעורים** שכבר התקיימו בשבוע הנוכחי. הקוד מורכב מ-3 שכבות:

- **לוגיקה משותפת** — `src/lib/lesson-stats.ts` (חישוב חוסרי דיווח, גבולות שבוע ב-`Asia/Jerusalem`). מיובא הן ב-`App.tsx` והן ב-cron.
- **Cron handler** — `api/cron/email-reminders.ts` (Vercel Serverless + Firebase Admin SDK + Gmail SMTP via `nodemailer`).
- **ממשק ניהול** — שני אזורים ב-`App.tsx`: סקשן "תזכורות מייל" בטאב **הגדרות** (toggle גלובלי, מינימום שיעורים, סטטוס ריצה אחרונה), ועמודת מתג לכל מורה בטאב **ניהול מורים**.

### לוח זמנים

ה-cron מתוזמן ב-`vercel.json` ל-**יום חמישי 17:00 UTC** (= **20:00 שעון ישראל בקיץ / 19:00 בחורף**, בשל מעבר שעון). ה-handler עצמו לא מבצע בדיקה תלוית-שעה — הוא תמיד מעבד את "השבוע הנוכחי", כך שההסחה של שעה אחת בחורף לא משפיעה על ההתנהגות. אם תרצה גישה אחרת (למשל "יום ראשון בערב") — שנה את הביטוי ב-`vercel.json` בלבד.

### מדיניות שליחה

- מורה לא יקבל יותר ממייל אחד לשבוע — מתועד ב-Firestore: `settings/general.emailReminders.lastSentByTeacher[teacherId] = weekKey`.
- ניתן לבטל גלובלית בטאב הגדרות (`emailReminders.enabled = false`).
- ניתן לבטל לכל מורה בנפרד בטבלת ניהול מורים (`teachers/{id}.emailRemindersEnabled = false`).
- שדה `emailRemindersEnabled` שחסר על מסמך מורה נחשב כ-`true` (ברירת מחדל מופעל).

### הגדרה ראשונית

1. **חשבון Gmail / Workspace ייעודי** — הכי נקי לפתוח חשבון נפרד לשליחת תזכורות (למשל `partani@zvialod.com`). אין צורך לאמת DNS — Google חתום על הדומיין מבפנים.
2. **App Password** — בחשבון השליחה: ודא ש-[2-Step Verification](https://myaccount.google.com/signinoptions/two-step-verification) דלוק, ואז צור App Password ב-[myaccount.google.com/apppasswords](https://myaccount.google.com/apppasswords) (שם רלוונטי, למשל "Partani"). תקבל מחרוזת בת 16 תווים.
3. **Service Account של Firebase** — Firebase Console ← Project Settings ← Service accounts ← `Generate new private key`. שמור את ה-JSON.
4. **הוספת משתני סביבה ב-Vercel** (Project ← Settings ← Environment Variables):
   - `SMTP_USER` — כתובת השליחה המלאה (לדוגמה `partani@zvialod.com`)
   - `SMTP_APP_PASSWORD` — ה-16 תווים מ-Google (רווחים מותרים — נחתכים אוטומטית)
   - `MAIL_FROM` — אופציונלי; ברירת מחדל ל-`SMTP_USER`. לדוגמה `"מערכת דיווחים <partani@zvialod.com>"`
   - `APP_URL` — `https://partani-topaz.vercel.app` או הדומיין המותאם
   - `FIREBASE_ADMIN_PROJECT_ID`, `FIREBASE_ADMIN_CLIENT_EMAIL`, `FIREBASE_ADMIN_PRIVATE_KEY` — מה-JSON של ה-service account. את ה-`private_key` הדבק במלואו; שורות חדשות (`\n`) מומרות אוטומטית ע"י ה-handler.
   - `FIREBASE_ADMIN_DATABASE_ID` — רק אם השתמשת ב-Named DB (אחרת השאר ריק או `(default)`).
   - `CRON_SECRET` — מחרוזת אקראית ארוכה (16+ תווים). Vercel ישלח אותה אוטומטית בהדר `Authorization: Bearer ...` כשה-cron מופעל.
5. **חוקי Firestore** — אחרי `git pull` של עדכון `firestore.rules` (הוספת `emailRemindersEnabled` כשדה אופציונלי), העלה אותם דרך Firebase Console או `firebase deploy --only firestore:rules`.
6. **Redeploy** — אחרי הוספת משתני הסביבה, בצע Redeploy ב-Vercel (בלי build cache בפעם הראשונה).

### בדיקות ידניות

הריץ דרך הדפדפן או curl:

```bash
# Dry-run (לא שולח מייל, רק מחשב מי היה מקבל):
curl -H "Authorization: Bearer $CRON_SECRET" \
  "https://your-domain/api/cron/email-reminders?dryRun=1"

# שליחה אמיתית עכשיו, מתעלם מ-dedup השבועי:
curl -H "Authorization: Bearer $CRON_SECRET" \
  "https://your-domain/api/cron/email-reminders?force=1"
```

התגובה מחזירה `summary` עם מספר שנשלחו/נדלגו/נכשלו וגם `results` עם פירוט פר מורה (סיבת דילוג, מספר שיעורים חסרים).

### לוקאלית

`vercel dev` יחקה את ה-cron אבל לא יפעיל אותו אוטומטית בזמן. ניתן להריץ ידנית את ה-endpoint לאחר טעינת `.env.local`:

```bash
npx vercel dev
# בחלון שני:
curl "http://localhost:3000/api/cron/email-reminders?dryRun=1"
```

(ב-development, אם `CRON_SECRET` לא מוגדר — ה-handler מקבל בקשות לא-מאומתות לנוחות הפיתוח. בייצור הוא דורש אותו.)
