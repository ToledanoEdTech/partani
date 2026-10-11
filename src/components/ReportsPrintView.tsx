import { AppLogos } from './AppLogos';
import type { ReportExportModel, TeacherExportRow } from '../lib/report-export-model';
import { complianceTone } from '../lib/report-export-model';

function teacherName(row: TeacherExportRow): string {
  return row.active ? row.name : `${row.name} (לא פעיל)`;
}

function Kpi({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone?: 'good' | 'ok' | 'bad' | 'indigo' | 'ink';
}) {
  return (
    <article className={`rpt-card rpt-card-${tone ?? 'ink'}`}>
      <span>{label}</span>
      <strong>{value}</strong>
    </article>
  );
}

export function ReportsPrintView({ model }: { model: ReportExportModel }) {
  const compliance = model.teacherTableMode === 'compliance';
  const analyticsTone = model.analytics ? complianceTone(model.analytics.compliancePct) : 'ink';

  return (
    <div className="reports-print-doc" dir="rtl">
      <section className="rpt-dash">
        <header className="rpt-head">
          <AppLogos className="rpt-logos" logoClassName="rpt-logo" />
          <div className="rpt-head-text">
            <p className="rpt-kicker">{model.organization}</p>
            <h1>{model.title}</h1>
            <p className="rpt-meta">הופק {model.generatedOnLabel}</p>
          </div>
        </header>

        <h2>סינון פעיל</h2>
        <div className="rpt-filters">
          {model.filters.map((filter) => (
            <span key={filter.label}>
              <b>{filter.label}:</b> {filter.value}
            </span>
          ))}
        </div>

        <h2>דיווחים בסינון</h2>
        <div className="rpt-cards">
          <Kpi label="דיווחים" value={model.filteredCount.toLocaleString('he-IL')} />
          <Kpi label="התקיימו" value={model.completedCount.toLocaleString('he-IL')} tone="good" />
          <Kpi label="בוטלו" value={model.missedCount.toLocaleString('he-IL')} tone="bad" />
        </div>

        {model.analytics && (
          <>
            <h2>היענות לפי מערכת השעות · {model.analytics.rangeLabel}</h2>
            <p className="rpt-note">{model.analytics.note}</p>
            <div className="rpt-cards rpt-cards-4">
              <Kpi label="היו אמורים להתקיים" value={model.analytics.expected.toLocaleString('he-IL')} />
              <Kpi label="דווחו" value={model.analytics.reported.toLocaleString('he-IL')} tone="indigo" />
              <Kpi label="חסר דיווח" value={model.analytics.unreported.toLocaleString('he-IL')} tone="bad" />
              <Kpi
                label="אחוז היענות"
                value={`${model.analytics.compliancePct}%`}
                tone={analyticsTone}
              />
            </div>
          </>
        )}

        <h2 className={model.missingTeachers.length === 0 ? 'rpt-clear' : 'rpt-alert'}>
          {model.missingTeachers.length === 0
            ? 'מורים שלא הזינו · אין חוסר דיווח בטווח'
            : `מורים שלא הזינו · ${model.missingTeachers.length.toLocaleString('he-IL')} מורים · ${model.analytics.unreported.toLocaleString('he-IL')} שיעורים`}
        </h2>
        {model.missingTeachers.length === 0 ? (
          <p className="rpt-clear">כל השיעורים שהיו אמורים להתקיים דווחו.</p>
        ) : (
          <table className="rpt-table">
            <thead>
              <tr>
                <th>מורה</th>
                <th>שיעורים שלא הוזנו</th>
                <th>צפויים</th>
                <th>דווחו</th>
                <th>התקיימו</th>
                <th>בוטלו</th>
                <th>היענות</th>
              </tr>
            </thead>
            <tbody>
              {model.missingTeachers.map((teacher) => {
                const tone = teacher.compliancePct == null ? null : complianceTone(teacher.compliancePct);
                return (
                  <tr key={teacher.id}>
                    <td className="rpt-name">{teacherName(teacher)}</td>
                    <td className="rpt-gap">{teacher.unreported ?? 0}</td>
                    <td>{teacher.expected ?? 0}</td>
                    <td>{teacher.reported ?? 0}</td>
                    <td>{teacher.completed}</td>
                    <td>{teacher.missed}</td>
                    <td>
                      {tone == null || teacher.compliancePct == null ? '—' : (
                        <span className={`rpt-pct rpt-pct-${tone}`}>
                          <span>{teacher.compliancePct}%</span>
                          <span className="rpt-bar" aria-hidden="true">
                            <span style={{ width: `${teacher.compliancePct}%` }} />
                          </span>
                        </span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}

        <h2>לפי מורה</h2>
        {model.teachers.length === 0 ? (
          <p className="rpt-empty">אין מורים להצגה בסינון הזה.</p>
        ) : (
          <table className="rpt-table">
            <thead>
              <tr>
                <th>מורה</th>
                {compliance ? (
                  <>
                    <th>צפויים</th>
                    <th>דווחו</th>
                    <th>התקיימו</th>
                    <th>בוטלו</th>
                    <th>חסר דיווח</th>
                    <th>היענות</th>
                  </>
                ) : (
                  <>
                    <th>דיווחים</th>
                    <th>התקיימו</th>
                    <th>בוטלו</th>
                  </>
                )}
              </tr>
            </thead>
            <tbody>
              {model.teachers.map((teacher) => {
                const tone = teacher.compliancePct == null ? null : complianceTone(teacher.compliancePct);
                return (
                  <tr key={teacher.id}>
                    <td className="rpt-name">{teacherName(teacher)}</td>
                    {compliance ? (
                      <>
                        <td>{teacher.expected ?? 0}</td>
                        <td>{teacher.reported ?? 0}</td>
                        <td>{teacher.completed}</td>
                        <td>{teacher.missed}</td>
                        <td className={(teacher.unreported ?? 0) > 0 ? 'rpt-gap' : undefined}>{teacher.unreported ?? 0}</td>
                        <td>
                          {tone == null || teacher.compliancePct == null ? (
                            '—'
                          ) : (
                            <span className={`rpt-pct rpt-pct-${tone}`}>
                              <span>{teacher.compliancePct}%</span>
                              <span className="rpt-bar" aria-hidden="true">
                                <span style={{ width: `${teacher.compliancePct}%` }} />
                              </span>
                            </span>
                          )}
                        </td>
                      </>
                    ) : (
                      <>
                        <td>{teacher.filteredCount}</td>
                        <td>{teacher.completed}</td>
                        <td>{teacher.missed}</td>
                      </>
                    )}
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </section>

      {model.missingLessons.length > 0 && (
        <section className="rpt-missing-lessons">
          <h2>שיעורים שלא הוזנו ({model.missingLessons.length.toLocaleString('he-IL')})</h2>
          <p className="rpt-note">{model.analytics.rangeLabel}</p>
          <table className="rpt-table">
            <thead>
              <tr>
                <th>תאריך</th>
                <th>מורה</th>
                <th>יום</th>
                <th>שעה</th>
                <th>מקצוע</th>
                <th>תלמידים</th>
              </tr>
            </thead>
            <tbody>
              {model.missingLessons.map((lesson, index) => (
                <tr key={`${lesson.teacherId}-${lesson.date}-${lesson.hour}-${index}`}>
                  <td>{lesson.dateLabel}</td>
                  <td className="rpt-name">{lesson.teacherName}</td>
                  <td>{lesson.day}</td>
                  <td>{lesson.hour}</td>
                  <td>{lesson.subject}</td>
                  <td>{lesson.studentsLabel}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}

      {model.reports.length === 0 ? (
        <p className="rpt-empty">אין דיווחים בסינון הזה.</p>
      ) : (
        <section className="rpt-reports">
          <h2>דיווחים ({model.filteredCount.toLocaleString('he-IL')})</h2>
          <table className="rpt-table rpt-reports-table">
            <thead>
              <tr>
                <th>תאריך</th>
                <th>מורה</th>
                <th>תלמידים</th>
                <th>מקצוע</th>
                <th>סטטוס</th>
                <th>פירוט</th>
              </tr>
            </thead>
            <tbody>
              {model.reports.map((report, index) => (
                <tr key={`${report.dateLabel}-${report.teacherName}-${index}`}>
                  <td>{report.dateLabel}</td>
                  <td className="rpt-name">{report.teacherName}</td>
                  <td>{report.studentsLabel}</td>
                  <td>{report.subject}</td>
                  <td>
                    <span className={`rpt-status rpt-status-${report.status === 'completed' ? 'good' : 'bad'}`}>
                      {report.statusLabel}
                    </span>
                  </td>
                  <td className="rpt-text">{report.text}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}
    </div>
  );
}
