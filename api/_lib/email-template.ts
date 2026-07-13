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

/**
 * Stacked lesson cards (not a wide multi-column table) so the email stays
 * readable on narrow phone screens without horizontal clipping.
 */
function renderLessonCard(m: MissingLesson): string {
  return `
              <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="width:100%;max-width:100%;border-collapse:collapse;margin:0 0 10px 0">
                <tr>
                  <td style="padding:12px 14px;background:#f9fafb;border:1px solid #e5e7eb;border-radius:8px;text-align:right;word-break:break-word;overflow-wrap:anywhere">
                    <div style="font-size:15px;font-weight:bold;color:#111827;margin:0 0 6px 0;line-height:1.4">${escapeHtml(m.studentName)}</div>
                    <div style="font-size:13px;color:#4b5563;line-height:1.55">
                      <span style="color:#6b7280">מקצוע:</span> ${escapeHtml(m.subject)}
                    </div>
                    <div style="font-size:13px;color:#4b5563;line-height:1.55">
                      <span style="color:#6b7280">יום:</span> ${escapeHtml(m.day)}
                      &nbsp;·&nbsp;
                      <span style="color:#6b7280">תאריך:</span> ${escapeHtml(formatDateForDisplay(m.date))}
                    </div>
                  </td>
                </tr>
              </table>`;
}

export function renderReminderEmail({
  teacherName,
  missingLessons,
  totalMissing,
  appUrl,
}: RenderArgs): { html: string; text: string } {
  const top = missingLessons.slice(0, 5);

  const lessonsHtml = top.map(renderLessonCard).join('');

  const moreNote =
    totalMissing > top.length
      ? `<p style="margin:0 0 16px 0;font-size:13px;color:#6b7280">ועוד ${totalMissing - top.length} שיעורים נוספים מחכים לדיווח.</p>`
      : '';

  const html = `<!doctype html>
<html lang="he" dir="rtl">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <meta name="x-apple-disable-message-reformatting">
    <title>תזכורת דיווח שיעורים</title>
  </head>
  <body style="margin:0;padding:0;background:#f3f4f6;font-family:'Segoe UI',Arial,Helvetica,sans-serif;color:#111827;direction:rtl;text-align:right;-webkit-text-size-adjust:100%;-ms-text-size-adjust:100%">
    <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="width:100%;background:#f3f4f6;padding:16px 8px">
      <tr><td align="center" style="padding:0">
        <!--[if mso]>
        <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="600"><tr><td>
        <![endif]-->
        <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="width:100%;max-width:600px;background:#ffffff;border-radius:12px;border:1px solid #e5e7eb">
          <tr>
            <td style="background:#1e293b;color:#ffffff;padding:16px 18px;text-align:right">
              <div style="font-size:11px;color:#fbbf24;font-weight:bold;letter-spacing:.5px">ישיבת צביה אלישיב לוד</div>
              <div style="font-size:17px;font-weight:bold;margin-top:6px;line-height:1.35">תזכורת דיווח שיעורים פרטניים</div>
            </td>
          </tr>
          <tr>
            <td style="padding:18px 16px;text-align:right;line-height:1.65">
              <p style="margin:0 0 14px 0;font-size:16px">שלום ${escapeHtml(teacherName)},</p>

              <p style="margin:0 0 16px 0;font-size:15px;color:#374151">
                במסגרת המעקב השבועי אחר דיווחי השיעורים, איתרנו שטרם דיווחת על
                <strong style="color:#b91c1c">${totalMissing} שיעורים</strong>
                שהיו אמורים להתקיים השבוע ועברו את תאריכם.
                אנא היכנס למערכת ועדכן את הסטטוס שלהם.
              </p>

              ${lessonsHtml}
              ${moreNote}

              <div style="text-align:center;margin:22px 0 8px 0">
                <a href="${escapeHtml(appUrl)}" style="display:inline-block;background:#2563eb;color:#ffffff;text-decoration:none;font-weight:bold;padding:12px 24px;border-radius:8px;font-size:15px;max-width:100%;box-sizing:border-box">
                  לדיווח באתר ←
                </a>
              </div>

              <p style="margin:22px 0 0 0;font-size:12px;color:#9ca3af;border-top:1px solid #e5e7eb;padding-top:12px">
                הודעה אוטומטית ממערכת הדיווחים של ישיבת צביה אלישיב לוד.<br>
                אם דיווחת בינתיים — אין צורך בפעולה נוספת.
              </p>
            </td>
          </tr>
        </table>
        <!--[if mso]>
        </td></tr></table>
        <![endif]-->
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
