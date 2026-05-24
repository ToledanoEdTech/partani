export interface Teacher {
  id: string;
  name: string;
  email: string;
  subject: string;
  active: boolean;
  /**
   * Per-teacher opt-out for automated weekly reminder emails.
   * Missing/undefined is treated as `true` (reminders enabled) so existing
   * documents in the DB don't need to be backfilled.
   */
  emailRemindersEnabled?: boolean;
}

/** Shape of the `settings/general.emailReminders` map. */
export interface EmailReminderSettings {
  /** Master kill-switch for the cron. Defaults to `true` when missing. */
  enabled?: boolean;
  /** Minimum number of unreported past lessons in the current week to trigger an email. Minimum 2. */
  minMissingLessons?: number;
  /** ISO timestamp of the most recent cron run. */
  lastRunAt?: string;
  /** Aggregate counters of the most recent cron run. */
  lastRunSummary?: {
    sent: number;
    skipped: number;
    errors: number;
  };
  /**
   * Per-teacher dedup map: `{ [teacherId]: weekKey }` where `weekKey` is the
   * IL-week Sunday-start YYYY-MM-DD. Used to ensure at most one reminder
   * per teacher per calendar week.
   */
  lastSentByTeacher?: Record<string, string>;
}

export interface Schedule {
  id: string;
  teacherId: string;
  teacherEmail: string;
  day: string;
  hour: string;
  studentName: string;
  subject: string;
}

export interface Report {
  id: string;
  scheduleId: string;
  teacherId: string;
  teacherEmail: string;
  date: string;
  status: 'completed' | 'missed';
  text: string;
  timestamp: string;
}
