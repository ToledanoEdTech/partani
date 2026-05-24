import type { MissingLesson } from '../../src/lib/lesson-stats';

export const EMAIL_SUBJECT = 'תזכורת: דיווח שיעורים פרטניים – ישיבת צביה אלישיב לוד';

interface RenderArgs {
  teacherName: string;
  /** Sorted ascending by date; the template will list up to 5 of these. */
  missingLessons: MissingLesson[];
  /** Total count of missing-and-past lessons in the current week. */
  totalMissing: number;
  /** Absolute URL to the app, used by the "לדיווח באתר" button. */
  appUrl: string;
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/** "2026-05-24" → "24/05/2026" (Hebrew/IL convention). */
function formatDateForDisplay(yyyymmdd: string): string {
  const [y, m, d] = yyyymmdd.split('-');
  return `${d}/${m}/${y}`;
}

export function renderReminderEmail({
  teacherName,
  missingLessons,
  totalMissing,
  appUrl,
}: RenderArgs): { html: string; text: string } {
  const top = missingLessons.slice(0, 5);

  const rowsHtml = top
    .map(
      (m) => `
            <tr>
              <td style="padding:10px 12px;border-bottom:1px solid #e5e7eb;text-align:right;font-weight:bold">${escapeHtml(m.studentName)}</td>
              <td style="padding:10px 12px;border-bottom:1px solid #e5e7eb;text-align:right;color:#4b5563">${escapeHtml(m.subject)}</td>
              <td style="padding:10px 12px;border-bottom:1px solid #e5e7eb;text-align:right;color:#4b5563">יום ${escapeHtml(m.day)}</td>
              <td style="padding:10px 12px;border-bottom:1px solid #e5e7eb;text-align:right;color:#4b5563;font-family:'Courier New',monospace;font-size:13px">${escapeHtml(formatDateForDisplay(m.date))}</td>
            </tr>`
    )
    .join('');

  const moreNote =
    totalMissing > top.length
      ? `<p style="margin:0 0 16px 0;font-size:13px;color:#6b7280">ועוד ${totalMissing - top.length} שיעורים נוספים מחכים לדיווח.</p>`
      : '';

  const html = `<!doctype html>
<html lang="he" dir="rtl">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>תזכורת דיווח שיעורים</title>
  </head>
  <body style="margin:0;padding:0;background:#f3f4f6;font-family:'Segoe UI',Arial,Helvetica,sans-serif;color:#111827;direction:rtl;text-align:right">
    <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="background:#f3f4f6;padding:24px 12px">
      <tr><td align="center">
        <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="600" style="max-width:600px;background:#ffffff;border-radius:12px;overflow:hidden;border:1px solid #e5e7eb;box-shadow:0 1px 3px rgba(0,0,0,0.04)">
          <tr>
            <td style="background:#1e293b;color:#ffffff;padding:20px 24px;text-align:right">
              <div style="font-size:11px;color:#fbbf24;font-weight:bold;letter-spacing:.5px;text-transform:uppercase">ישיבת צביה אלישיב לוד</div>
              <div style="font-size:18px;font-weight:bold;margin-top:6px">תזכורת דיווח שיעורים פרטניים</div>
            </td>
          </tr>
          <tr>
            <td style="padding:24px;text-align:right;line-height:1.65">
              <p style="margin:0 0 16px 0;font-size:16px">שלום ${escapeHtml(teacherName)},</p>

              <p style="margin:0 0 16px 0;font-size:15px;color:#374151">
                במסגרת המעקב השבועי אחר דיווחי השיעורים, איתרנו שטרם דיווחת על
                <strong style="color:#b91c1c">${totalMissing} שיעורים</strong>
                שהיו אמורים להתקיים השבוע ועברו את תאריכם.
                אנא היכנס למערכת ועדכן את הסטטוס שלהם.
              </p>

              <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="border-collapse:collapse;margin:8px 0 16px 0;font-size:14px;border:1px solid #e5e7eb;border-radius:8px;overflow:hidden">
                <thead>
                  <tr style="background:#f9fafb">
                    <th style="padding:10px 12px;border-bottom:1px solid #e5e7eb;text-align:right;color:#6b7280;font-size:11px;font-weight:bold;text-transform:uppercase">תלמיד</th>
                    <th style="padding:10px 12px;border-bottom:1px solid #e5e7eb;text-align:right;color:#6b7280;font-size:11px;font-weight:bold;text-transform:uppercase">מקצוע</th>
                    <th style="padding:10px 12px;border-bottom:1px solid #e5e7eb;text-align:right;color:#6b7280;font-size:11px;font-weight:bold;text-transform:uppercase">יום</th>
                    <th style="padding:10px 12px;border-bottom:1px solid #e5e7eb;text-align:right;color:#6b7280;font-size:11px;font-weight:bold;text-transform:uppercase">תאריך</th>
                  </tr>
                </thead>
                <tbody>${rowsHtml}
                </tbody>
              </table>
              ${moreNote}

              <div style="text-align:center;margin:24px 0 8px 0">
                <a href="${escapeHtml(appUrl)}" style="display:inline-block;background:#2563eb;color:#ffffff;text-decoration:none;font-weight:bold;padding:12px 28px;border-radius:8px;font-size:15px">
                  לדיווח באתר ←
                </a>
              </div>

              <p style="margin:24px 0 0 0;font-size:12px;color:#9ca3af;border-top:1px solid #e5e7eb;padding-top:12px">
                הודעה אוטומטית ממערכת הדיווחים של ישיבת צביה אלישיב לוד.<br>
                אם דיווחת בינתיים — אין צורך בפעולה נוספת.
              </p>
            </td>
          </tr>
        </table>
      </td></tr>
    </table>
  </body>
</html>`;

  const textLines = [
    `שלום ${teacherName},`,
    '',
    `במסגרת המעקב השבועי אחר דיווחי השיעורים, איתרנו שטרם דיווחת על ${totalMissing} שיעורים שהתקיימו השבוע.`,
    '',
    'שיעורים שמחכים לדיווח:',
    ...top.map(
      (m) => `• ${m.studentName} (${m.subject}) — יום ${m.day}, ${formatDateForDisplay(m.date)}`
    ),
    ...(totalMissing > top.length ? [`...ועוד ${totalMissing - top.length} שיעורים נוספים.`] : []),
    '',
    `לדיווח באתר: ${appUrl}`,
    '',
    'הודעה אוטומטית ממערכת הדיווחים – ישיבת צביה אלישיב לוד.',
  ];
  const text = textLines.join('\n');

  return { html, text };
}
