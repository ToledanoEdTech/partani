import React, { useState, useEffect, useMemo } from 'react';
import {
  BookOpen, Users, Calendar, CheckCircle, XCircle, Plus, Trash2, Edit3,
  Clock, TrendingUp, TrendingDown, LogOut,
  FileText, AlertCircle, Menu, X, Lock, Download, Upload, Settings, ClipboardCheck, GraduationCap,
  ChevronUp, ChevronDown, Send, Mail, Loader2, Shield, ArrowUpCircle,
} from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  Cell,
} from 'recharts';
import { signInWithPopup, GoogleAuthProvider, signOut, onAuthStateChanged, User } from 'firebase/auth';
import { auth } from './firebase';
import {
  subscribeToTeachers, subscribeToSchedules, subscribeToReports, subscribeToSettings, subscribeToStudents, updateSettings,
  addTeacher, updateTeacher, deleteTeacher, addSchedule, deleteSchedule, updateSchedule, addReport, updateReport, deleteReport,
  addStudent, updateStudent, deleteStudent,
  subscribeToAdminMembership, subscribeToAdmins, addAdmin, deleteAdmin, batchUpdateStudents,
} from './lib/db';
import { Teacher, Schedule, Report, EmailReminderSettings, Student, LessonType, AppSettings, AdminUser, HolidayPeriod } from './types';
import StudentPicker from './components/StudentPicker';
import StudentCard from './components/StudentCard';
import {
  buildStudentNameField,
  countStudentCompletedLessons,
  getLastAttendedStudentIds,
  getReportAttendedLabel,
  getScheduleDisplayLabel,
  getStudentLessonDetails,
  getUniqueClassNames,
} from './lib/students';
import {
  DEFAULT_SCHEDULE_SUBJECTS,
  SCHEDULE_HOUR_OPTIONS,
  mergeScheduleSubjects,
} from './lib/schedule-options';
import { AppLogos } from './components/AppLogos';
import { SITE_TITLE, PRIMARY_ADMIN_EMAIL } from './lib/branding';
import {
  buildStudentPromotionPlan,
  summarizePromotionPlan,
  type StudentPromotionPlan,
} from './lib/grade-promotion';
import * as XLSX from 'xlsx';
import {
  ISRAEL_TIMEZONE,
  addDaysToDateStr,
  buildDashboardAnalytics,
  formatDateInTZ,
  getEmailReminderScheduleInfo,
  getMissingLessonsForTeacherThisWeek,
  getWeekStartDateStr,
} from './lib/lesson-stats';
import {
  buildHolidayDateSet,
  findHolidayForDate,
  formatHolidayRangeLabel,
  mergeHolidayPeriods,
  normalizeHolidayPeriod,
  normalizeHolidayPeriods,
} from './lib/holidays';
import {
  findReportForLessonDate,
  findReportForScheduleWeek,
  getLessonDateForScheduleInWeek,
  isLessonDateForSchedule,
  resolveLessonDateForSave,
} from './lib/report-matching';
import { usePersistedState } from './lib/usePersistedState';
import { getFirestoreUserMessage } from './lib/firestore-errors';
import { sendRemindersNow, sendTestReminderEmail } from './lib/admin-email-api';
import { ADMIN_NAV_ITEMS, getAdminTabLabel } from './lib/admin-nav';
import {
  formatHebrewDateShort,
  formatHourSlot,
  formatWeekRangeLabel,
} from './lib/date-format';
import Drawer from './components/Drawer';
import Modal from './components/Modal';
import TeacherDashboard from './components/TeacherDashboard';
import {
  MOTION,
  cardItemVariants,
  cardListVariants,
  drawerItemVariants,
  tabTransition,
  tabVariants,
  toastVariants,
} from './components/motion';

// Primary admin email (super-admin). Additional admins live in Firestore `admins/{email}`.
const ADMIN_EMAIL = PRIMARY_ADMIN_EMAIL;

const weekAnchorDate = (dateStr: string) => new Date(`${dateStr}T12:00:00`);

const App = () => {
  // Global State
  const [user, setUser] = useState<User | null>(null);
  const [authLoading, setAuthLoading] = useState(true);
  
  const [teachers, setTeachers] = useState<Teacher[]>([]);
  const [students, setStudents] = useState<Student[]>([]);
  const [schedule, setSchedule] = useState<Schedule[]>([]);
  const [reports, setReports] = useState<Report[]>([]);
  const [settings, setSettings] = useState<AppSettings>({});
  const [newCustomSubject, setNewCustomSubject] = useState('');
  const [newHolidayStart, setNewHolidayStart] = useState('');
  const [newHolidayEnd, setNewHolidayEnd] = useState('');
  const [newHolidayName, setNewHolidayName] = useState('');
  const [importingHolidays, setImportingHolidays] = useState(false);
  const [showAddSubjectInput, setShowAddSubjectInput] = useState(false);
  const [isListedAdmin, setIsListedAdmin] = useState(false);
  const [adminCheckDone, setAdminCheckDone] = useState(false);
  const [adminsList, setAdminsList] = useState<AdminUser[]>([]);
  const [newAdminEmail, setNewAdminEmail] = useState('');
  const [newAdminName, setNewAdminName] = useState('');
  const [adminFormBusy, setAdminFormBusy] = useState(false);
  const [promotionPlan, setPromotionPlan] = useState<StudentPromotionPlan[] | null>(null);
  const [promotionBusy, setPromotionBusy] = useState(false);
  const [promotionConfirmText, setPromotionConfirmText] = useState('');
  
  // UI State — מצב ניווט נשמר ב-sessionStorage כדי לשרוד רענון דף
  // (Vite HMR / רענון ידני / שגיאת רשת) במקום לאפס את המשתמש לעמוד הראשי.
  const [role, setRole] = useState<'landing' | 'teacher' | 'admin'>('landing');
  const [adminTab, setAdminTab] = usePersistedState<string>('partani:adminTab', 'overview');
  const [teacherTab, setTeacherTab] = usePersistedState<'overview' | 'history'>('partani:teacherTab', 'overview');
  const [timetableWeekStart, setTimetableWeekStart] = useState<Date>(() =>
    weekAnchorDate(getWeekStartDateStr(new Date())),
  );
  const [timetableMobileDay, setTimetableMobileDay] = useState('ראשון');
  const [notification, setNotification] = useState({ show: false, message: '', type: 'success' });
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  
  // Admin Filters
  const [filterTeacher, setFilterTeacher] = useState('all');
  const [filterStatus, setFilterStatus] = useState('all');
  const [searchStudent, setSearchStudent] = useState('');
  const [filterReportDateFrom, setFilterReportDateFrom] = useState('');
  const [filterReportDateTo, setFilterReportDateTo] = useState('');
  const [searchTeacher, setSearchTeacher] = useState('');
  const [filterTeacherActive, setFilterTeacherActive] = useState<'all' | 'active' | 'inactive'>('all');
  const [filterScheduleTeacher, setFilterScheduleTeacher] = useState('all');
  const [filterScheduleDay, setFilterScheduleDay] = useState('all');
  const [searchSchedule, setSearchSchedule] = useState('');

  // Modals state
  const [showAddTeacherModal, setShowAddTeacherModal] = useState(false);
  const [showAddScheduleModal, setShowAddScheduleModal] = useState(false);
  const [showAdminReportModal, setShowAdminReportModal] = useState(false);
  const [teacherToDelete, setTeacherToDelete] = useState<{id: string, name: string} | null>(null);
  const [scheduleToDelete, setScheduleToDelete] = useState<string | null>(null);
  const [reportToDelete, setReportToDelete] = useState<string | null>(null);

  // Forms state
  const [newTeacherName, setNewTeacherName] = useState('');
  const [newTeacherEmail, setNewTeacherEmail] = useState('');
  const [newTeacherSubject, setNewTeacherSubject] = useState('');
  const [teacherToEdit, setTeacherToEdit] = useState<Teacher | null>(null);
  const [scheduleToEdit, setScheduleToEdit] = useState<Schedule | null>(null);
  
  const [newScheduleTeacher, setNewScheduleTeacher] = useState('');
  const [newScheduleDay, setNewScheduleDay] = useState('ראשון');
  const [newScheduleHour, setNewScheduleHour] = useState('0');
  const [newScheduleSubject, setNewScheduleSubject] = useState(DEFAULT_SCHEDULE_SUBJECTS[0]);
  const [newScheduleLessonType, setNewScheduleLessonType] = useState<LessonType>('fixed');
  const [newScheduleStudentIds, setNewScheduleStudentIds] = useState<string[]>([]);

  const [newStudentName, setNewStudentName] = useState('');
  const [newStudentClass, setNewStudentClass] = useState('');
  const [showAddStudentForm, setShowAddStudentForm] = useState(false);
  const [studentToEdit, setStudentToEdit] = useState<Student | null>(null);
  const [studentToDelete, setStudentToDelete] = useState<{ id: string; name: string } | null>(null);
  const [studentCardStudent, setStudentCardStudent] = useState<Student | null>(null);
  const [filterStudentClass, setFilterStudentClass] = useState('');
  const [searchStudentName, setSearchStudentName] = useState('');

  // Report state (admin report modal)
  const [adminReportingSchedule, setAdminReportingSchedule] = useState<Schedule | null>(null);
  const [editingAdminReport, setEditingAdminReport] = useState<Report | null>(null);
  const [reportStatus, setReportStatus] = useState<'completed' | 'missed'>('completed');
  const [reportText, setReportText] = useState('');
  const [reportDate, setReportDate] = useState('');
  const [reportAttendedIds, setReportAttendedIds] = useState<string[]>([]);
  const [adminReportSubmitting, setAdminReportSubmitting] = useState(false);

  const [impersonateTeacherId, setImpersonateTeacherId] = usePersistedState<string | null>(
    'partani:impersonateTeacherId',
    null,
  );

  // Derived state
  const isPrimaryAdmin = (user?.email || '').trim().toLowerCase() === ADMIN_EMAIL.toLowerCase();
  const isAdmin = isPrimaryAdmin || isListedAdmin;
  const isImpersonating = isAdmin && impersonateTeacherId !== null;
  
  // Find current teacher profile if logged in as teacher (but not admin)
  const currentTeacherProfile = React.useMemo(() => {
    if (isImpersonating) return teachers.find(t => t.id === impersonateTeacherId) || null;
    if (!user || isAdmin) return null;
    return teachers.find(t => t.email.toLowerCase() === user.email?.toLowerCase()) || null;
  }, [user, teachers, isAdmin, isImpersonating, impersonateTeacherId]);

  const teacherSchedules = isImpersonating ? schedule.filter(s => s.teacherId === currentTeacherProfile?.id) : schedule;
  const teacherReports = isImpersonating ? reports.filter(r => r.teacherId === currentTeacherProfile?.id) : reports;


  const activeTeachers = teachers.filter(t => t.active);
  const triggerNotification = (message: string, type = 'success') => {
    setNotification({ show: true, message, type });
    setTimeout(() => setNotification({ show: false, message: '', type: 'success' }), 4000);
  };

  // Auth Effect
  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (u) => {
      setUser(u);
      setAuthLoading(false);
      if (u) {
        setRole('teacher'); // refined when isAdmin becomes known
      } else {
        setRole('landing');
        setIsListedAdmin(false);
      }
    });
    return unsub;
  }, []);

  // Admin membership (Firestore admins/{email})
  useEffect(() => {
    if (!user?.email) {
      setIsListedAdmin(false);
      setAdminCheckDone(true);
      return;
    }
    setAdminCheckDone(false);
    return subscribeToAdminMembership(user.email, (member) => {
      setIsListedAdmin(member);
      setAdminCheckDone(true);
    });
  }, [user?.email]);

  useEffect(() => {
    if (user && isAdmin) setRole('admin');
    else if (user) setRole('teacher');
  }, [user, isAdmin]);

  // Admins list (settings UI) — only when admin
  useEffect(() => {
    if (!user || !isAdmin || isImpersonating) {
      setAdminsList([]);
      return;
    }
    return subscribeToAdmins(
      (list) => setAdminsList(list),
      () => triggerNotification('שגיאה בטעינת רשימת מנהלים', 'error'),
    );
  }, [user, isAdmin, isImpersonating]);

  // Data Subscription Effect
  useEffect(() => {
    // We can subscribe to settings regardless of auth so landing page sees it
    const unsubSettings = subscribeToSettings(
      (data) => setSettings(data)
    );

    if (!user) return unsubSettings;
    
    // Everyone verified logged in can read teachers & students
    const unsubTeachers = subscribeToTeachers(
      (data) => setTeachers(data),
      (err) => triggerNotification('שגיאה בטעינת מורים', 'error')
    );

    const unsubStudents = subscribeToStudents(
      (data) => setStudents(data.sort((a, b) => a.name.localeCompare(b.name, 'he'))),
      (err) => triggerNotification('שגיאה בטעינת תלמידים', 'error')
    );
    
    // Schedules & Reports (Filtered safely on DB rules & client)
    const accessEmail = isAdmin ? null : user.email;
    const unsubSchedules = subscribeToSchedules(accessEmail, 
      (data) => setSchedule(data),
      (err) => triggerNotification('שגיאה בטעינת מערכת שעות', 'error')
    );
    
    const unsubReports = subscribeToReports(accessEmail,
      (data) => setReports(data.sort((a,b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())),
      (err) => triggerNotification('שגיאה בטעינת דיווחים', 'error')
    );

    return () => {
      unsubSettings();
      unsubTeachers();
      unsubStudents();
      unsubSchedules();
      unsubReports();
    };
  }, [user, isAdmin]);

  const handleLogin = async () => {
    const provider = new GoogleAuthProvider();
    provider.setCustomParameters({ prompt: 'select_account' });
    try {
      await signInWithPopup(auth, provider);
    } catch (e: any) {
      console.error('Login error:', e);
      const code: string = e?.code || '';
      let msg = 'התחברות נכשלה';
      if (code === 'auth/unauthorized-domain') {
        msg = `הדומיין ${window.location.hostname} לא מורשה ב-Firebase. יש להוסיף אותו ב-Authentication > Settings > Authorized domains`;
      } else if (code === 'auth/popup-blocked') {
        msg = 'הדפדפן חסם את חלון ההתחברות. אנא אפשר חלונות קופצים ונסה שוב';
      } else if (code === 'auth/popup-closed-by-user' || code === 'auth/cancelled-popup-request') {
        msg = 'חלון ההתחברות נסגר. אנא נסה שוב';
      } else if (code === 'auth/network-request-failed') {
        msg = 'בעיית רשת. בדוק את החיבור לאינטרנט ונסה שוב';
      } else if (code === 'auth/operation-not-allowed') {
        msg = 'התחברות עם Google לא מופעלת ב-Firebase. הפעל אותה ב-Authentication > Sign-in method';
      } else if (code === 'auth/configuration-not-found' || code === 'auth/invalid-api-key') {
        msg = 'הגדרות Firebase שגויות. בדוק את הקונפיגורציה';
      }
      triggerNotification(msg, 'error');
    }
  };


  const handleExportReports = () => {
    const data = filteredReportsList.map(rep => {
      const sched = schedule.find(s => s.id === rep.scheduleId);
      const teach = teachers.find(t => t.id === rep.teacherId);
      const attended = getReportAttendedLabel(rep, sched, students);
      return {
        'תאריך': rep.date,
        'מורה': teach?.name || '-',
        'תלמידים': attended || (sched ? getScheduleDisplayLabel(sched, students) : 'נמחק'),
        'מקצוע': sched?.subject || '-',
        'סטטוס': rep.status === 'completed' ? 'התקיים' : 'בוטל',
        'פירוט': rep.text
      };
    });
    
    const ws = XLSX.utils.json_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Reports");
    XLSX.writeFile(wb, "reports.xlsx");
  };

  const handleLogout = async () => {
    await signOut(auth);
    setRole('landing');
    // איפוס מצב ניווט מתמיד כדי שמשתמש הבא לא ייפתח בטאב של הקודם
    setAdminTab('overview');
    setTeacherTab('overview');
    setImpersonateTeacherId(null);
  };

  // --- Excel Upload Handlers ---
  const handleTeachersExcelUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async (event) => {
      const data = new Uint8Array(event.target?.result as ArrayBuffer);
      const workbook = XLSX.read(data, { type: 'array' });
      const sheetName = workbook.SheetNames[0];
      const sheet = workbook.Sheets[sheetName];
      // Expected columns: שם מלא, אימייל, מקצוע
      const rows = XLSX.utils.sheet_to_json<any>(sheet);
      
      let count = 0;
      try {
        for (const row of rows) {
          const name = row['שם'] || row['שם מלא'] || row['Name'];
          const email = row['אימייל'] || row['דוא"ל'] || row['Email'];
          const subject = row['מקצוע'] || row['Subject'] || 'כללי';

          if (name && email) {
            await addTeacher({
              name: String(name).trim(),
              email: String(email).toLowerCase().trim(),
              subject: String(subject).trim(),
              active: true
            });
            count++;
          }
        }
        triggerNotification(`קובץ עובד בהצלחה! התווספו ${count} מורים חדשים.`);
      } catch (err) {
        triggerNotification(
          getFirestoreUserMessage(err, count > 0 ? `נוספו ${count} מורים ואז נכשל הייבוא` : 'שגיאה בייבוא מורים'),
          'error'
        );
      }
      if (e.target) e.target.value = '';
    };
    reader.readAsArrayBuffer(file);
  };

  const handleSchedulesExcelUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async (event) => {
      const data = new Uint8Array(event.target?.result as ArrayBuffer);
      const workbook = XLSX.read(data, { type: 'array' });
      const sheetName = workbook.SheetNames[0];
      const sheet = workbook.Sheets[sheetName];
      // Expected columns: אימייל מורה, יום, שעה, תלמיד, מקצוע
      const rows = XLSX.utils.sheet_to_json<any>(sheet);
      
      let count = 0;
      let missingTeachers = 0;
      for (const row of rows) {
        const email = String(row['אימייל מורה'] || row['אימייל'] || row['Email'] || '').toLowerCase().trim();
        const day = String(row['יום'] || row['Day'] || '');
        const hour = String(row['שעה'] || row['Hour'] || '');
        const subject = String(row['מקצוע'] || row['Subject'] || '');
        const typeRaw = String(row['סוג'] || row['Type'] || 'קבוע').trim();
        const lessonType: LessonType = typeRaw === 'גמיש' || typeRaw.toLowerCase() === 'flexible' ? 'flexible' : 'fixed';
        const studentsRaw = String(row['תלמידים'] || row['תלמיד'] || row['Student'] || '');

        if (email && day && hour) {
          const teacher = teachers.find(t => t.email === email);
          if (teacher) {
            const studentIds = lessonType === 'fixed' ? resolveStudentIdsFromNames(studentsRaw) : [];
            await addSchedule({
              teacherId: teacher.id,
              teacherEmail: teacher.email,
              day,
              hour,
              subject,
              lessonType,
              studentIds,
              studentName: buildStudentNameField(lessonType, studentIds, students),
            });
            count++;
          } else {
            missingTeachers++;
          }
        }
      }
      
      let msg = `קובץ עובד בהצלחה! התווספו ${count} שיעורים.`;
      if (missingTeachers > 0) {
        msg += ` (${missingTeachers} שיעורים לא הוזנו כי לא נמצא מורה עם האימייל התואם)`;
        triggerNotification(msg, 'error');
      } else {
        triggerNotification(msg);
      }
      if (e.target) e.target.value = '';
    };
    reader.readAsArrayBuffer(file);
  };


  const writeExcelFile = (rows: Record<string, string | number>[], sheetName: string, filename: string) => {
    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, sheetName);
    XLSX.writeFile(wb, filename);
  };

  const handleExportTeachers = () => {
    const rows = teachers.map((t) => ({
      'שם מלא': t.name,
      'אימייל': t.email,
      'מקצוע': t.subject,
      'פעיל': t.active ? 'כן' : 'לא',
      'תזכורות מייל': t.emailRemindersEnabled !== false ? 'כן' : 'לא',
    }));
    writeExcelFile(rows, 'מורים', `מורים_${formatDateInTZ(new Date(), ISRAEL_TIMEZONE)}.xlsx`);
    triggerNotification('רשימת המורים יוצאה לאקסל');
  };

  const handleExportSchedules = () => {
    const rows = schedule.map((s) => {
      const teacher = teachers.find((t) => t.id === s.teacherId);
      return {
        'אימייל מורה': teacher?.email ?? s.teacherEmail,
        'שם מורה': teacher?.name ?? '',
        'יום': s.day,
        'שעה': s.hour,
        'סוג': s.lessonType === 'flexible' ? 'גמיש' : 'קבוע',
        'תלמידים': getScheduleDisplayLabel(s, students),
        'מקצוע': s.subject,
      };
    });
    writeExcelFile(rows, 'שיעורים', `שיעורים_${formatDateInTZ(new Date(), ISRAEL_TIMEZONE)}.xlsx`);
    triggerNotification('רשימת השיעורים יוצאה לאקסל');
  };

  const handleDownloadTeachersTemplate = () => {
    const ws = XLSX.utils.json_to_sheet([
      { 'שם מלא': 'ישראל קריבושי', 'אימייל': 'israel@example.com', 'מקצוע': 'מתמטיקה' },
      { 'שם מלא': 'משה לוי', 'אימייל': 'moshe@example.com', 'מקצוע': 'אנגלית' }
    ]);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'מורים');
    XLSX.writeFile(wb, 'תבנית_יבוא_מורים.xlsx');
  };

  const handleDownloadSchedulesTemplate = () => {
    const ws = XLSX.utils.json_to_sheet([
      { 'אימייל מורה': 'israel@example.com', 'יום': 'ראשון', 'שעה': '2', 'סוג': 'קבוע', 'תלמידים': 'אברהם פריד, יעקב כהן', 'מקצוע': 'מתמטיקה' },
      { 'אימייל מורה': 'moshe@example.com', 'יום': 'שני', 'שעה': '5', 'סוג': 'גמיש', 'תלמידים': '', 'מקצוע': 'אנגלית' }
    ]);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'שיעורים');
    XLSX.writeFile(wb, 'תבנית_יבוא_שיעורים.xlsx');
  };

  const handleDownloadStudentsTemplate = () => {
    const ws = XLSX.utils.json_to_sheet([
      { 'שם': 'אברהם פריד', 'כיתה': "י'1" },
      { 'שם': 'יעקב כהן', 'כיתה': "י'2" },
    ]);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'תלמידים');
    XLSX.writeFile(wb, 'תבנית_יבוא_תלמידים.xlsx');
  };

  const handleStudentsExcelUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async (event) => {
      const data = new Uint8Array(event.target?.result as ArrayBuffer);
      const workbook = XLSX.read(data, { type: 'array' });
      const sheetName = workbook.SheetNames[0];
      const sheet = workbook.Sheets[sheetName];
      const rows = XLSX.utils.sheet_to_json<any>(sheet);

      let count = 0;
      try {
        for (const row of rows) {
          const name = row['שם'] || row['שם מלא'] || row['Name'];
          const className = row['כיתה'] || row['Class'] || row['class'];
          if (name && className) {
            await addStudent({
              name: String(name).trim(),
              className: String(className).trim(),
              active: true,
            });
            count++;
          }
        }
        triggerNotification(`קובץ עובד בהצלחה! התווספו ${count} תלמידים.`);
      } catch (err) {
        triggerNotification(getFirestoreUserMessage(err, 'שגיאה בייבוא תלמידים'), 'error');
      }
      if (e.target) e.target.value = '';
    };
    reader.readAsArrayBuffer(file);
  };

  const resolveStudentIdsFromNames = (namesStr: string): string[] => {
    const names = namesStr.split(/[,،]/).map((n) => n.trim()).filter(Boolean);
    const ids: string[] = [];
    for (const name of names) {
      const match = students.find(
        (s) => s.active && s.name.trim().toLowerCase() === name.toLowerCase(),
      );
      if (match && !ids.includes(match.id)) ids.push(match.id);
    }
    return ids;
  };

  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [testReminderEmail, setTestReminderEmail] = useState('');
  const [sendingRemindersNow, setSendingRemindersNow] = useState(false);
  const [sendingTestReminder, setSendingTestReminder] = useState(false);

  // Admin Actions
  const handleAddTeacher = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTeacherName.trim() || !newTeacherSubject.trim() || !newTeacherEmail.trim()) {
      triggerNotification('נא למלא את כל השדות', 'error');
      return;
    }
    try {
      await addTeacher({
        name: newTeacherName.trim(),
        email: newTeacherEmail.toLowerCase().trim(),
        subject: newTeacherSubject.trim(),
        active: true
      });
      setNewTeacherName('');
      setNewTeacherEmail('');
      setNewTeacherSubject('');
      setShowAddTeacherModal(false);
      triggerNotification(`המורה ${newTeacherName} נוסף בהצלחה למערכת`);
    } catch (err) {
      triggerNotification(getFirestoreUserMessage(err, 'שגיאה בהוספת מורה'), 'error');
    }
  };

  const handleToggleTeacherActive = async (id: string, current: boolean) => {
    try {
      await updateTeacher(id, { active: !current });
      triggerNotification('סטטוס מורה עודכן בהצלחה');
    } catch (err) {
      triggerNotification(getFirestoreUserMessage(err, 'שגיאה בעדכון סטטוס מורה'), 'error');
    }
  };

  const handleToggleTeacherReminders = async (id: string, currentEnabled: boolean) => {
    try {
      await updateTeacher(id, { emailRemindersEnabled: !currentEnabled });
      triggerNotification(
        !currentEnabled
          ? 'תזכורות מייל הופעלו עבור המורה'
          : 'תזכורות מייל בוטלו עבור המורה'
      );
    } catch (err) {
      triggerNotification(getFirestoreUserMessage(err, 'שגיאה בעדכון תזכורות מייל'), 'error');
    }
  };

  // --- Email reminders (global) ---
  const emailRemindersCfg: EmailReminderSettings = settings.emailReminders || {};
  const remindersEnabled = emailRemindersCfg.enabled !== false; // default true
  const remindersMinMissing = Math.max(
    1,
    Number.isFinite(Number(emailRemindersCfg.minMissingLessons))
      ? Number(emailRemindersCfg.minMissingLessons)
      : 1
  );
  const remindersScheduleInfo = useMemo(
    () => getEmailReminderScheduleInfo(new Date(), emailRemindersCfg.lastRunAt),
    [emailRemindersCfg.lastRunAt],
  );

  const holidays = useMemo(
    () => normalizeHolidayPeriods(settings.holidays),
    [settings.holidays],
  );
  const holidayDates = useMemo(() => buildHolidayDateSet(holidays), [holidays]);

  const scheduleSubjectOptions = useMemo(
    () => mergeScheduleSubjects(settings.scheduleSubjects),
    [settings.scheduleSubjects],
  );

  const handleAddCustomSubject = async () => {
    const name = newCustomSubject.trim();
    if (!name) {
      triggerNotification('נא להזין שם מקצוע', 'error');
      return;
    }
    if (scheduleSubjectOptions.includes(name)) {
      triggerNotification('המקצוע כבר קיים ברשימה', 'error');
      return;
    }
    const next = [...(settings.scheduleSubjects || []), name];
    await updateSettings({ scheduleSubjects: next });
    setNewScheduleSubject(name);
    setNewCustomSubject('');
    setShowAddSubjectInput(false);
    triggerNotification(`המקצוע "${name}" נוסף לרשימה`);
  };

  const handleRemoveCustomSubject = async (name: string) => {
    if ((DEFAULT_SCHEDULE_SUBJECTS as readonly string[]).includes(name)) return;
    const next = (settings.scheduleSubjects || []).filter((s) => s !== name);
    await updateSettings({ scheduleSubjects: next });
    if (newScheduleSubject === name) {
      setNewScheduleSubject(DEFAULT_SCHEDULE_SUBJECTS[0]);
    }
    triggerNotification(`המקצוע "${name}" הוסר מהרשימה`);
  };

  const handleToggleRemindersEnabled = async () => {
    const next = !remindersEnabled;
    await updateSettings({
      emailReminders: { ...emailRemindersCfg, enabled: next },
    });
    triggerNotification(
      next
        ? 'תזכורות מייל אוטומטיות הופעלו לכל המורים'
        : 'תזכורות מייל אוטומטיות בוטלו (גלובלי)'
    );
  };

  const handleUpdateRemindersMin = async (value: number) => {
    const sanitized = Math.max(1, Math.round(value || 1));
    await updateSettings({
      emailReminders: { ...emailRemindersCfg, minMissingLessons: sanitized },
    });
    triggerNotification(`סף מינימלי לשליחת תזכורת עודכן ל-${sanitized} שיעורים`);
  };

  const persistHolidays = async (next: HolidayPeriod[]) => {
    await updateSettings({ holidays: next });
  };

  const handleAddHoliday = async (e: React.FormEvent) => {
    e.preventDefault();
    const normalized = normalizeHolidayPeriod({
      startDate: newHolidayStart,
      endDate: newHolidayEnd || newHolidayStart,
      name: newHolidayName,
    });
    if (!normalized) {
      triggerNotification('נא להזין תאריך חופשה תקין', 'error');
      return;
    }
    const next = mergeHolidayPeriods(holidays, [normalized]);
    if (next.length === holidays.length) {
      triggerNotification('טווח החופשה כבר קיים ברשימה', 'error');
      return;
    }
    try {
      await persistHolidays(next);
      setNewHolidayStart('');
      setNewHolidayEnd('');
      setNewHolidayName('');
      triggerNotification('ימי החופשה נוספו — שיעורים בתאריכים אלה מבוטלים');
    } catch (err) {
      triggerNotification(getFirestoreUserMessage(err, 'שגיאה בשמירת חופשה'), 'error');
    }
  };

  const handleRemoveHoliday = async (index: number) => {
    const next = holidays.filter((_, i) => i !== index);
    try {
      await persistHolidays(next);
      triggerNotification('ימי החופשה הוסרו');
    } catch (err) {
      triggerNotification(getFirestoreUserMessage(err, 'שגיאה במחיקת חופשה'), 'error');
    }
  };

  const handleDownloadHolidaysTemplate = () => {
    const ws = XLSX.utils.aoa_to_sheet([
      ['תאריך התחלה', 'תאריך סיום', 'שם'],
    ]);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'חופשות');
    XLSX.writeFile(wb, 'תבנית_יבוא_חופשות.xlsx');
  };

  const handleHolidaysExcelUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setImportingHolidays(true);
    const reader = new FileReader();
    reader.onload = async (event) => {
      try {
        const data = new Uint8Array(event.target?.result as ArrayBuffer);
        const workbook = XLSX.read(data, { type: 'array', cellDates: true });
        const sheetName = workbook.SheetNames[0];
        const sheet = workbook.Sheets[sheetName];
        const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet);

        const incoming: HolidayPeriod[] = [];
        for (const row of rows) {
          const start =
            row['תאריך התחלה'] ??
            row['תאריך'] ??
            row['Start'] ??
            row['startDate'] ??
            row['Date'] ??
            row['date'];
          const end =
            row['תאריך סיום'] ??
            row['עד תאריך'] ??
            row['End'] ??
            row['endDate'] ??
            start;
          const name = row['שם'] ?? row['Name'] ?? row['name'] ?? row['תיאור'];
          const normalized = normalizeHolidayPeriod({ startDate: start, endDate: end, name });
          if (normalized) incoming.push(normalized);
        }

        if (incoming.length === 0) {
          triggerNotification('לא נמצאו תאריכי חופשה תקינים בקובץ', 'error');
          return;
        }

        const before = holidays.length;
        const next = mergeHolidayPeriods(holidays, incoming);
        const added = next.length - before;
        await persistHolidays(next);
        triggerNotification(
          added > 0
            ? `יובאו ${added} טווחי חופשה (מתוך ${incoming.length} שורות תקינות)`
            : `כל ${incoming.length} הטווחים כבר היו ברשימה`,
        );
      } catch (err) {
        triggerNotification(getFirestoreUserMessage(err, 'שגיאה בייבוא חופשות'), 'error');
      } finally {
        setImportingHolidays(false);
        if (e.target) e.target.value = '';
      }
    };
    reader.onerror = () => {
      setImportingHolidays(false);
      triggerNotification('שגיאה בקריאת הקובץ', 'error');
      if (e.target) e.target.value = '';
    };
    reader.readAsArrayBuffer(file);
  };

  const handleSendRemindersNow = async () => {
    if (sendingRemindersNow) return;
    const count = remindersPreview.length;
    const confirmMsg =
      count === 0
        ? 'אין כרגע מורים שעוברים את הסף. לשלוח בכל זאת? (ייתכן שלא יישלח אף מייל)'
        : `לשלוח עכשיו תזכורת ל-${count} מורים שעוברים את הסף?`;
    if (!window.confirm(confirmMsg)) return;

    setSendingRemindersNow(true);
    try {
      const result = await sendRemindersNow();
      if (!result.ok) {
        triggerNotification(result.error || 'שגיאה בשליחת תזכורות', 'error');
        return;
      }
      if (result.skipped) {
        triggerNotification('תזכורות מייל מבוטלות גלובלית — לא נשלח דבר', 'error');
        return;
      }
      const s = result.summary;
      triggerNotification(
        s
          ? `שליחה הושלמה: ${s.sent} נשלחו, ${s.skipped} נדלגו${s.errors > 0 ? `, ${s.errors} שגיאות` : ''}`
          : 'שליחת התזכורות הושלמה'
      );
    } catch (err) {
      triggerNotification(err instanceof Error ? err.message : 'שגיאה בשליחת תזכורות', 'error');
    } finally {
      setSendingRemindersNow(false);
    }
  };

  const handleSendTestReminder = async () => {
    if (sendingTestReminder) return;
    const to = testReminderEmail.trim();
    if (!to || !/.+@.+\..+/.test(to)) {
      triggerNotification('נא להזין כתובת מייל תקינה לבדיקה', 'error');
      return;
    }
    setSendingTestReminder(true);
    try {
      const result = await sendTestReminderEmail(to);
      if (!result.ok) {
        const errMsg =
          typeof result.error === 'string'
            ? result.error
            : result.error?.message || 'שגיאה בשליחת מייל בדיקה';
        triggerNotification(errMsg, 'error');
        return;
      }
      triggerNotification(`מייל בדיקה נשלח אל ${result.sentTo || to}`);
    } catch (err) {
      triggerNotification(err instanceof Error ? err.message : 'שגיאה בשליחת מייל בדיקה', 'error');
    } finally {
      setSendingTestReminder(false);
    }
  };

  // Live preview: list of teachers who would currently be flagged as
  // "missing >= minMissing" — uses the exact same logic as the cron.
  const remindersPreview = React.useMemo(() => {
    if (!isAdmin) return [] as Array<{ teacher: Teacher; missingCount: number }>;
    const out: Array<{ teacher: Teacher; missingCount: number }> = [];
    for (const t of teachers) {
      if (!t.active) continue;
      if (t.emailRemindersEnabled === false) continue;
      const missing = getMissingLessonsForTeacherThisWeek({
        teacherId: t.id,
        schedules: schedule,
        reports,
        timeZone: ISRAEL_TIMEZONE,
        holidayDates,
      });
      if (missing.length >= remindersMinMissing) {
        out.push({ teacher: t, missingCount: missing.length });
      }
    }
    return out.sort((a, b) => b.missingCount - a.missingCount);
  }, [isAdmin, teachers, schedule, reports, remindersMinMissing, holidayDates]);

  
  const handleEditTeacherSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!teacherToEdit || !teacherToEdit.name.trim() || !teacherToEdit.email.trim()) {
      triggerNotification('שם ואימייל הם שדות חובה', 'error');
      return;
    }
    try {
      await updateTeacher(teacherToEdit.id, {
        name: teacherToEdit.name.trim(),
        email: teacherToEdit.email.toLowerCase().trim(),
        subject: (teacherToEdit.subject || '').trim() || 'כללי',
      });
      setTeacherToEdit(null);
      triggerNotification('פרטי המורה עודכנו בהצלחה');
    } catch (err) {
      triggerNotification(getFirestoreUserMessage(err, 'שגיאה בעדכון פרטי מורה'), 'error');
    }
  };

  const handleEditScheduleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!scheduleToEdit || !scheduleToEdit.day.trim() || !scheduleToEdit.hour.trim() || !scheduleToEdit.subject.trim()) {
      triggerNotification('כל שדות החובה חייבים להיות מלאים', 'error');
      return;
    }
    const lessonType = scheduleToEdit.lessonType || 'fixed';
    const studentIds = scheduleToEdit.studentIds || [];
    if (lessonType === 'fixed' && studentIds.length === 0) {
      triggerNotification('יש לבחור לפחות תלמיד אחד לשיעור קבוע', 'error');
      return;
    }
    const tItem = teachers.find(t => t.id === scheduleToEdit.teacherId);
    await updateSchedule(scheduleToEdit.id, {
      day: scheduleToEdit.day,
      hour: scheduleToEdit.hour,
      subject: scheduleToEdit.subject,
      teacherId: scheduleToEdit.teacherId,
      teacherEmail: tItem?.email || scheduleToEdit.teacherEmail,
      lessonType,
      studentIds,
      studentName: buildStudentNameField(lessonType, studentIds, students),
    });
    setScheduleToEdit(null);
    triggerNotification('שעת השיעור עודכנה בהצלחה');
  };

  const handleDeleteTeacher = (id: string, name: string) => {
    setTeacherToDelete({ id, name });
  };

  const confirmDeleteTeacher = async () => {
    if (!teacherToDelete) return;
    try {
      await deleteTeacher(teacherToDelete.id);
      triggerNotification(`המורה נמחק בהצלחה מהמערכת`);
      setTeacherToDelete(null);
    } catch (err) {
      triggerNotification(getFirestoreUserMessage(err, 'שגיאה במחיקת מורה'), 'error');
    }
  };

  const handleAddSchedule = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newScheduleTeacher || !newScheduleHour.trim() || !newScheduleSubject.trim()) {
      triggerNotification('נא למלא את כל השדות', 'error');
      return;
    }
    if (newScheduleLessonType === 'fixed' && newScheduleStudentIds.length === 0) {
      triggerNotification('יש לבחור לפחות תלמיד אחד לשיעור קבוע', 'error');
      return;
    }
    const tItem = teachers.find(t => t.id === newScheduleTeacher);
    if(!tItem) return;

    await addSchedule({
      teacherId: newScheduleTeacher,
      teacherEmail: tItem.email,
      day: newScheduleDay,
      hour: newScheduleHour,
      subject: newScheduleSubject,
      lessonType: newScheduleLessonType,
      studentIds: newScheduleLessonType === 'fixed' ? newScheduleStudentIds : [],
      studentName: buildStudentNameField(newScheduleLessonType, newScheduleStudentIds, students),
    });
    setNewScheduleHour('0');
    setNewScheduleStudentIds([]);
    setNewScheduleSubject(DEFAULT_SCHEDULE_SUBJECTS[0]);
    setShowAddScheduleModal(false);
    triggerNotification('שעת שיעור פרטני נוספה בהצלחה למערכת');
  };

  const handleAddStudent = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newStudentName.trim() || !newStudentClass.trim()) {
      triggerNotification('נא למלא שם וכיתה', 'error');
      return;
    }
    try {
      await addStudent({ name: newStudentName.trim(), className: newStudentClass.trim(), active: true });
      setNewStudentName('');
      setNewStudentClass('');
      setShowAddStudentForm(false);
      triggerNotification('התלמיד נוסף בהצלחה');
    } catch (err) {
      triggerNotification(getFirestoreUserMessage(err, 'שגיאה בהוספת תלמיד'), 'error');
    }
  };

  const handlePreviewGradePromotion = () => {
    const plan = buildStudentPromotionPlan(students, { onlyActive: true });
    setPromotionPlan(plan);
    setPromotionConfirmText('');
  };

  const handleApplyGradePromotion = async () => {
    if (!promotionPlan || promotionBusy) return;
    const summary = summarizePromotionPlan(promotionPlan);
    if (summary.actionable === 0) {
      triggerNotification('אין תלמידים לעדכון', 'error');
      return;
    }
    if (promotionConfirmText.trim() !== 'העלה כיתות') {
      triggerNotification('יש להקליד בדיוק: העלה כיתות', 'error');
      return;
    }
    const updates = promotionPlan
      .filter((p) => p.updates)
      .map((p) => ({ id: p.id, data: p.updates! }));
    setPromotionBusy(true);
    try {
      await batchUpdateStudents(updates);
      triggerNotification(
        `עודכנו ${summary.promoted} תלמידים · ${summary.graduated} סומנו כבוגרים` +
          (summary.unchanged ? ` · ${summary.unchanged} ללא שינוי` : ''),
      );
      setPromotionPlan(null);
      setPromotionConfirmText('');
    } catch (err) {
      triggerNotification(getFirestoreUserMessage(err, 'שגיאה בהעלאת כיתות'), 'error');
    } finally {
      setPromotionBusy(false);
    }
  };

  const handleAddAdminSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (adminFormBusy) return;
    const email = newAdminEmail.trim().toLowerCase();
    if (!email || !email.includes('@')) {
      triggerNotification('נא להזין אימייל תקין', 'error');
      return;
    }
    if (email === ADMIN_EMAIL.toLowerCase()) {
      triggerNotification('מנהל־העל כבר מוגדר במערכת', 'error');
      return;
    }
    setAdminFormBusy(true);
    try {
      await addAdmin(email, newAdminName.trim() || email);
      setNewAdminEmail('');
      setNewAdminName('');
      triggerNotification('הרשאת מנהל נוספה בהצלחה');
    } catch (err) {
      triggerNotification(getFirestoreUserMessage(err, 'שגיאה בהוספת מנהל'), 'error');
    } finally {
      setAdminFormBusy(false);
    }
  };

  const handleRemoveAdmin = async (email: string) => {
    if (adminFormBusy) return;
    if (email.toLowerCase() === ADMIN_EMAIL.toLowerCase()) {
      triggerNotification('לא ניתן להסיר את מנהל־העל', 'error');
      return;
    }
    if (!window.confirm(`להסיר הרשאת מנהל מ־${email}?`)) return;
    setAdminFormBusy(true);
    try {
      await deleteAdmin(email);
      triggerNotification('הרשאת המנהל הוסרה');
    } catch (err) {
      triggerNotification(getFirestoreUserMessage(err, 'שגיאה בהסרת מנהל'), 'error');
    } finally {
      setAdminFormBusy(false);
    }
  };

  const handleEditStudentSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!studentToEdit || !studentToEdit.name.trim() || !studentToEdit.className.trim()) return;
    await updateStudent(studentToEdit.id, {
      name: studentToEdit.name.trim(),
      className: studentToEdit.className.trim(),
      active: studentToEdit.active,
    });
    setStudentToEdit(null);
    triggerNotification('פרטי התלמיד עודכנו');
  };

  const confirmDeleteStudent = async () => {
    if (studentToDelete) {
      await deleteStudent(studentToDelete.id);
      triggerNotification('התלמיד נמחק');
      setStudentToDelete(null);
    }
  };

  const handleDeleteSchedule = (id: string) => {
    setScheduleToDelete(id);
  };


  const handleDeleteReport = (id: string) => {
    setReportToDelete(id);
  };

  const confirmDeleteReport = async () => {
    if (reportToDelete) {
      await deleteReport(reportToDelete);
      triggerNotification('הדיווח נמחק בהצלחה');
      setReportToDelete(null);
    }
  };

  const confirmDeleteSchedule = async () => {
    if (scheduleToDelete) {
      await deleteSchedule(scheduleToDelete);
      triggerNotification('שעת השיעור והדיווחים שלה נמחקו מהמערכת');
      setScheduleToDelete(null);
    }
  };

  const isFlexibleAttendance = (sched: Schedule): boolean =>
    sched.lessonType === 'flexible' || !(sched.studentIds && sched.studentIds.length > 0);

  const getStudentsForAttendance = (sched: Schedule): Student[] =>
    isFlexibleAttendance(sched)
      ? students
      : students.filter((s) => (sched.studentIds || []).includes(s.id));

  const getExpectedStudentIdsForReport = (sched: Schedule): string[] => {
    if (isFlexibleAttendance(sched)) return [];
    return sched.studentIds || [];
  };

  const validateAttendance = (sched: Schedule): boolean => {
    if (reportStatus !== 'completed') return true;
    if (reportAttendedIds.length === 0) {
      triggerNotification('יש לסמן לפחות תלמיד אחד שנוכח בשיעור', 'error');
      return false;
    }
    if (!isFlexibleAttendance(sched)) {
      const invalid = reportAttendedIds.some((id) => !sched.studentIds!.includes(id));
      if (invalid) {
        triggerNotification('ניתן לסמן רק תלמידים המשויכים לשיעור', 'error');
        return false;
      }
    }
    return true;
  };

  const handleAdminSubmitReport = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!adminReportingSchedule || adminReportSubmitting) return;
    if (reportStatus === 'missed' && !reportText.trim()) {
      triggerNotification('נא לציין סיבת ביטול', 'error');
      return;
    }
    if (!validateAttendance(adminReportingSchedule)) return;

    const resolved = resolveLessonDateForSave(adminReportingSchedule, reportDate);
    if (resolved.ok === false) {
      triggerNotification(resolved.message, 'error');
      return;
    }
    const lessonDate = resolved.lessonDate;
    if (holidayDates.has(lessonDate)) {
      triggerNotification('לא ניתן לדווח על שיעור ביום חופשה — השיעור מבוטל', 'error');
      return;
    }
    const textToSave =
      reportText.trim() ||
      (reportStatus === 'completed' ? 'השיעור התקיים' : '');

    const payload = {
      scheduleId: adminReportingSchedule.id,
      teacherId: adminReportingSchedule.teacherId,
      teacherEmail: adminReportingSchedule.teacherEmail,
      date: lessonDate,
      status: reportStatus,
      text: textToSave,
      timestamp: new Date().toISOString(),
      ...(reportStatus === 'completed'
        ? { attendedStudentIds: reportAttendedIds }
        : { attendedStudentIds: [] as string[] }),
    };

    setAdminReportSubmitting(true);
    try {
      if (editingAdminReport) {
        await updateReport(editingAdminReport.id, payload);
        triggerNotification('הדיווח עודכן בהצלחה');
      } else {
        const existing = findReportForLessonDate(reports, adminReportingSchedule, lessonDate);
        if (existing) {
          triggerNotification('כבר קיים דיווח לשיעור זה בתאריך השיעור. ניתן לערוך אותו מרשימת הדיווחים.', 'error');
          return;
        }
        await addReport(payload);
        triggerNotification('דיווח הוסף בהצלחה במערכת!');
      }
      setReportText('');
      setReportAttendedIds([]);
      setEditingAdminReport(null);
      setShowAdminReportModal(false);
      setAdminReportingSchedule(null);
    } catch (err) {
      triggerNotification(getFirestoreUserMessage(err, 'שגיאה בשמירת הדיווח'), 'error');
    } finally {
      setAdminReportSubmitting(false);
    }
  };

  const closeAdminReportModal = () => {
    setShowAdminReportModal(false);
    setAdminReportingSchedule(null);
    setEditingAdminReport(null);
    setReportAttendedIds([]);
    setReportText('');
  };

  const openAdminReport = (sched: Schedule, dateStr: string, existing?: Report) => {
    setAdminReportingSchedule(sched);
    setEditingAdminReport(existing ?? null);
    setReportDate(existing?.date || dateStr);
    setReportStatus(existing?.status || 'completed');
    setReportText(existing?.text || '');
    if (existing?.status === 'completed' && existing.attendedStudentIds?.length) {
      setReportAttendedIds(existing.attendedStudentIds);
    } else {
      const expected = getExpectedStudentIdsForReport(sched);
      const lastIds = getLastAttendedStudentIds(sched.id, reports);
      if (sched.lessonType === 'flexible' && lastIds.length > 0) {
        setReportAttendedIds(lastIds);
      } else if (expected.length > 0) {
        setReportAttendedIds(expected);
      } else {
        setReportAttendedIds([]);
      }
    }
    setShowAdminReportModal(true);
  };

  const openAdminEditReport = (rep: Report) => {
    const sched = schedule.find((s) => s.id === rep.scheduleId);
    if (!sched) {
      triggerNotification('לא נמצא השיעור המשויך לדיווח זה', 'error');
      return;
    }
    openAdminReport(sched, rep.date, rep);
  };

  const totalClassesPlanned = schedule.length;
  const activeTeachersCount = teachers.filter((t) => t.active).length;

  // ----------------------------------------------------------------------
  // Overview & Statistics dashboard — period selection + derivations.
  //
  // Heavy lifting (compliance per teacher, weekly trend, day-of-week)
  // lives in `lib/lesson-stats.ts` as pure functions. Here we just memoise
  // them against (teachers, schedule, reports, range).
  // ----------------------------------------------------------------------
  type StatsPeriodPreset = '7d' | '30d' | '90d' | 'year';
  type StatsPeriod =
    | { type: 'preset'; preset: StatsPeriodPreset }
    | { type: 'custom'; start: string; end: string };

  const [statsPeriod, setStatsPeriod] = usePersistedState<StatsPeriod>(
    'partani:statsPeriod',
    { type: 'preset', preset: '30d' },
    'local'
  );

  type LeaderboardSortKey = 'name' | 'expected' | 'reported' | 'unreported' | 'compliancePct';
  type SortDir = 'asc' | 'desc';
  const [leaderboardSort, setLeaderboardSort] = usePersistedState<{
    key: LeaderboardSortKey;
    dir: SortDir;
  }>('partani:leaderboardSort', { key: 'compliancePct', dir: 'asc' }, 'local');

  const statsRange = useMemo(() => {
    const todayStr = formatDateInTZ(new Date(), ISRAEL_TIMEZONE);
    if (statsPeriod.type === 'custom') {
      const start = statsPeriod.start || addDaysToDateStr(todayStr, -29);
      const end = statsPeriod.end || todayStr;
      return start <= end
        ? { startStr: start, endStr: end }
        : { startStr: end, endStr: start };
    }
    const endStr = todayStr;
    let startStr: string;
    switch (statsPeriod.preset) {
      case '7d':
        startStr = addDaysToDateStr(todayStr, -6);
        break;
      case '90d':
        startStr = addDaysToDateStr(todayStr, -89);
        break;
      case 'year': {
        const [yyStr, mmStr] = todayStr.split('-');
        const yy = Number(yyStr);
        const mm = Number(mmStr);
        // Israeli school year runs roughly Sep → Aug. Anything before
        // September belongs to the year that started the previous Sep.
        startStr = mm >= 9 ? `${yy}-09-01` : `${yy - 1}-09-01`;
        break;
      }
      case '30d':
      default:
        startStr = addDaysToDateStr(todayStr, -29);
        break;
    }
    return { startStr, endStr };
  }, [statsPeriod]);

  const todayStr = useMemo(
    () => formatDateInTZ(new Date(), ISRAEL_TIMEZONE),
    // Recompute when the admin views the dashboard on a new calendar day.
    [statsPeriod, adminTab],
  );

  const dashboardAnalytics = useMemo(
    () =>
      buildDashboardAnalytics({
        schedules: schedule,
        reports,
        teacherIds: teachers.map((t) => t.id),
        startStr: statsRange.startStr,
        endStr: statsRange.endStr,
        todayStr,
        holidayDates,
      }),
    [schedule, reports, teachers, statsRange.startStr, statsRange.endStr, todayStr, holidayDates],
  );

  const teacherCompliance = useMemo(
    () =>
      teachers.map((t) => ({
        teacher: t,
        ...(dashboardAnalytics.teacherCompliance.get(t.id) ?? {
          expected: 0,
          reported: 0,
          completed: 0,
          missed: 0,
          unreported: 0,
          compliancePct: 100,
        }),
      })),
    [teachers, dashboardAnalytics],
  );

  const compareTeacherCompliance = (
    a: (typeof teacherCompliance)[number],
    b: (typeof teacherCompliance)[number],
    key: LeaderboardSortKey,
    dir: SortDir,
  ): number => {
    const mult = dir === 'asc' ? 1 : -1;
    let cmp = 0;
    switch (key) {
      case 'name':
        cmp = a.teacher.name.localeCompare(b.teacher.name, 'he');
        break;
      case 'expected':
        cmp = a.expected - b.expected;
        break;
      case 'reported':
        cmp = a.reported - b.reported;
        break;
      case 'unreported':
        cmp = a.unreported - b.unreported;
        break;
      case 'compliancePct':
        cmp = a.compliancePct - b.compliancePct;
        break;
    }
    if (cmp !== 0) return cmp * mult;

    if (key !== 'unreported' && a.unreported !== b.unreported) {
      return b.unreported - a.unreported;
    }
    if (key !== 'expected' && a.expected !== b.expected) {
      return b.expected - a.expected;
    }
    if (key !== 'compliancePct' && a.compliancePct !== b.compliancePct) {
      return a.compliancePct - b.compliancePct;
    }
    return a.teacher.name.localeCompare(b.teacher.name, 'he');
  };

  const teacherComplianceSorted = useMemo(
    () =>
      [...teacherCompliance].sort((a, b) => {
        const aActive = a.teacher.active ? 0 : 1;
        const bActive = b.teacher.active ? 0 : 1;
        if (aActive !== bActive) return aActive - bActive;
        return compareTeacherCompliance(a, b, leaderboardSort.key, leaderboardSort.dir);
      }),
    [teacherCompliance, leaderboardSort],
  );

  const toggleLeaderboardSort = (key: LeaderboardSortKey) => {
    setLeaderboardSort((prev) =>
      prev.key === key
        ? { key, dir: prev.dir === 'asc' ? 'desc' : 'asc' }
        : { key, dir: key === 'name' ? 'asc' : key === 'compliancePct' ? 'asc' : 'desc' },
    );
  };

  const leaderboardSortIndicator = (key: LeaderboardSortKey) => {
    if (leaderboardSort.key !== key) return null;
    return leaderboardSort.dir === 'asc'
      ? <ChevronUp className="w-3.5 h-3.5 inline mr-0.5" />
      : <ChevronDown className="w-3.5 h-3.5 inline mr-0.5" />;
  };

  const weeklyTrend = dashboardAnalytics.weeklyTrend;
  const dayOfWeekStats = dashboardAnalytics.dayOfWeekStats;
  const periodTotals = dashboardAnalytics.periodTotals;

  const studentLessonCounts = useMemo(() => {
    const counts = new Map<string, number>();
    for (const student of students) {
      counts.set(student.id, countStudentCompletedLessons(student.id, reports, schedule));
    }
    return counts;
  }, [students, reports, schedule]);

  const handleExportStudents = () => {
    const rows = students.map((s) => ({
      'שם': s.name,
      'כיתה': s.className,
      'פעיל': s.active ? 'כן' : 'לא',
      'שעות פרטניות': studentLessonCounts.get(s.id) ?? 0,
    }));
    writeExcelFile(rows, 'תלמידים', `תלמידים_${formatDateInTZ(new Date(), ISRAEL_TIMEZONE)}.xlsx`);
    triggerNotification('רשימת התלמידים יוצאה לאקסל');
  };

  const studentCardSummary = useMemo(() => {
    if (!studentCardStudent) return null;
    return getStudentLessonDetails({
      studentId: studentCardStudent.id,
      reports,
      schedules: schedule,
      teachers,
    });
  }, [studentCardStudent, reports, schedule, teachers]);

  const formatRangeLabel = (startStr: string, endStr: string) => {
    const fmt = (s: string) => {
      const [y, m, d] = s.split('-');
      return `${d}/${m}/${y}`;
    };
    return `${fmt(startStr)} – ${fmt(endStr)}`;
  };

  const exportTeacherComplianceCsv = () => {
    const header = [
      'מורה',
      'אימייל',
      'פעיל',
      'שיעורים צפויים',
      'דווחו',
      'התקיימו',
      'לא התקיימו',
      'חסר דיווח',
      '% היענות',
    ];
    const rows = teacherComplianceSorted.map((tc) => [
      tc.teacher.name ?? '',
      tc.teacher.email ?? '',
      tc.teacher.active ? 'כן' : 'לא',
      String(tc.expected),
      String(tc.reported),
      String(tc.completed),
      String(tc.missed),
      String(tc.unreported),
      `${tc.compliancePct}%`,
    ]);
    const csv = [header, ...rows]
      .map((row) =>
        row
          .map((cell) => {
            const needsQuote = /[",\n\r]/.test(cell);
            const escaped = cell.replace(/"/g, '""');
            return needsQuote ? `"${escaped}"` : escaped;
          })
          .join(',')
      )
      .join('\r\n');
    // Prepend BOM so Excel opens UTF-8 Hebrew cleanly.
    const blob = new Blob(['\uFEFF', csv], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `partani-compliance-${statsRange.startStr}_${statsRange.endStr}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const filteredReportsList = reports.filter(report => {
    const scheduleItem = schedule.find(s => s.id === report.scheduleId);
    const teacherItem = teachers.find(t => t.id === report.teacherId);
    
    const matchesTeacher = filterTeacher === 'all' || report.teacherId === filterTeacher;
    const matchesStatus = filterStatus === 'all' || report.status === filterStatus;
    const matchesDateFrom = !filterReportDateFrom || report.date >= filterReportDateFrom;
    const matchesDateTo = !filterReportDateTo || report.date <= filterReportDateTo;
    
    const searchLower = searchStudent.toLowerCase();
    const attendedLabel = getReportAttendedLabel(report, scheduleItem, students);
    const scheduleLabel = scheduleItem ? getScheduleDisplayLabel(scheduleItem, students) : '';
    const matchesSearch = searchStudent === '' || 
      scheduleLabel.toLowerCase().includes(searchLower) ||
      attendedLabel.toLowerCase().includes(searchLower) ||
      (teacherItem && teacherItem.name.toLowerCase().includes(searchLower)) ||
      (scheduleItem && scheduleItem.subject.toLowerCase().includes(searchLower));

    return matchesTeacher && matchesStatus && matchesSearch && matchesDateFrom && matchesDateTo;
  });

  const filteredTeachersList = useMemo(() => {
    const q = searchTeacher.trim().toLowerCase();
    return teachers.filter((t) => {
      if (filterTeacherActive === 'active' && !t.active) return false;
      if (filterTeacherActive === 'inactive' && t.active) return false;
      if (!q) return true;
      return (
        t.name.toLowerCase().includes(q) ||
        t.email.toLowerCase().includes(q) ||
        t.subject.toLowerCase().includes(q)
      );
    });
  }, [teachers, searchTeacher, filterTeacherActive]);

  const filteredSchedulesList = useMemo(() => {
    const q = searchSchedule.trim().toLowerCase();
    return schedule.filter((s) => {
      if (filterScheduleTeacher !== 'all' && s.teacherId !== filterScheduleTeacher) return false;
      if (filterScheduleDay !== 'all' && s.day !== filterScheduleDay) return false;
      if (!q) return true;
      const teacher = teachers.find((t) => t.id === s.teacherId);
      const label = getScheduleDisplayLabel(s, students).toLowerCase();
      return (
        label.includes(q) ||
        s.subject.toLowerCase().includes(q) ||
        (teacher?.name.toLowerCase().includes(q) ?? false)
      );
    });
  }, [schedule, teachers, students, filterScheduleTeacher, filterScheduleDay, searchSchedule]);

  const missingThisWeekCount = useMemo(() => {
    return activeTeachers.reduce((sum, t) => {
      return (
        sum +
        getMissingLessonsForTeacherThisWeek({
          teacherId: t.id,
          schedules: schedule,
          reports,
          holidayDates,
        }).length
      );
    }, 0);
  }, [activeTeachers, schedule, reports, holidayDates]);

  const adminNavIcons: Record<string, React.ReactNode> = {
    overview: <TrendingUp className="w-4 h-4 shrink-0" />,
    teachers: <Users className="w-4 h-4 shrink-0" />,
    students: <GraduationCap className="w-4 h-4 shrink-0" />,
    schedule: <Calendar className="w-4 h-4 shrink-0" />,
    timetable: <Clock className="w-4 h-4 shrink-0" />,
    reports: <FileText className="w-4 h-4 shrink-0" />,
    settings: <Settings className="w-4 h-4 shrink-0" />,
  };

  if (authLoading) {
    return (
      <div
        className="flex flex-col items-center justify-center min-h-screen gap-4 bg-[#f3f4f6] text-gray-500"
        dir="rtl"
        role="status"
        aria-live="polite"
      >
        <div className="app-spinner" aria-hidden="true" />
        <p className="text-sm font-bold tracking-wide">טוען מערכת...</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-transparent text-[#111827] font-sans flex flex-col" dir="rtl">
      <AnimatePresence>
        {notification.show && (
          <motion.div
            key={`toast-${notification.message}-${notification.type}`}
            role="status"
            aria-live="polite"
            className={`fixed bottom-5 left-4 right-4 sm:left-5 sm:right-auto z-[60] p-4 rounded-lg shadow-lg flex items-center gap-3 sm:max-w-md overflow-hidden ${
              notification.type === 'success' ? 'bg-green-600 text-white' : 'bg-red-600 text-white'
            }`}
            variants={toastVariants}
            initial="initial"
            animate="enter"
            exit="exit"
            transition={{ duration: MOTION.durationBase, ease: MOTION.easeOut }}
          >
            {notification.type === 'success' ? <CheckCircle className="w-6 h-6 shrink-0" /> : <AlertCircle className="w-6 h-6 shrink-0" />}
            <span className="font-semibold text-sm">{notification.message}</span>
            <span
              aria-hidden="true"
              className="absolute bottom-0 left-0 right-0 h-1 bg-white/40 toast-progress"
            />
          </motion.div>
        )}
      </AnimatePresence>

      {/* Header */}
      <header className="bg-[#1e293b] text-white border-b border-gray-700 sticky top-0 z-40">
        <div className="container mx-auto px-3 sm:px-4 py-3 flex justify-between items-center gap-2 min-w-0">
          <div className="flex items-center gap-2 sm:gap-4 min-w-0">
            {/* כפתור תפריט צד (Hamburger) */}
            <button
              type="button"
              aria-label="פתח תפריט"
              aria-expanded={mobileMenuOpen}
              aria-controls="app-side-drawer"
              className={`press p-2 text-white hover:bg-white/10 border border-transparent hover:border-gray-600 rounded-lg transition-colors bg-gray-800 focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-400 shrink-0 ${
                isAdmin && !isImpersonating ? 'lg:hidden' : ''
              }`}
              onClick={() => setMobileMenuOpen(true)}
            >
              <Menu className="w-6 h-6" />
            </button>
            
            <div className="flex items-center gap-2 sm:gap-3 min-w-0">
              <AppLogos className="flex items-center gap-2 shrink-0" logoClassName="h-8 sm:h-10 w-auto object-contain rounded" />
              <div className="min-w-0">
                <h1 className="font-bold text-sm sm:text-lg leading-tight md:text-xl truncate">{SITE_TITLE}</h1>
                <p className="text-amber-400 text-[10px] sm:text-xs font-semibold truncate">ישיבת צביה אלישיב לוד</p>
              </div>
            </div>
          </div>
        </div>
      </header>

      {/* תפריט צד (Drawer) - נפתח מצד ימין */}
      <Drawer
        open={mobileMenuOpen}
        onClose={() => setMobileMenuOpen(false)}
        title="תפריט אפשרויות"
        panelClassName="w-72"
      >
        <div id="app-side-drawer" className="flex flex-col h-full">
          <div className="p-4 border-b border-gray-700 flex justify-between items-center bg-[#0f172a]">
            <span className="font-bold">תפריט אפשרויות</span>
            <button
              type="button"
              aria-label="סגור תפריט"
              onClick={() => setMobileMenuOpen(false)}
              className="press hover:bg-white/10 p-1 rounded-full focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-400"
            >
              <X className="w-6 h-6" />
            </button>
          </div>
          <motion.div
            className="flex-1 p-4 space-y-2 overflow-y-auto"
            initial="initial"
            animate="enter"
            variants={{
              enter: { transition: { staggerChildren: 0.04, delayChildren: 0.06 } },
            }}
          >
            {!user && (
              <motion.button
                variants={drawerItemVariants}
                transition={{ duration: MOTION.durationBase, ease: MOTION.easeOut }}
                onClick={() => { handleLogin(); setMobileMenuOpen(false); }}
                className="press w-full p-3 rounded-lg bg-amber-500 text-[#111827] font-bold transition flex items-center gap-3 hover:bg-amber-400"
              >
                <Lock className="w-5 h-5" /> כניסה למערכת
              </motion.button>
            )}

            {user && (
              <div className="space-y-4">
                <motion.div
                  variants={drawerItemVariants}
                  transition={{ duration: MOTION.durationBase, ease: MOTION.easeOut }}
                  className="text-sm text-gray-300 pb-4 border-b border-gray-700"
                >
                  <p className="font-bold text-white mb-1">{isAdmin ? 'מנהל ישיבה' : currentTeacherProfile?.name || user.email}</p>
                  {isAdmin && <p className="text-xs text-amber-400">גישת הנהלה מורחבת</p>}
                </motion.div>

                {isAdmin && !isImpersonating && (
                  <div className="space-y-1">
                    <p className="text-xs font-bold text-gray-500 mb-2 uppercase">דפי ניהול</p>
                    {ADMIN_NAV_ITEMS.map(item => (
                      <motion.button
                        key={item.id}
                        variants={drawerItemVariants}
                        transition={{ duration: MOTION.durationBase, ease: MOTION.easeOut }}
                        onClick={() => { setAdminTab(item.id); setMobileMenuOpen(false); }}
                        aria-current={adminTab === item.id ? 'page' : undefined}
                        className={`press w-full text-right p-2 rounded flex items-center gap-3 transition-colors ${adminTab === item.id ? 'bg-blue-600 text-white' : 'text-gray-300 hover:bg-gray-800'}`}
                      >
                        {adminNavIcons[item.id]} {item.label}
                      </motion.button>
                    ))}
                  </div>
                )}

                {((!isAdmin && currentTeacherProfile) || isImpersonating) && (
                  <div className="space-y-1">
                    <p className="text-xs font-bold text-gray-500 mb-2 uppercase">דפי מורה</p>
                    {[
                      { id: 'overview' as const, label: 'דיווח', icon: <Calendar className="w-4 h-4"/> },
                      { id: 'history'  as const, label: 'היסטוריה', icon: <FileText className="w-4 h-4"/> },
                    ].map(item => (
                      <motion.button
                        key={item.id}
                        variants={drawerItemVariants}
                        transition={{ duration: MOTION.durationBase, ease: MOTION.easeOut }}
                        onClick={() => { setTeacherTab(item.id); setMobileMenuOpen(false); }}
                        aria-current={teacherTab === item.id ? 'page' : undefined}
                        className={`press w-full text-right p-2 rounded flex items-center gap-3 transition-colors ${teacherTab === item.id ? 'bg-blue-600 text-white' : 'text-gray-300 hover:bg-gray-800'}`}
                      >
                        {item.icon} {item.label}
                      </motion.button>
                    ))}
                  </div>
                )}

                {isImpersonating && (
                  <motion.button
                    variants={drawerItemVariants}
                    transition={{ duration: MOTION.durationBase, ease: MOTION.easeOut }}
                    onClick={() => { setImpersonateTeacherId(null); setMobileMenuOpen(false); }}
                    className="press w-full text-right p-2 rounded flex items-center gap-3 transition-colors bg-amber-600 hover:bg-amber-700 text-white"
                  >
                    <LogOut className="w-4 h-4"/> סיום צפייה כמורה
                  </motion.button>
                )}

                <motion.div
                  variants={drawerItemVariants}
                  transition={{ duration: MOTION.durationBase, ease: MOTION.easeOut }}
                  className="pt-4 mt-4 border-t border-gray-700"
                >
                  <button
                    onClick={() => { handleLogout(); setMobileMenuOpen(false); }}
                    className="press w-full text-right p-2 rounded-lg text-red-400 hover:bg-red-500 hover:text-white transition-colors flex items-center gap-3"
                  >
                    <LogOut className="w-5 h-5" /> יציאה מהחשבון
                  </button>
                </motion.div>
              </div>
            )}
          </motion.div>
        </div>
      </Drawer>

      <main className="flex-1 flex flex-col min-h-0">
        {/* LANDING */}
        {!user && (
          <div className="py-12 px-4 max-w-6xl mx-auto flex items-center flex-col text-center space-y-8">
            <AppLogos className="flex items-center justify-center gap-6" logoClassName="h-16 md:h-20 w-auto object-contain rounded" />
             <div className="text-center max-w-3xl mx-auto space-y-4">
              <span className="px-4 py-1.5 rounded-full text-xs font-bold uppercase tracking-wider bg-blue-100 text-blue-800 border border-blue-200">
                ישיבת צביה אלישיב לוד
              </span>
              <h2 className="text-3xl md:text-5xl font-bold text-[#111827] leading-tight">
                {SITE_TITLE}
              </h2>
              <p className="text-gray-600 text-base md:text-lg">
                כלי מקוון ומהיר לצוות המורים ולהנהלת הישיבה למעקב, תיעוד ובקרה אחר שיעורי הלמידה הפרטניים של תלמידנו. המערכת מזהה אותך אוטומטית כמורה או הנהלה.
              </p>
            </div>
            
            <button
                onClick={handleLogin}
                className="press py-3 sm:py-4 px-8 sm:px-12 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-lg transition-colors duration-200 flex items-center justify-center gap-3 shadow-sm text-base sm:text-lg hover:shadow-md focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-300 w-full max-w-sm"
              >
                <span>התחבר עם Google</span>
                <Lock className="w-5 h-5" />
            </button>
          </div>
        )}

        {/* Waiting for admin membership check */}
        {user && !isAdmin && !isImpersonating && !currentTeacherProfile && !adminCheckDone && (
          <div
            className="flex flex-col items-center justify-center py-24 gap-4 text-gray-500"
            dir="rtl"
            role="status"
          >
            <div className="app-spinner" aria-hidden="true" />
            <p className="text-sm font-bold">בודק הרשאות...</p>
          </div>
        )}

        {/* TEACHER NOT FOUND (Logged in but no teacher profile) */}
        {user && !isAdmin && !isImpersonating && !currentTeacherProfile && adminCheckDone && (
           <div className="py-12 px-4 max-w-2xl mx-auto text-center space-y-6">
              <div className="bg-white p-8 rounded-lg shadow border border-red-100">
                  <AlertCircle className="w-16 h-16 mx-auto text-red-500 mb-4" />
                  <h2 className="text-2xl font-bold text-gray-800 mb-2">גישה חסומה</h2>
                  <p className="text-gray-600 mb-6">
                    חשבון האימייל שלך ({user.email}) אינו מופיע ברשימת המורים של הישיבה. <br /> אנא פנה להנהלה להוספתך.
                  </p>
                  <button onClick={handleLogout} className="px-6 py-2 bg-gray-100 font-bold rounded-lg hover:bg-gray-200 text-gray-700">התנתק</button>
              </div>
           </div>
        )}

        {/* TEACHER VIEW */}
        {((user && !isAdmin && currentTeacherProfile) || isImpersonating) && currentTeacherProfile && (
          <TeacherDashboard
            teacher={currentTeacherProfile}
            schedules={teacherSchedules}
            reports={teacherReports}
            students={students}
            holidays={holidays}
            teacherTab={teacherTab}
            setTeacherTab={setTeacherTab}
            isImpersonating={isImpersonating}
            onEndImpersonation={() => setImpersonateTeacherId(null)}
            onNotify={triggerNotification}
          />
        )}

        {/* ADMIN VIEW */}
        {user && isAdmin && !isImpersonating && (
          <div className="flex flex-1 w-full min-h-0">
            {/* Desktop sidebar */}
            <aside className="hidden lg:flex w-56 xl:w-60 shrink-0 flex-col bg-slate-800 text-white sticky top-[53px] h-[calc(100dvh-53px)] border-l border-slate-700/80">
              <div className="px-4 py-4 border-b border-slate-700">
                <p className="text-[10px] font-bold uppercase tracking-wider text-amber-400">הנהלה</p>
                <p className="text-sm font-bold mt-0.5 truncate">צביה אלישיב לוד</p>
              </div>
              <nav className="flex-1 p-2 space-y-0.5 overflow-y-auto" aria-label="ניווט מנהל">
                {ADMIN_NAV_ITEMS.map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => setAdminTab(item.id)}
                    aria-current={adminTab === item.id ? 'page' : undefined}
                    className={`press w-full text-right px-3 py-2.5 rounded-lg flex items-center gap-2.5 text-sm font-bold transition-colors ${
                      adminTab === item.id
                        ? 'bg-blue-600 text-white shadow-sm'
                        : 'text-slate-300 hover:bg-slate-700/80 hover:text-white'
                    }`}
                  >
                    {adminNavIcons[item.id]}
                    {item.label}
                  </button>
                ))}
              </nav>
              <div className="p-3 border-t border-slate-700">
                <button
                  type="button"
                  onClick={handleLogout}
                  className="press w-full text-right px-3 py-2 rounded-lg text-sm font-bold text-red-300 hover:bg-red-500/20 hover:text-red-200 flex items-center gap-2"
                >
                  <LogOut className="w-4 h-4" /> יציאה
                </button>
              </div>
            </aside>

            <div className="flex-1 min-w-0 py-5 sm:py-6 px-3 sm:px-5 lg:px-8 max-w-6xl w-full mx-auto space-y-5">
              <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-xs font-bold text-slate-500">לוח בקרה · ישיבת צביה אלישיב</p>
                  <h2 className="text-xl sm:text-2xl font-bold text-gray-900 tracking-tight">{getAdminTabLabel(adminTab)}</h2>
                </div>
                <div className="flex flex-wrap gap-2">
                  {missingThisWeekCount > 0 && (
                    <button
                      type="button"
                      onClick={() => setAdminTab('timetable')}
                      className="press px-3 py-2 rounded-xl text-xs sm:text-sm font-bold bg-amber-50 text-amber-950 border border-amber-200 hover:bg-amber-100"
                    >
                      {missingThisWeekCount} שיעורים חסרים השבוע
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => setAdminTab('timetable')}
                    className="press px-3 py-2 rounded-xl text-xs sm:text-sm font-bold bg-white border border-gray-200 text-gray-700 hover:bg-gray-50"
                  >
                    לוח שבועי
                  </button>
                  <button
                    type="button"
                    onClick={() => { setAdminTab('schedule'); setShowAddScheduleModal(true); }}
                    className="press px-3 py-2 rounded-xl text-xs sm:text-sm font-bold bg-blue-600 text-white hover:bg-blue-700"
                  >
                    + שיבוץ
                  </button>
                </div>
              </div>

            <AnimatePresence mode="wait" initial={false}>
            {/* TAB: SETTINGS */}
            {adminTab === 'settings' && (
              <motion.div
                key="admin-settings"
                variants={tabVariants}
                initial="initial"
                animate="enter"
                exit="exit"
                transition={tabTransition}
                className="space-y-6"
              >
                <div className="bg-white rounded-lg p-4 sm:p-6 shadow-sm border border-gray-100">
                  <h3 className="text-lg sm:text-xl font-bold mb-4 text-gray-900 border-b pb-4">לוגואים ומיתוג</h3>
                  <p className="text-sm text-gray-600 mb-4 break-words">
                    הלוגואים נטענים מקבצים בתיקיית <code className="bg-gray-100 px-1 rounded">public/</code> בפרויקט.
                    להחלפת לוגו, החלף את הקובץ המתאים ורענן את הדף.
                  </p>
                  <div className="grid md:grid-cols-2 gap-4 sm:gap-6">
                    <div className="bg-gray-50 border border-gray-200 p-4 sm:p-5 rounded-lg space-y-3">
                      <p className="text-sm font-bold text-gray-800 break-words">לוגו ראשי — <code className="font-mono text-xs">public/logo1.png</code></p>
                      <img src="/logo1.png" alt="לוגו ראשי" className="h-16 sm:h-20 w-auto max-w-full object-contain border border-gray-200 rounded p-2 bg-white" />
                    </div>
                    <div className="bg-gray-50 border border-gray-200 p-4 sm:p-5 rounded-lg space-y-3">
                      <p className="text-sm font-bold text-gray-800 break-words">לוגו משני — <code className="font-mono text-xs">public/logo2.png</code></p>
                      <img src="/logo2.png" alt="לוגו משני" className="h-16 sm:h-20 w-auto max-w-full object-contain border border-gray-200 rounded p-2 bg-white" />
                    </div>
                  </div>
                </div>

                {/* Email Reminders Section */}
                <div className="bg-white rounded-lg p-4 sm:p-6 shadow-sm border border-gray-100">
                  <div className="flex flex-col sm:flex-row items-start justify-between gap-4 mb-6 border-b pb-4">
                    <div className="min-w-0">
                      <h3 className="text-lg sm:text-xl font-bold text-gray-900 flex items-center gap-2">
                        <FileText className="w-5 h-5 text-blue-600 shrink-0" />
                        תזכורות מייל אוטומטיות
                      </h3>
                      <p className="text-sm text-gray-500 mt-1">
                        שליחה אוטומטית של תזכורת למורים פעילים שלא דיווחו על לפחות {remindersMinMissing} שיעורים שכבר התקיימו השבוע.
                        המערכת רצה אוטומטית בכל יום חמישי ב־20:00 שעון ישראל בקיץ (19:00 בחורף), ושולחת לכל מורה לכל היותר מייל אחד בשבוע.
                      </p>
                    </div>
                    <label className="relative inline-flex items-center cursor-pointer flex-shrink-0">
                      <input
                        type="checkbox"
                        className="sr-only peer"
                        checked={remindersEnabled}
                        onChange={handleToggleRemindersEnabled}
                      />
                      <div className="w-14 h-7 bg-gray-200 peer-focus:outline-none peer-focus:ring-2 peer-focus:ring-blue-300 rounded-full peer peer-checked:after:translate-x-[-1.75rem] after:content-[''] after:absolute after:top-0.5 after:right-0.5 after:bg-white after:border after:rounded-full after:h-6 after:w-6 after:transition-all peer-checked:bg-blue-600"></div>
                      <span className="ml-3 text-sm font-bold text-gray-700">
                        {remindersEnabled ? 'מופעל' : 'מבוטל'}
                      </span>
                    </label>
                  </div>

                  <div className="grid md:grid-cols-2 gap-6">
                    <div className="bg-gray-50 border border-gray-200 p-5 rounded-lg space-y-3">
                      <label className="block text-sm font-bold text-gray-800">סף מינימלי לשליחת תזכורת</label>
                      <p className="text-xs text-gray-500">
                        מספר השיעורים שלא דווחו השבוע שמהם והלאה תישלח תזכורת. מינימום 1.
                      </p>
                      <div className="flex items-center gap-3">
                        <input
                          type="number"
                          min={1}
                          max={20}
                          value={remindersMinMissing}
                          onChange={(e) => {
                            const v = Number(e.target.value);
                            if (Number.isFinite(v) && v >= 1 && v !== remindersMinMissing) {
                              void handleUpdateRemindersMin(v);
                            }
                          }}
                          disabled={!remindersEnabled}
                          className="w-24 p-2 border rounded-lg bg-white text-center font-bold disabled:bg-gray-100 disabled:text-gray-400"
                        />
                        <span className="text-sm text-gray-600">שיעורים לא-מדווחים השבוע</span>
                      </div>
                    </div>

                    <div className="bg-gray-50 border border-gray-200 p-5 rounded-lg space-y-3">
                      <div className="space-y-1">
                        <label className="block text-sm font-bold text-gray-800">ריצה הבאה</label>
                        <p className="text-xs text-gray-500">
                          מתוזמן ל־
                          <span className="font-mono text-gray-800">
                            {remindersScheduleInfo.nextAt.toLocaleString('he-IL', {
                              timeZone: ISRAEL_TIMEZONE,
                              weekday: 'long',
                              day: 'numeric',
                              month: 'long',
                              year: 'numeric',
                              hour: '2-digit',
                              minute: '2-digit',
                            })}
                          </span>
                          {' '}(שעון ישראל)
                        </p>
                        {remindersScheduleInfo.status === 'in-window' && (
                          <p className="text-xs text-amber-700 bg-amber-50 border border-amber-100 rounded px-2 py-1.5">
                            חלון הריצה פתוח עכשיו — בתוכנית Hobby של Vercel ייתכן שהשליחה תתבצע עד סוף השעה (ולא בדיוק בדקה 00).
                          </p>
                        )}
                        {remindersScheduleInfo.status === 'possibly-missed' && (
                          <p className="text-xs text-red-700 bg-red-50 border border-red-100 rounded px-2 py-1.5">
                            חלון הריצה האחרון עבר בלי עדכון של «ריצה אחרונה». ייתכן שה-cron נכשל (הרשאה / SMTP / כיבוי גלובלי) — בדוק ב-Vercel → Logs, או השתמש ב«שלח תזכורות עכשיו».
                          </p>
                        )}
                      </div>
                      <div className="border-t border-gray-200 pt-3 space-y-1">
                        <label className="block text-sm font-bold text-gray-800">ריצה אחרונה</label>
                        {emailRemindersCfg.lastRunAt ? (
                          <>
                            <p className="text-xs text-gray-500">
                              תאריך:{' '}
                              <span className="font-mono text-gray-700">
                                {new Date(emailRemindersCfg.lastRunAt).toLocaleString('he-IL', {
                                  timeZone: ISRAEL_TIMEZONE,
                                })}
                              </span>
                            </p>
                            {emailRemindersCfg.lastRunSummary && (
                              <div className="flex flex-wrap gap-2 pt-2">
                                <span className="text-xs font-bold bg-green-100 text-green-800 px-2.5 py-1 rounded">
                                  {emailRemindersCfg.lastRunSummary.sent} נשלחו
                                </span>
                                <span className="text-xs font-bold bg-gray-100 text-gray-700 px-2.5 py-1 rounded">
                                  {emailRemindersCfg.lastRunSummary.skipped} נדלגו
                                </span>
                                {emailRemindersCfg.lastRunSummary.errors > 0 && (
                                  <span className="text-xs font-bold bg-red-100 text-red-800 px-2.5 py-1 rounded">
                                    {emailRemindersCfg.lastRunSummary.errors} שגיאות
                                  </span>
                                )}
                              </div>
                            )}
                          </>
                        ) : (
                          <p className="text-xs text-gray-500">המערכת טרם הריצה תזכורות בהצלחה.</p>
                        )}
                      </div>
                    </div>
                  </div>

                  <div className="mt-6 grid md:grid-cols-2 gap-6">
                    <div className="bg-blue-50 border border-blue-100 p-5 rounded-lg space-y-3">
                      <div className="flex items-center gap-2">
                        <Send className="w-4 h-4 text-blue-700" />
                        <label className="block text-sm font-bold text-gray-800">שליחה מיידית</label>
                      </div>
                      <p className="text-xs text-gray-600">
                        מריץ עכשיו את אותה שליחה כמו ביום חמישי — לכל המורים שעוברים את הסף (מתעלם מהגבלת מייל אחד בשבוע).
                      </p>
                      <button
                        type="button"
                        onClick={() => void handleSendRemindersNow()}
                        disabled={!remindersEnabled || sendingRemindersNow}
                        className="press inline-flex items-center gap-2 px-4 py-2.5 rounded-lg bg-blue-600 text-white text-sm font-bold hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        {sendingRemindersNow ? (
                          <Loader2 className="w-4 h-4 animate-spin" />
                        ) : (
                          <Send className="w-4 h-4" />
                        )}
                        {sendingRemindersNow ? 'שולח...' : 'שלח תזכורות עכשיו'}
                      </button>
                    </div>

                    <div className="bg-gray-50 border border-gray-200 p-5 rounded-lg space-y-3">
                      <div className="flex items-center gap-2">
                        <Mail className="w-4 h-4 text-gray-700" />
                        <label className="block text-sm font-bold text-gray-800">מייל בדיקה</label>
                      </div>
                      <p className="text-xs text-gray-500">
                        שולח תזכורת לדוגמה (נתונים סינתטיים) לכתובת שתזין — לבדיקה שהמיילים יוצאים כראוי.
                      </p>
                      <div className="flex flex-col sm:flex-row gap-2">
                        <input
                          type="email"
                          dir="ltr"
                          placeholder="you@example.com"
                          value={testReminderEmail}
                          onChange={(e) => setTestReminderEmail(e.target.value)}
                          className="flex-1 p-2 border rounded-lg bg-white text-sm font-mono"
                        />
                        <button
                          type="button"
                          onClick={() => void handleSendTestReminder()}
                          disabled={sendingTestReminder}
                          className="press inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg bg-gray-800 text-white text-sm font-bold hover:bg-gray-900 disabled:opacity-50 disabled:cursor-not-allowed whitespace-nowrap"
                        >
                          {sendingTestReminder ? (
                            <Loader2 className="w-4 h-4 animate-spin" />
                          ) : (
                            <Mail className="w-4 h-4" />
                          )}
                          {sendingTestReminder ? 'שולח...' : 'שלח בדיקה'}
                        </button>
                      </div>
                    </div>
                  </div>

                  {remindersEnabled && (
                    <div className="mt-6">
                      <h4 className="text-sm font-bold text-gray-800 mb-2 flex items-center gap-2">
                        <AlertCircle className="w-4 h-4 text-amber-600" />
                        מורים שייקבלו תזכורת בריצה הבאה ({remindersPreview.length})
                      </h4>
                      {remindersPreview.length === 0 ? (
                        <p className="text-xs text-gray-500 bg-green-50 border border-green-100 p-3 rounded">
                          אין כרגע מורים פעילים שעוברים את הסף. כל הכבוד לצוות!
                        </p>
                      ) : (
                        <>
                          <div className="md:hidden space-y-2">
                            {remindersPreview.map(({ teacher, missingCount }) => (
                              <div key={teacher.id} className="border rounded-lg p-3 bg-amber-50/40 space-y-1">
                                <div className="flex items-center justify-between gap-2">
                                  <span className="font-bold text-gray-800 text-sm break-words">{teacher.name}</span>
                                  <span className="inline-block bg-amber-100 text-amber-800 font-bold px-2.5 py-1 rounded-full text-xs shrink-0">
                                    {missingCount} לא דווחו
                                  </span>
                                </div>
                                <p className="text-gray-600 font-mono text-xs break-all" dir="ltr">{teacher.email}</p>
                              </div>
                            ))}
                          </div>
                          <div className="hidden md:block border rounded-lg overflow-hidden">
                            <table className="w-full text-right text-sm">
                              <thead className="bg-gray-50 text-xs text-gray-500">
                                <tr>
                                  <th className="px-4 py-2 font-bold">מורה</th>
                                  <th className="px-4 py-2 font-bold">אימייל</th>
                                  <th className="px-4 py-2 font-bold text-center">שיעורים לא דווחו</th>
                                </tr>
                              </thead>
                              <tbody className="divide-y">
                                {remindersPreview.map(({ teacher, missingCount }) => (
                                  <tr key={teacher.id} className="hover:bg-amber-50/40 transition-colors">
                                    <td className="px-4 py-2 font-bold text-gray-800">{teacher.name}</td>
                                    <td className="px-4 py-2 text-gray-600 font-mono text-xs" dir="ltr">{teacher.email}</td>
                                    <td className="px-4 py-2 text-center">
                                      <span className="inline-block bg-amber-100 text-amber-800 font-bold px-2.5 py-1 rounded-full text-xs">
                                        {missingCount}
                                      </span>
                                    </td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        </>
                      )}
                    </div>
                  )}
                </div>

                {/* Holidays / cancelled lesson days */}
                <div className="bg-white rounded-lg p-4 sm:p-6 shadow-sm border border-gray-100">
                  <div className="flex flex-col sm:flex-row items-start justify-between gap-4 mb-6 border-b pb-4">
                    <div className="min-w-0">
                      <h3 className="text-lg sm:text-xl font-bold text-gray-900 flex items-center gap-2">
                        <Calendar className="w-5 h-5 text-blue-600 shrink-0" />
                        ימי חופשה וביטול שיעורים
                      </h3>
                      <p className="text-sm text-gray-500 mt-1">
                        בתאריכים אלה השיעורים מבוטלים: לא נספרים כחסרים בתזכורות מייל ולא בסטטיסטיקות דיווח.
                        ניתן להוסיף ידנית או לייבא מקובץ Excel.
                      </p>
                    </div>
                    <div className="flex flex-wrap gap-2 shrink-0">
                      <button
                        type="button"
                        onClick={handleDownloadHolidaysTemplate}
                        className="px-3 py-2 bg-gray-100 border border-gray-300 hover:bg-gray-200 text-gray-700 font-bold rounded text-sm flex items-center gap-1.5"
                      >
                        <Download className="w-4 h-4" />
                        תבנית ריקה
                      </button>
                      <label className="px-3 py-2 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded text-sm flex items-center gap-1.5 cursor-pointer">
                        {importingHolidays ? (
                          <Loader2 className="w-4 h-4 animate-spin" />
                        ) : (
                          <Upload className="w-4 h-4" />
                        )}
                        {importingHolidays ? 'מייבא...' : 'ייבוא Excel'}
                        <input
                          type="file"
                          accept=".xlsx,.xls,.csv"
                          className="hidden"
                          disabled={importingHolidays}
                          onChange={(e) => void handleHolidaysExcelUpload(e)}
                        />
                      </label>
                    </div>
                  </div>

                  <form onSubmit={(e) => void handleAddHoliday(e)} className="grid sm:grid-cols-2 lg:grid-cols-4 gap-3 mb-6">
                    <div>
                      <label className="block text-xs font-bold text-gray-700 mb-1">מתאריך</label>
                      <input
                        type="date"
                        required
                        value={newHolidayStart}
                        onChange={(e) => setNewHolidayStart(e.target.value)}
                        className="w-full p-2 border rounded-lg bg-white text-sm"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-bold text-gray-700 mb-1">עד תאריך (אופציונלי)</label>
                      <input
                        type="date"
                        value={newHolidayEnd}
                        min={newHolidayStart || undefined}
                        onChange={(e) => setNewHolidayEnd(e.target.value)}
                        className="w-full p-2 border rounded-lg bg-white text-sm"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-bold text-gray-700 mb-1">שם (אופציונלי)</label>
                      <input
                        type="text"
                        placeholder="למשל חופשת פסח"
                        value={newHolidayName}
                        onChange={(e) => setNewHolidayName(e.target.value)}
                        className="w-full p-2 border rounded-lg bg-white text-sm"
                      />
                    </div>
                    <div className="flex items-end">
                      <button
                        type="submit"
                        className="press w-full inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg bg-blue-600 text-white text-sm font-bold hover:bg-blue-700"
                      >
                        <Plus className="w-4 h-4" />
                        הוסף
                      </button>
                    </div>
                  </form>

                  <p className="text-xs text-gray-500 mb-3">
                    בעמודות הקובץ: <span className="font-mono">תאריך התחלה</span>,{' '}
                    <span className="font-mono">תאריך סיום</span> (אופציונלי ליום בודד),{' '}
                    <span className="font-mono">שם</span>. פורמט מומלץ: YYYY-MM-DD או DD/MM/YYYY.
                  </p>

                  {holidays.length === 0 ? (
                    <p className="text-sm text-gray-500 bg-gray-50 border border-gray-100 rounded-lg p-4">
                      עדיין לא הוגדרו ימי חופשה. הוסיפו תאריכים ידנית או ייבאו מקובץ.
                    </p>
                  ) : (
                    <div className="border rounded-lg overflow-hidden">
                      <table className="w-full text-right text-sm">
                        <thead className="bg-gray-50 text-xs text-gray-500">
                          <tr>
                            <th className="px-3 py-2 font-bold">תאריכים</th>
                            <th className="px-3 py-2 font-bold">שם</th>
                            <th className="px-3 py-2 font-bold w-16" />
                          </tr>
                        </thead>
                        <tbody className="divide-y">
                          {holidays.map((h, index) => (
                            <tr key={`${h.startDate}-${h.endDate}-${h.name || ''}-${index}`} className="hover:bg-gray-50/80">
                              <td className="px-3 py-2 font-mono text-xs sm:text-sm text-gray-800 whitespace-nowrap">
                                {formatHolidayRangeLabel(h)}
                              </td>
                              <td className="px-3 py-2 text-gray-700">{h.name || '—'}</td>
                              <td className="px-3 py-2 text-left">
                                <button
                                  type="button"
                                  onClick={() => void handleRemoveHoliday(index)}
                                  className="press p-1.5 text-red-600 hover:bg-red-50 rounded"
                                  title="מחק"
                                >
                                  <Trash2 className="w-4 h-4" />
                                </button>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>

                {/* Grade promotion */}
                <div className="bg-white rounded-xl p-4 sm:p-6 shadow-sm border border-gray-100 space-y-4">
                  <div className="border-b pb-4">
                    <h3 className="text-lg sm:text-xl font-bold text-gray-900 flex items-center gap-2">
                      <ArrowUpCircle className="w-5 h-5 text-blue-600 shrink-0" />
                      העלאת כיתות (סוף שנה)
                    </h3>
                    <p className="text-sm text-gray-500 mt-1">
                      מעביר את כל התלמידים הפעילים כיתה אחת קדימה (למשל י1 → יא1, ז3 → ח3).
                      תלמידי יב מסומנים כבוגרים ומועברים לסטטוס לא פעיל.
                    </p>
                  </div>
                  {!promotionPlan ? (
                    <button
                      type="button"
                      onClick={handlePreviewGradePromotion}
                      className="press px-4 py-2.5 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-xl text-sm"
                    >
                      הצג תצוגה מקדימה
                    </button>
                  ) : (
                    <div className="space-y-4">
                      {(() => {
                        const summary = summarizePromotionPlan(promotionPlan);
                        return (
                          <div className="flex flex-wrap gap-2 text-xs font-bold">
                            <span className="px-2.5 py-1 rounded-lg bg-blue-50 text-blue-800">{summary.promoted} יועלו כיתה</span>
                            <span className="px-2.5 py-1 rounded-lg bg-amber-50 text-amber-900">{summary.graduated} בוגרים</span>
                            <span className="px-2.5 py-1 rounded-lg bg-gray-100 text-gray-600">{summary.unchanged} ללא שינוי</span>
                          </div>
                        );
                      })()}
                      <div className="max-h-56 overflow-y-auto border border-gray-100 rounded-xl divide-y text-sm">
                        {promotionPlan.slice(0, 80).map((p) => (
                          <div key={p.id} className="px-3 py-2 flex flex-wrap items-center justify-between gap-2">
                            <span className="font-bold text-gray-900">{p.name}</span>
                            <span className="text-xs text-gray-600">
                              {p.from}
                              {p.kind !== 'unchanged' && (
                                <>
                                  {' → '}
                                  <span className={p.kind === 'graduated' ? 'text-amber-800 font-bold' : 'text-green-700 font-bold'}>
                                    {p.to}
                                  </span>
                                </>
                              )}
                              {p.kind === 'unchanged' && p.reason && (
                                <span className="text-red-600 mr-1">({p.reason})</span>
                              )}
                            </span>
                          </div>
                        ))}
                        {promotionPlan.length > 80 && (
                          <p className="px-3 py-2 text-xs text-gray-400">…ועוד {promotionPlan.length - 80}</p>
                        )}
                      </div>
                      <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 space-y-2">
                        <p className="text-xs font-bold text-amber-950">
                          פעולה בלתי הפיכה בקלות. להמשך הקלד <span className="font-mono">העלה כיתות</span>:
                        </p>
                        <input
                          value={promotionConfirmText}
                          onChange={(e) => setPromotionConfirmText(e.target.value)}
                          className="w-full p-2 border border-amber-200 rounded-lg text-sm bg-white"
                          placeholder="העלה כיתות"
                        />
                      </div>
                      <div className="flex flex-wrap gap-2">
                        <button
                          type="button"
                          disabled={promotionBusy}
                          onClick={() => void handleApplyGradePromotion()}
                          className="press px-4 py-2.5 bg-green-600 hover:bg-green-700 disabled:opacity-60 text-white font-bold rounded-xl text-sm flex items-center gap-2"
                        >
                          {promotionBusy ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
                          בצע העלאת כיתות
                        </button>
                        <button
                          type="button"
                          disabled={promotionBusy}
                          onClick={() => { setPromotionPlan(null); setPromotionConfirmText(''); }}
                          className="press px-4 py-2.5 bg-gray-100 hover:bg-gray-200 text-gray-800 font-bold rounded-xl text-sm"
                        >
                          ביטול
                        </button>
                      </div>
                    </div>
                  )}
                </div>

                {/* Admin permissions */}
                <div className="bg-white rounded-xl p-4 sm:p-6 shadow-sm border border-gray-100 space-y-4">
                  <div className="border-b pb-4">
                    <h3 className="text-lg sm:text-xl font-bold text-gray-900 flex items-center gap-2">
                      <Shield className="w-5 h-5 text-blue-600 shrink-0" />
                      הרשאות מנהל
                    </h3>
                    <p className="text-sm text-gray-500 mt-1">
                      מנהלים יכולים לערוך מורים, תלמידים, שיבוץ ודיווחים. מנהל־העל ({ADMIN_EMAIL}) תמיד פעיל ולא ניתן להסרה.
                    </p>
                  </div>

                  <div className="border border-gray-100 rounded-xl overflow-hidden">
                    <div className="px-3 py-2.5 bg-slate-50 border-b flex items-center justify-between gap-2">
                      <div>
                        <p className="font-bold text-gray-900 text-sm">מנהל־על</p>
                        <p className="text-xs text-gray-500" dir="ltr">{ADMIN_EMAIL}</p>
                      </div>
                      <span className="text-[10px] font-bold px-2 py-0.5 rounded-lg bg-amber-100 text-amber-900">קבוע</span>
                    </div>
                    {adminsList.length === 0 ? (
                      <p className="px-3 py-4 text-sm text-gray-400">אין מנהלים נוספים</p>
                    ) : (
                      <ul className="divide-y">
                        {adminsList.map((a) => (
                          <li key={a.id} className="px-3 py-2.5 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
                            <div className="min-w-0">
                              <p className="font-bold text-gray-900 text-sm">{a.name || a.email}</p>
                              <p className="text-xs text-gray-500 break-all" dir="ltr">{a.email}</p>
                            </div>
                            <button
                              type="button"
                              disabled={adminFormBusy}
                              onClick={() => void handleRemoveAdmin(a.email)}
                              className="press self-start px-3 py-1.5 text-xs font-bold text-red-600 bg-red-50 hover:bg-red-100 rounded-lg flex items-center gap-1"
                            >
                              <Trash2 className="w-3.5 h-3.5" /> הסר הרשאה
                            </button>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>

                  <form onSubmit={handleAddAdminSubmit} className="grid sm:grid-cols-3 gap-3 items-end bg-gray-50 border border-gray-100 rounded-xl p-3 sm:p-4">
                    <div>
                      <label className="text-xs font-bold text-gray-600 block mb-1">שם מנהל</label>
                      <input
                        value={newAdminName}
                        onChange={(e) => setNewAdminName(e.target.value)}
                        className="w-full p-2 border rounded-lg text-sm bg-white"
                        placeholder="שם להצגה"
                      />
                    </div>
                    <div>
                      <label className="text-xs font-bold text-gray-600 block mb-1">אימייל (Google)</label>
                      <input
                        type="email"
                        required
                        value={newAdminEmail}
                        onChange={(e) => setNewAdminEmail(e.target.value)}
                        className="w-full p-2 border rounded-lg text-sm bg-white"
                        placeholder="name@gmail.com"
                        dir="ltr"
                      />
                    </div>
                    <button
                      type="submit"
                      disabled={adminFormBusy}
                      className="press py-2.5 px-4 bg-blue-600 hover:bg-blue-700 disabled:opacity-60 text-white font-bold rounded-xl text-sm flex items-center justify-center gap-2"
                    >
                      {adminFormBusy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
                      הוסף מנהל
                    </button>
                  </form>
                </div>
              </motion.div>
            )}

            {/* TAB: TEACHERS */}
            {adminTab === 'teachers' && (
              <motion.div
                key="admin-teachers"
                variants={tabVariants}
                initial="initial"
                animate="enter"
                exit="exit"
                transition={tabTransition}
                className="space-y-6"
              >
                                <div className="flex flex-wrap gap-2">
                  <button onClick={() => setShowAddTeacherModal(true)} className="press px-3 sm:px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded text-sm flex items-center gap-1.5 shadow-sm"><Plus className="w-4 h-4 shrink-0"/> הוספת מורה חדש</button>
                  <label className="px-3 sm:px-4 py-2 bg-green-600 hover:bg-green-700 text-white font-bold rounded text-sm flex items-center gap-1.5 shadow-sm cursor-pointer">
                    <Upload className="w-4 h-4 shrink-0"/> ייבוא מורים מהאקסל
                    <input type="file" accept=".xlsx, .xls" className="hidden" onChange={handleTeachersExcelUpload} />
                  </label>
                  <button onClick={handleDownloadTeachersTemplate} className="px-3 sm:px-4 py-2 bg-gray-100 border border-gray-300 hover:bg-gray-200 text-gray-700 font-bold rounded text-sm flex items-center gap-1.5 shadow-sm">
                    <Download className="w-4 h-4 shrink-0"/> הורד תבנית ריקה
                  </button>
                  <button onClick={handleExportTeachers} className="px-3 sm:px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white font-bold rounded text-sm flex items-center gap-1.5 shadow-sm">
                    <Download className="w-4 h-4 shrink-0"/> ייצוא לאקסל
                  </button>
                </div>

                <div className="bg-white p-3 sm:p-4 rounded-xl shadow-sm border border-gray-100 flex flex-col sm:flex-row gap-3">
                  <input
                    value={searchTeacher}
                    onChange={(e) => setSearchTeacher(e.target.value)}
                    placeholder="חיפוש לפי שם, אימייל או מקצוע..."
                    className="flex-1 p-2 border border-gray-200 rounded-lg text-sm outline-none focus:ring-2 focus:ring-blue-500"
                  />
                  <select
                    value={filterTeacherActive}
                    onChange={(e) => setFilterTeacherActive(e.target.value as 'all' | 'active' | 'inactive')}
                    className="p-2 border border-gray-200 rounded-lg text-sm bg-white sm:w-40"
                  >
                    <option value="all">כל הסטטוסים</option>
                    <option value="active">פעילים בלבד</option>
                    <option value="inactive">לא פעילים</option>
                  </select>
                </div>
                
                <AnimatePresence initial={false}>
                {showAddTeacherModal && (
                  <motion.div
                    key="add-teacher-form"
                    initial={{ opacity: 0, y: -8, height: 0 }}
                    animate={{ opacity: 1, y: 0, height: 'auto' }}
                    exit={{ opacity: 0, y: -8, height: 0 }}
                    transition={{ duration: MOTION.durationBase, ease: MOTION.easeOut }}
                    className="overflow-hidden"
                  >
                    <div className="bg-gray-100 p-4 sm:p-6 rounded-lg border border-blue-200">
                      <h4 className="font-bold text-gray-900 mb-4">הוסף מורה</h4>
                      <form onSubmit={handleAddTeacher} className="grid md:grid-cols-4 gap-4 items-end">
                        <div>
                          <label className="text-xs font-bold">שם מלא:</label>
                          <input type="text" value={newTeacherName} onChange={e => setNewTeacherName(e.target.value)} className="w-full p-2 border rounded-lg focus:ring-2 focus:ring-blue-500 outline-none" required/>
                        </div>
                        <div>
                          <label className="text-xs font-bold">אימייל (כניסה):</label>
                          <input type="email" value={newTeacherEmail} onChange={e => setNewTeacherEmail(e.target.value)} className="w-full p-2 border rounded-lg focus:ring-2 focus:ring-blue-500 outline-none" required/>
                        </div>
                        <div>
                          <label className="text-xs font-bold">מקצוע:</label>
                          <input type="text" value={newTeacherSubject} onChange={e => setNewTeacherSubject(e.target.value)} className="w-full p-2 border rounded-lg focus:ring-2 focus:ring-blue-500 outline-none" required/>
                        </div>
                        <div className="flex gap-2">
                          <button type="submit" className="press py-2.5 px-4 bg-green-600 hover:bg-green-700 text-white font-bold rounded-lg text-sm w-full">שמור</button>
                          <button type="button" onClick={() => setShowAddTeacherModal(false)} className="press py-2.5 px-4 bg-gray-200 hover:bg-gray-300 text-gray-700 font-bold rounded-lg text-sm w-full">בטל</button>
                        </div>
                      </form>
                    </div>
                  </motion.div>
                )}
                </AnimatePresence>

                <div className="bg-white rounded-lg border border-gray-200 shadow-sm flex-1 overflow-hidden">
                  {/* Mobile cards */}
                  <div className="md:hidden divide-y">
                    {filteredTeachersList.map(t => {
                      const reminderOn = t.emailRemindersEnabled !== false;
                      return (
                        <div key={t.id} className="p-4 space-y-3">
                          <div className="flex items-start justify-between gap-2">
                            <div className="min-w-0">
                              <p className="font-bold text-gray-900 break-words">{t.name}</p>
                              <p className="text-xs text-gray-500 break-all" dir="ltr">{t.email}</p>
                              <p className="text-sm text-gray-700 mt-1">{t.subject}</p>
                            </div>
                            <button onClick={() => handleToggleTeacherActive(t.id, t.active)} className={`press px-3 py-1 rounded-full text-xs font-bold shrink-0 transition-colors ${t.active ? 'bg-green-100 text-green-800 hover:bg-green-200' : 'bg-red-100 text-red-800 hover:bg-red-200'}`}>
                              {t.active ? 'פעיל' : 'לא פעיל'}
                            </button>
                          </div>
                          <div className="flex items-center justify-between gap-3">
                            <div className="flex items-center gap-2">
                              <span className="text-xs font-bold text-gray-500">תזכורות מייל</span>
                              <button
                                onClick={() => handleToggleTeacherReminders(t.id, reminderOn)}
                                disabled={!t.active}
                                title={!t.active ? 'מורה לא פעיל לא יקבל תזכורות בכל מקרה' : (reminderOn ? 'לחץ לכיבוי תזכורות מייל למורה זה' : 'לחץ להפעלת תזכורות מייל למורה זה')}
                                className={`press inline-flex items-center justify-center w-10 h-6 rounded-full transition-colors relative ${
                                  !t.active
                                    ? 'bg-gray-200 cursor-not-allowed opacity-60'
                                    : reminderOn
                                    ? 'bg-blue-600 hover:bg-blue-700'
                                    : 'bg-gray-300 hover:bg-gray-400'
                                }`}
                              >
                                <span
                                  className={`absolute top-0.5 ${reminderOn ? 'right-0.5' : 'right-[1.125rem]'} bg-white border rounded-full h-5 w-5 transition-all`}
                                />
                              </button>
                            </div>
                            <div className="flex flex-wrap items-center gap-1.5">
                              <button onClick={() => setImpersonateTeacherId(t.id)} className="press px-2.5 py-1.5 text-xs font-bold bg-blue-50 text-blue-700 hover:bg-blue-100 rounded-lg transition-colors flex items-center gap-1"><BookOpen className="w-3.5 h-3.5"/> צפה כמורה</button>
                              <button onClick={() => setTeacherToEdit(t)} className="press px-2.5 py-1.5 text-xs font-bold bg-green-50 text-green-700 hover:bg-green-100 rounded-lg transition-colors flex items-center gap-1"><Edit3 className="w-3.5 h-3.5"/> ערוך</button>
                              <button onClick={() => handleDeleteTeacher(t.id, t.name)} className="press px-2.5 py-1.5 text-xs font-bold bg-red-50 text-red-600 hover:bg-red-100 rounded-lg transition-colors flex items-center gap-1"><Trash2 className="w-3.5 h-3.5"/> מחק</button>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                  {/* Desktop table */}
                  <div className="hidden md:block overflow-x-auto">
                    <table className="w-full text-right">
                      <thead className="bg-gray-50 text-xs text-gray-500 border-b">
                        <tr>
                          <th className="px-6 py-4">שם מורה</th>
                          <th className="px-6 py-4">אימייל</th>
                          <th className="px-6 py-4">מקצוע</th>
                          <th className="px-6 py-4 text-center">סטטוס</th>
                          <th className="px-6 py-4 text-center" title="האם המורה יקבל תזכורות מייל אוטומטיות על שיעורים שלא דווחו">תזכורות מייל</th>
                          <th className="px-6 py-4 text-center">פעולות</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y text-sm">
                        {filteredTeachersList.map(t => {
                          const reminderOn = t.emailRemindersEnabled !== false;
                          return (
                          <tr key={t.id} className="transition-colors hover:bg-blue-50/40">
                            <td className="px-4 py-3 font-bold">{t.name}</td>
                            <td className="px-4 py-3 text-sm" dir="ltr">{t.email}</td>
                            <td className="px-4 py-3">{t.subject}</td>
                            <td className="px-4 py-3 text-center">
                              <button onClick={() => handleToggleTeacherActive(t.id, t.active)} className={`press px-3 py-1 rounded-full text-xs font-bold transition-colors ${t.active ? 'bg-green-100 text-green-800 hover:bg-green-200' : 'bg-red-100 text-red-800 hover:bg-red-200'}`}>
                                {t.active ? 'פעיל' : 'לא פעיל'}
                              </button>
                            </td>
                            <td className="px-4 py-3 text-center">
                              <button
                                onClick={() => handleToggleTeacherReminders(t.id, reminderOn)}
                                disabled={!t.active}
                                title={!t.active ? 'מורה לא פעיל לא יקבל תזכורות בכל מקרה' : (reminderOn ? 'לחץ לכיבוי תזכורות מייל למורה זה' : 'לחץ להפעלת תזכורות מייל למורה זה')}
                                className={`press inline-flex items-center justify-center w-10 h-6 rounded-full transition-colors relative ${
                                  !t.active
                                    ? 'bg-gray-200 cursor-not-allowed opacity-60'
                                    : reminderOn
                                    ? 'bg-blue-600 hover:bg-blue-700'
                                    : 'bg-gray-300 hover:bg-gray-400'
                                }`}
                              >
                                <span
                                  className={`absolute top-0.5 ${reminderOn ? 'right-0.5' : 'right-[1.125rem]'} bg-white border rounded-full h-5 w-5 transition-all`}
                                />
                              </button>
                            </td>
                            <td className="px-4 py-3">
                              <div className="flex items-center justify-center gap-1.5 flex-wrap">
                                 <button onClick={() => setImpersonateTeacherId(t.id)} className="press px-2 py-1 text-xs font-bold bg-blue-50 text-blue-700 hover:bg-blue-100 rounded-lg transition-colors flex items-center gap-1"><BookOpen className="w-3.5 h-3.5"/> צפה כמורה</button>
                                 <button onClick={() => setTeacherToEdit(t)} className="press px-2 py-1 text-xs font-bold bg-green-50 text-green-700 hover:bg-green-100 rounded-lg transition-colors flex items-center gap-1"><Edit3 className="w-3.5 h-3.5"/> ערוך</button>
                                 <button onClick={() => handleDeleteTeacher(t.id, t.name)} className="press px-2 py-1 text-xs font-bold bg-red-50 text-red-600 hover:bg-red-100 rounded-lg transition-colors flex items-center gap-1"><Trash2 className="w-3.5 h-3.5"/> מחק</button>
                              </div>
                            </td>
                          </tr>
                        );})}
                      </tbody>
                    </table>
                  </div>
                </div>
              </motion.div>
            )}

            {/* TAB: STUDENTS */}
            {adminTab === 'students' && (
              <motion.div
                key="admin-students"
                variants={tabVariants}
                initial="initial"
                animate="enter"
                exit="exit"
                transition={tabTransition}
                className="space-y-6"
              >
                <div className="flex flex-wrap gap-2">
                  <button onClick={() => setShowAddStudentForm(true)} className="press px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded text-sm flex items-center gap-1.5 shadow-sm"><Plus className="w-4 h-4"/> הוספת תלמיד</button>
                  <label className="px-4 py-2 bg-green-600 hover:bg-green-700 text-white font-bold rounded text-sm flex items-center gap-1.5 shadow-sm cursor-pointer">
                    <Upload className="w-4 h-4"/> ייבוא תלמידים מאקסל
                    <input type="file" accept=".xlsx, .xls" className="hidden" onChange={handleStudentsExcelUpload} />
                  </label>
                  <button onClick={handleDownloadStudentsTemplate} className="px-4 py-2 bg-gray-100 border border-gray-300 hover:bg-gray-200 text-gray-700 font-bold rounded text-sm flex items-center gap-1.5 shadow-sm">
                    <Download className="w-4 h-4"/> הורד תבנית ריקה
                  </button>
                  <button onClick={handleExportStudents} className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white font-bold rounded text-sm flex items-center gap-1.5 shadow-sm">
                    <Download className="w-4 h-4"/> ייצוא לאקסל
                  </button>
                </div>

                <AnimatePresence initial={false}>
                {showAddStudentForm && (
                  <motion.div
                    key="add-student-form"
                    initial={{ opacity: 0, y: -8, height: 0 }}
                    animate={{ opacity: 1, y: 0, height: 'auto' }}
                    exit={{ opacity: 0, y: -8, height: 0 }}
                    transition={{ duration: MOTION.durationBase, ease: MOTION.easeOut }}
                    className="overflow-hidden"
                  >
                    <div className="bg-gray-100 p-4 sm:p-6 rounded-lg border border-blue-200">
                      <h4 className="font-bold text-gray-900 mb-4">הוסף תלמיד</h4>
                      <form onSubmit={handleAddStudent} className="grid md:grid-cols-3 gap-4 items-end">
                        <div>
                          <label className="text-xs font-bold">שם מלא:</label>
                          <input type="text" value={newStudentName} onChange={e => setNewStudentName(e.target.value)} className="w-full p-2 border rounded-lg focus:ring-2 focus:ring-blue-500 outline-none" required />
                        </div>
                        <div>
                          <label className="text-xs font-bold">כיתה:</label>
                          <input type="text" value={newStudentClass} onChange={e => setNewStudentClass(e.target.value)} placeholder="לדוגמה: י'1" className="w-full p-2 border rounded-lg focus:ring-2 focus:ring-blue-500 outline-none" required />
                        </div>
                        <div className="flex gap-2">
                          <button type="submit" className="press py-2.5 px-4 bg-green-600 hover:bg-green-700 text-white font-bold rounded-lg text-sm w-full">שמור</button>
                          <button type="button" onClick={() => setShowAddStudentForm(false)} className="press py-2.5 px-4 bg-gray-200 hover:bg-gray-300 text-gray-700 font-bold rounded-lg text-sm w-full">בטל</button>
                        </div>
                      </form>
                    </div>
                  </motion.div>
                )}
                </AnimatePresence>

                <div className="bg-white rounded-lg border border-gray-200 shadow-sm p-4 flex flex-col sm:flex-row flex-wrap gap-3">
                  <input
                    type="text"
                    value={searchStudentName}
                    onChange={e => setSearchStudentName(e.target.value)}
                    placeholder="חיפוש לפי שם..."
                    className="flex-1 min-w-0 w-full sm:min-w-[200px] p-2 border rounded-lg text-sm"
                  />
                  <select value={filterStudentClass} onChange={e => setFilterStudentClass(e.target.value)} className="p-2 border rounded-lg text-sm bg-white w-full sm:w-auto sm:min-w-[120px]">
                    <option value="">כל הכיתות</option>
                    {getUniqueClassNames(students).map(c => <option key={c} value={c}>{c}</option>)}
                  </select>
                  <span className="text-sm text-gray-500 self-center">{students.filter(s => s.active).length} תלמידים פעילים</span>
                </div>

                <div className="bg-white rounded-lg border border-gray-200 shadow-sm flex-1 overflow-hidden">
                  {(() => {
                    const filteredStudents = students.filter(s => {
                      if (filterStudentClass && s.className !== filterStudentClass) return false;
                      if (searchStudentName.trim()) {
                        const q = searchStudentName.trim().toLowerCase();
                        return s.name.toLowerCase().includes(q);
                      }
                      return true;
                    });
                    return (
                      <>
                        <div className="md:hidden divide-y">
                          {filteredStudents.map(s => {
                            const lessonCount = studentLessonCounts.get(s.id) ?? 0;
                            return (
                              <div key={s.id} className="p-4 space-y-3">
                                <div className="flex items-start justify-between gap-2">
                                  <div className="min-w-0">
                                    <button
                                      type="button"
                                      onClick={() => setStudentCardStudent(s)}
                                      className="press text-blue-800 hover:text-blue-600 hover:underline font-bold text-right break-words"
                                      title="פתח כרטיס תלמיד"
                                    >
                                      {s.name}
                                    </button>
                                    <p className="text-sm text-gray-600 mt-0.5">כיתה {s.className} · {lessonCount} שעות פרטניות</p>
                                  </div>
                                  <button
                                    onClick={() => updateStudent(s.id, { active: !s.active })}
                                    className={`press px-3 py-1 rounded-full text-xs font-bold shrink-0 transition-colors ${s.active ? 'bg-green-100 text-green-800 hover:bg-green-200' : 'bg-red-100 text-red-800 hover:bg-red-200'}`}
                                  >
                                    {s.active ? 'פעיל' : 'לא פעיל'}
                                  </button>
                                </div>
                                <div className="flex items-center gap-2">
                                  <button onClick={() => setStudentCardStudent(s)} className="press p-2 bg-blue-50 text-blue-600 hover:bg-blue-100 rounded transition-colors" title="כרטיס תלמיד"><FileText className="w-4 h-4"/></button>
                                  <button onClick={() => setStudentToEdit(s)} className="press p-2 hover:bg-green-50 rounded transition-colors"><Edit3 className="w-4 h-4 text-green-600"/></button>
                                  <button onClick={() => setStudentToDelete({ id: s.id, name: s.name })} className="press p-2 hover:bg-red-50 rounded transition-colors"><Trash2 className="w-4 h-4 text-red-500"/></button>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                        <div className="hidden md:block overflow-x-auto">
                          <table className="w-full text-right">
                            <thead className="bg-gray-50 text-xs text-gray-500 border-b">
                              <tr>
                                <th className="px-6 py-4">שם</th>
                                <th className="px-6 py-4">כיתה</th>
                                <th className="px-6 py-4 text-center">סטטוס</th>
                                <th className="px-6 py-4 text-center">שעות פרטניות</th>
                                <th className="px-6 py-4 text-center">פעולות</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y text-sm">
                              {filteredStudents.map(s => {
                                const lessonCount = studentLessonCounts.get(s.id) ?? 0;
                                return (
                                  <tr key={s.id} className="transition-colors hover:bg-blue-50/40">
                                    <td className="px-6 py-4 font-bold">
                                      <button
                                        type="button"
                                        onClick={() => setStudentCardStudent(s)}
                                        className="press text-blue-800 hover:text-blue-600 hover:underline font-bold"
                                        title="פתח כרטיס תלמיד"
                                      >
                                        {s.name}
                                      </button>
                                    </td>
                                    <td className="px-6 py-4">{s.className}</td>
                                    <td className="px-6 py-4 text-center">
                                      <button
                                        onClick={() => updateStudent(s.id, { active: !s.active })}
                                        className={`press px-3 py-1 rounded-full text-xs font-bold transition-colors ${s.active ? 'bg-green-100 text-green-800 hover:bg-green-200' : 'bg-red-100 text-red-800 hover:bg-red-200'}`}
                                      >
                                        {s.active ? 'פעיל' : 'לא פעיל'}
                                      </button>
                                    </td>
                                    <td className="px-6 py-4 text-center font-bold text-blue-700">{lessonCount}</td>
                                    <td className="px-6 py-4">
                                      <div className="flex items-center justify-center gap-2">
                                        <button onClick={() => setStudentCardStudent(s)} className="press p-1.5 bg-blue-50 text-blue-600 hover:bg-blue-100 rounded transition-colors" title="כרטיס תלמיד"><FileText className="w-4 h-4"/></button>
                                        <button onClick={() => setStudentToEdit(s)} className="press p-1.5 hover:bg-green-50 rounded transition-colors"><Edit3 className="w-4 h-4 text-green-600"/></button>
                                        <button onClick={() => setStudentToDelete({ id: s.id, name: s.name })} className="press p-1.5 hover:bg-red-50 rounded transition-colors"><Trash2 className="w-4 h-4 text-red-500"/></button>
                                      </div>
                                    </td>
                                  </tr>
                                );
                              })}
                            </tbody>
                          </table>
                        </div>
                      </>
                    );
                  })()}
                </div>
              </motion.div>
            )}

            {/* TAB: SCHEDULE */}
            {adminTab === 'schedule' && (
              <motion.div
                key="admin-schedule"
                variants={tabVariants}
                initial="initial"
                animate="enter"
                exit="exit"
                transition={tabTransition}
                className="space-y-6"
              >
                                <div className="flex flex-wrap gap-2">
                  <button onClick={() => setShowAddScheduleModal(true)} className="press px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded text-sm flex items-center gap-1.5 shadow-sm"><Plus className="w-4 h-4"/> הגדר שיעור פרטני</button>
                  <button onClick={() => setAdminTab('timetable')} className="press px-4 py-2 bg-white border border-gray-200 hover:bg-gray-50 text-gray-800 font-bold rounded text-sm flex items-center gap-1.5 shadow-sm"><Clock className="w-4 h-4"/> לוח שבועי</button>
                  <label className="px-4 py-2 bg-green-600 hover:bg-green-700 text-white font-bold rounded text-sm flex items-center gap-1.5 shadow-sm cursor-pointer">
                    <Upload className="w-4 h-4"/> ייבוא שיעורים מהאקסל
                    <input type="file" accept=".xlsx, .xls" className="hidden" onChange={handleSchedulesExcelUpload} />
                  </label>
                  <button onClick={handleDownloadSchedulesTemplate} className="px-4 py-2 bg-gray-100 border border-gray-300 hover:bg-gray-200 text-gray-700 font-bold rounded text-sm flex items-center gap-1.5 shadow-sm">
                    <Download className="w-4 h-4"/> הורד תבנית ריקה
                  </button>
                  <button onClick={handleExportSchedules} className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white font-bold rounded text-sm flex items-center gap-1.5 shadow-sm">
                    <Download className="w-4 h-4"/> ייצוא לאקסל
                  </button>
                </div>

                <div className="bg-white p-3 sm:p-4 rounded-xl shadow-sm border border-gray-100 grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div>
                    <label className="text-xs font-bold text-gray-500 block mb-1">חיפוש</label>
                    <input
                      value={searchSchedule}
                      onChange={(e) => setSearchSchedule(e.target.value)}
                      placeholder="מורה, תלמיד, מקצוע..."
                      className="w-full p-2 border border-gray-200 rounded-lg text-sm outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </div>
                  <div>
                    <label className="text-xs font-bold text-gray-500 block mb-1">מורה</label>
                    <select
                      value={filterScheduleTeacher}
                      onChange={(e) => setFilterScheduleTeacher(e.target.value)}
                      className="w-full p-2 border border-gray-200 rounded-lg text-sm bg-white"
                    >
                      <option value="all">הכל</option>
                      {teachers.map((t) => (
                        <option key={t.id} value={t.id}>{t.name}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="text-xs font-bold text-gray-500 block mb-1">יום</label>
                    <select
                      value={filterScheduleDay}
                      onChange={(e) => setFilterScheduleDay(e.target.value)}
                      className="w-full p-2 border border-gray-200 rounded-lg text-sm bg-white"
                    >
                      <option value="all">הכל</option>
                      {['ראשון', 'שני', 'שלישי', 'רביעי', 'חמישי', 'שישי'].map((d) => (
                        <option key={d} value={d}>{d}</option>
                      ))}
                    </select>
                  </div>
                  <p className="sm:col-span-3 text-xs text-gray-500 font-bold">
                    מציג {filteredSchedulesList.length} מתוך {schedule.length} שיעורים
                  </p>
                </div>
                
                <AnimatePresence initial={false}>
                {showAddScheduleModal && (
                  <motion.div
                    key="add-schedule-form"
                    initial={{ opacity: 0, y: -8, height: 0 }}
                    animate={{ opacity: 1, y: 0, height: 'auto' }}
                    exit={{ opacity: 0, y: -8, height: 0 }}
                    transition={{ duration: MOTION.durationBase, ease: MOTION.easeOut }}
                    className="overflow-hidden"
                  >
                    <div className="bg-gray-100 p-4 sm:p-6 rounded-lg border border-blue-200 space-y-4">
                       <h4 className="font-bold text-gray-900 flex items-center gap-2">הוספת שעת שיעור פרטני</h4>
                       <form onSubmit={handleAddSchedule} className="space-y-4">
                         <div className="grid sm:grid-cols-2 md:grid-cols-4 gap-4">
                           <div>
                              <label className="text-xs font-bold mb-1 block">מורה:</label>
                              <select value={newScheduleTeacher} onChange={e => setNewScheduleTeacher(e.target.value)} required className="w-full p-2 border rounded-lg bg-white">
                                <option value="">-- בחר --</option>
                                {activeTeachers.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
                              </select>
                           </div>
                           <div>
                              <label className="text-xs font-bold mb-1 block">יום בשבוע:</label>
                              <select value={newScheduleDay} onChange={e => setNewScheduleDay(e.target.value)} className="w-full p-2 border rounded-lg bg-white">
                                {['ראשון', 'שני', 'שלישי', 'רביעי', 'חמישי', 'שישי'].map(d => <option key={d}>{d}</option>)}
                              </select>
                           </div>
                           <div>
                              <label className="text-xs font-bold mb-1 block">שעה:</label>
                              <select value={newScheduleHour} onChange={e => setNewScheduleHour(e.target.value)} required className="w-full p-2 border rounded-lg bg-white">
                                {SCHEDULE_HOUR_OPTIONS.map(h => <option key={h} value={h}>{formatHourSlot(h)}</option>)}
                              </select>
                           </div>
                           <div>
                              <label className="text-xs font-bold mb-1 block">מקצוע:</label>
                              <select value={newScheduleSubject} onChange={e => setNewScheduleSubject(e.target.value)} required className="w-full p-2 border rounded-lg bg-white">
                                {scheduleSubjectOptions.map(s => <option key={s} value={s}>{s}</option>)}
                              </select>
                           </div>
                         </div>
                         <div className="flex flex-wrap items-end gap-2">
                           {!showAddSubjectInput ? (
                             <button
                               type="button"
                               onClick={() => setShowAddSubjectInput(true)}
                               className="text-sm font-bold text-blue-700 hover:text-blue-900 underline-offset-2 hover:underline"
                             >
                               + הוסף מקצוע לרשימה
                             </button>
                           ) : (
                             <>
                               <div className="flex-1 w-full sm:min-w-[180px] max-w-xs">
                                 <label className="text-xs font-bold mb-1 block">מקצוע חדש:</label>
                                 <input
                                   type="text"
                                   value={newCustomSubject}
                                   onChange={e => setNewCustomSubject(e.target.value)}
                                   placeholder="לדוגמה: תנ״ך"
                                   className="w-full p-2 border rounded-lg bg-white"
                                 />
                               </div>
                               <button type="button" onClick={() => void handleAddCustomSubject()} className="press py-2 px-4 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-lg text-sm">הוסף</button>
                               <button type="button" onClick={() => { setShowAddSubjectInput(false); setNewCustomSubject(''); }} className="press py-2 px-4 bg-gray-200 hover:bg-gray-300 text-gray-700 font-bold rounded-lg text-sm">ביטול</button>
                             </>
                           )}
                           {(settings.scheduleSubjects || []).length > 0 && (
                             <div className="w-full flex flex-wrap gap-2 pt-1">
                               {(settings.scheduleSubjects || []).map(s => (
                                 <span key={s} className="inline-flex items-center gap-1.5 bg-white border border-gray-200 rounded-full px-3 py-1 text-xs font-bold text-gray-700">
                                   {s}
                                   <button type="button" onClick={() => void handleRemoveCustomSubject(s)} className="text-red-500 hover:text-red-700" title="הסר מהרשימה" aria-label={`הסר ${s}`}>
                                     <X className="w-3.5 h-3.5" />
                                   </button>
                                 </span>
                               ))}
                             </div>
                           )}
                         </div>
                         <div>
                           <label className="text-xs font-bold mb-2 block">סוג שיעור:</label>
                           <div className="grid grid-cols-2 gap-3 max-w-md">
                             <button type="button" onClick={() => { setNewScheduleLessonType('fixed'); setNewScheduleStudentIds([]); }} className={`py-2 px-2 rounded-lg font-bold text-xs sm:text-sm ${newScheduleLessonType === 'fixed' ? 'bg-blue-600 text-white' : 'bg-white border'}`}>קבוע — תלמידים קבועים</button>
                             <button type="button" onClick={() => { setNewScheduleLessonType('flexible'); setNewScheduleStudentIds([]); }} className={`py-2 px-2 rounded-lg font-bold text-xs sm:text-sm ${newScheduleLessonType === 'flexible' ? 'bg-amber-500 text-white' : 'bg-white border'}`}>גמיש — המורה בוחר</button>
                           </div>
                         </div>
                         {newScheduleLessonType === 'fixed' && (
                           <StudentPicker
                             students={students}
                             selectedIds={newScheduleStudentIds}
                             onChange={setNewScheduleStudentIds}
                             label="בחר תלמידים לשיעור הקבוע"
                             maxHeight="max-h-40"
                           />
                         )}
                         {newScheduleLessonType === 'flexible' && (
                           <p className="text-sm text-gray-600 bg-amber-50 border border-amber-200 rounded-lg p-3">בשיעור גמיש המורה יבחר את התלמידים בזמן הדיווח. ניתן לבחור מהר מהפעם הקודמת.</p>
                         )}
                         <div className="flex justify-end gap-2">
                           <button type="submit" className="press py-2.5 px-6 bg-green-600 hover:bg-green-700 text-white font-bold rounded-lg text-sm w-max">שמור</button>
                           <button type="button" onClick={() => setShowAddScheduleModal(false)} className="press py-2.5 px-6 bg-gray-200 hover:bg-gray-300 text-gray-700 font-bold rounded-lg text-sm w-max">בטל</button>
                         </div>
                       </form>
                    </div>
                  </motion.div>
                )}

                </AnimatePresence>
                
                <div className="bg-white rounded-lg border border-gray-200 shadow-sm flex-1 overflow-hidden">
                  <div className="md:hidden divide-y">
                    {filteredSchedulesList.map(s => {
                       const teacher = teachers.find(t => t.id === s.teacherId);
                       return (
                         <div key={s.id} className="p-4 space-y-3">
                           <div className="flex flex-wrap items-center gap-2">
                             <span className="px-2.5 py-1 rounded-lg bg-gray-100 text-gray-800 text-xs font-bold">יום {s.day}</span>
                             <span className="px-2.5 py-1 rounded-lg bg-blue-50 text-blue-800 text-xs font-bold">{formatHourSlot(s.hour)}</span>
                             <span className={`text-xs font-bold px-2 py-0.5 rounded ${s.lessonType === 'flexible' ? 'bg-amber-100 text-amber-800' : 'bg-blue-100 text-blue-800'}`}>
                               {s.lessonType === 'flexible' ? 'גמיש' : 'קבוע'}
                             </span>
                           </div>
                           <div className="min-w-0">
                             <p className="font-bold text-gray-900 break-words">{teacher?.name || 'לא נמצא'}</p>
                             <p className="text-sm text-gray-700 break-words">{getScheduleDisplayLabel(s, students)}</p>
                             <p className="text-xs text-gray-500">{s.subject}</p>
                           </div>
                           <div className="flex flex-wrap gap-2">
                             <button onClick={() => openAdminReport(s, getLessonDateForScheduleInWeek(s, getWeekStartDateStr(new Date())))} className="press px-3 py-1.5 text-xs font-bold text-blue-700 bg-blue-50 hover:bg-blue-100 rounded-lg transition-colors flex items-center gap-1"><ClipboardCheck className="w-3.5 h-3.5"/> דווח</button>
                             <button onClick={() => setScheduleToEdit(s)} className="press px-3 py-1.5 text-xs font-bold text-green-700 bg-green-50 hover:bg-green-100 rounded-lg transition-colors flex items-center gap-1"><Edit3 className="w-3.5 h-3.5"/> ערוך</button>
                             <button onClick={() => handleDeleteSchedule(s.id)} className="press px-3 py-1.5 text-xs font-bold text-red-600 bg-red-50 hover:bg-red-100 rounded-lg transition-colors flex items-center gap-1"><Trash2 className="w-3.5 h-3.5"/> מחק</button>
                           </div>
                         </div>
                       );
                    })}
                  </div>
                  <div className="hidden md:block overflow-x-auto">
                    <table className="w-full text-right border-collapse">
                      <thead>
                        <tr className="bg-gray-50 border-b text-xs text-gray-500 uppercase"><th className="px-4 py-3">יום</th><th className="px-4 py-3">שעה</th><th className="px-4 py-3">מורה</th><th className="px-4 py-3">סוג</th><th className="px-4 py-3">תלמידים</th><th className="px-4 py-3">מקצוע</th><th className="px-4 py-3 text-center">פעולות</th></tr>
                      </thead>
                      <tbody className="divide-y text-sm">
                        {filteredSchedulesList.map(s => {
                           const teacher = teachers.find(t => t.id === s.teacherId);
                           return (
                             <tr key={s.id} className="hover:bg-blue-50/30 transition-colors">
                               <td className="px-4 py-3 font-bold text-gray-700">{s.day}</td>
                               <td className="px-4 py-3 text-xs font-bold text-blue-800">{formatHourSlot(s.hour)}</td>
                               <td className="px-4 py-3 font-bold">{teacher?.name || 'לא נמצא'}</td>
                               <td className="px-4 py-3">
                                 <span className={`text-xs font-bold px-2 py-0.5 rounded ${s.lessonType === 'flexible' ? 'bg-amber-100 text-amber-800' : 'bg-blue-100 text-blue-800'}`}>
                                   {s.lessonType === 'flexible' ? 'גמיש' : 'קבוע'}
                                 </span>
                               </td>
                               <td className="px-4 py-3 text-gray-800">{getScheduleDisplayLabel(s, students)}</td>
                               <td className="px-4 py-3">{s.subject}</td>
                               <td className="px-4 py-3">
                                  <div className="flex gap-1.5 justify-center flex-wrap">
                                    <button onClick={() => openAdminReport(s, getLessonDateForScheduleInWeek(s, getWeekStartDateStr(new Date())))} className="press px-2 py-1 text-xs font-bold text-blue-700 bg-blue-50 hover:bg-blue-100 rounded-lg flex items-center gap-1"><ClipboardCheck className="w-3.5 h-3.5"/> דווח</button>
                                    <button onClick={() => setScheduleToEdit(s)} className="press px-2 py-1 text-xs font-bold text-green-700 bg-green-50 hover:bg-green-100 rounded-lg flex items-center gap-1"><Edit3 className="w-3.5 h-3.5"/> ערוך</button>
                                    <button onClick={() => handleDeleteSchedule(s.id)} className="press px-2 py-1 text-xs font-bold text-red-600 bg-red-50 hover:bg-red-100 rounded-lg flex items-center gap-1"><Trash2 className="w-3.5 h-3.5"/> מחק</button>
                                  </div>
                               </td>
                             </tr>
                           )
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
              </motion.div>
            )}

            {/* TAB: TIMETABLE */}
            {adminTab === 'timetable' && (
              <motion.div
                key="admin-timetable"
                variants={tabVariants}
                initial="initial"
                animate="enter"
                exit="exit"
                transition={tabTransition}
                className="bg-white rounded-lg border border-gray-200 shadow-sm p-3 sm:p-4"
              >
                <div className="flex flex-col gap-3 mb-4">
                  <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
                    <h3 className="font-bold text-lg text-gray-800">מעקב דיווחים שבועי</h3>
                    <button type="button" onClick={() => setAdminTab('schedule')} className="press text-sm font-bold text-blue-700 hover:text-blue-900 self-start">
                      לעריכת שיבוץ ←
                    </button>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <button onClick={() => setTimetableWeekStart((prev) => new Date(addDaysToDateStr(getWeekStartDateStr(prev), -7) + 'T12:00:00'))} className="press px-3 py-1.5 bg-gray-100 hover:bg-gray-200 rounded font-bold text-sm transition-colors">שבוע קודם</button>
                    <span className="font-bold text-gray-800 bg-blue-50 px-3 py-1.5 rounded border border-blue-100 text-sm">{formatWeekRangeLabel(getWeekStartDateStr(timetableWeekStart))}</span>
                    <button onClick={() => setTimetableWeekStart((prev) => new Date(addDaysToDateStr(getWeekStartDateStr(prev), 7) + 'T12:00:00'))} className="press px-3 py-1.5 bg-gray-100 hover:bg-gray-200 rounded font-bold text-sm transition-colors">שבוע הבא</button>
                    <button onClick={() => setTimetableWeekStart(new Date(getWeekStartDateStr(new Date()) + 'T12:00:00'))} className="press px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded font-bold text-sm shadow-sm transition-colors">השבוע הנוכחי</button>
                  </div>
                </div>

                {/* Mobile: day-by-day (no horizontal scroll) */}
                <div className="md:hidden space-y-3">
                  <div className="grid grid-cols-3 gap-1.5">
                    {(['ראשון', 'שני', 'שלישי', 'רביעי', 'חמישי', 'שישי'] as const).map((day, idx) => {
                      const headerDateStr = addDaysToDateStr(getWeekStartDateStr(timetableWeekStart), idx);
                      const isActive = timetableMobileDay === day;
                      return (
                        <button
                          key={day}
                          type="button"
                          onClick={() => setTimetableMobileDay(day)}
                          className={`press rounded-lg border px-2 py-2 text-center transition-colors ${
                            isActive
                              ? 'bg-blue-600 text-white border-blue-600'
                              : 'bg-gray-50 text-gray-700 border-gray-200 hover:bg-gray-100'
                          }`}
                        >
                          <div className="text-xs font-bold">{day}</div>
                          <div className={`text-[10px] mt-0.5 ${isActive ? 'text-blue-100' : 'text-gray-500'}`}>{formatHebrewDateShort(headerDateStr)}</div>
                        </button>
                      );
                    })}
                  </div>
                  {(() => {
                    const dayIdx = ['ראשון', 'שני', 'שלישי', 'רביעי', 'חמישי', 'שישי'].indexOf(timetableMobileDay);
                    const weekStartStr = getWeekStartDateStr(timetableWeekStart);
                    const cellDateStr = addDaysToDateStr(weekStartStr, dayIdx);
                    return (
                      <div className="space-y-2">
                        {SCHEDULE_HOUR_OPTIONS.map(hourNum => {
                          const hourStr = hourNum;
                          const classSchedules = schedule.filter(s => s.day === timetableMobileDay && s.hour === hourStr);
                          if (classSchedules.length === 0) return null;
                          return (
                            <div key={hourStr} className="border rounded-lg overflow-hidden">
                              <div className="bg-gray-100 px-3 py-1.5 text-xs font-bold text-gray-600">שעה {hourStr}</div>
                              <div className="p-2 space-y-2">
                                {classSchedules.map(s => {
                                  const teacher = teachers.find(t => t.id === s.teacherId);
                                  const weeklyReport = findReportForScheduleWeek(reports, s, weekStartStr);
                                  const holiday = findHolidayForDate(cellDateStr, holidays);
                                  let statusBadge = <span className="inline-flex items-center gap-1 text-[10px] bg-gray-100 text-gray-500 px-1.5 py-0.5 rounded">לא דווח</span>;
                                  if (holiday) {
                                    statusBadge = <span className="inline-flex items-center gap-1 text-[10px] bg-amber-100 text-amber-900 px-1.5 py-0.5 rounded">חופשה{holiday.name ? ` — ${holiday.name}` : ''}</span>;
                                  } else if (weeklyReport) {
                                    if (weeklyReport.status === 'completed') {
                                      statusBadge = <span className="inline-flex items-center gap-1 text-[10px] bg-green-100 text-green-800 px-1.5 py-0.5 rounded"><CheckCircle className="w-3 h-3 shrink-0"/> בוצע</span>;
                                    } else {
                                      statusBadge = <span className="inline-flex items-center gap-1 text-[10px] bg-red-100 text-red-800 px-1.5 py-0.5 rounded"><XCircle className="w-3 h-3 shrink-0"/> בוטל</span>;
                                    }
                                  }
                                  return (
                                    <div key={s.id} className={`text-sm border rounded-lg p-2.5 ${holiday ? 'bg-amber-50 border-amber-200' : weeklyReport ? (weeklyReport.status === 'completed' ? 'bg-green-50 border-green-200' : 'bg-red-50 border-red-200') : 'bg-gray-50 border-gray-200'}`}>
                                      <div className="font-bold text-blue-800 break-words">{teacher?.name || 'לא ידוע'}</div>
                                      <div className="text-gray-700 font-semibold text-xs break-words">{getScheduleDisplayLabel(s, students)}</div>
                                      <div className="text-gray-500 text-xs">{s.subject}</div>
                                      <div className="mt-2 flex justify-between items-center gap-2">
                                        {statusBadge}
                                        {!weeklyReport && !holiday && (
                                          <button onClick={() => openAdminReport(s, cellDateStr)} className="press text-blue-600 hover:bg-blue-100 px-2 py-1 rounded transition text-xs font-bold flex items-center gap-1" title="דווח שיעור עבור תאריך זה"><ClipboardCheck className="w-3.5 h-3.5"/> דווח</button>
                                        )}
                                      </div>
                                    </div>
                                  );
                                })}
                              </div>
                            </div>
                          );
                        })}
                        {schedule.filter(s => s.day === timetableMobileDay).length === 0 && (
                          <p className="text-center text-gray-400 text-sm py-8">אין שיעורים ביום זה</p>
                        )}
                      </div>
                    );
                  })()}
                </div>

                {/* Desktop: full week grid */}
                <div className="hidden md:block overflow-x-auto">
                  <div className="min-w-[800px]">
                    <table className="w-full text-right border-collapse">
                      <thead>
                        <tr>
                          <th className="border p-2 bg-gray-100 text-center w-20">שעה \ יום</th>
                          {['ראשון', 'שני', 'שלישי', 'רביעי', 'חמישי', 'שישי'].map((day, idx) => {
                            const headerDateStr = addDaysToDateStr(getWeekStartDateStr(timetableWeekStart), idx);
                            return (
                              <th key={day} className="border p-2 bg-gray-100 text-center min-w-[120px]">
                                {day}<br/><span className="text-xs font-normal text-gray-500">{formatHebrewDateShort(headerDateStr)}</span>
                              </th>
                            );
                          })}
                        </tr>
                      </thead>
                      <tbody>
                        {SCHEDULE_HOUR_OPTIONS.map(hourNum => {
                          const hourStr = hourNum;
                          return (
                            <tr key={hourStr}>
                              <td className="border p-2 font-bold text-center bg-gray-50">{hourStr}</td>
                              {['ראשון', 'שני', 'שלישי', 'רביעי', 'חמישי', 'שישי'].map((day, idx) => {
                                const weekStartStr = getWeekStartDateStr(timetableWeekStart);
                                const cellDateStr = addDaysToDateStr(weekStartStr, idx);
                                
                                const classSchedules = schedule.filter(s => s.day === day && s.hour === hourStr);
                                return (
                                  <td key={day} className="border p-2 min-h-[80px] align-top bg-white">
                                    <div className="flex flex-col gap-2">
                                      {classSchedules.map(s => {
                                        const teacher = teachers.find(t => t.id === s.teacherId);
                                        const weeklyReport = findReportForScheduleWeek(reports, s, weekStartStr);
                                        const holiday = findHolidayForDate(cellDateStr, holidays);

                                        let statusBadge = <span className="inline-flex items-center gap-1 text-[10px] bg-gray-100 text-gray-500 px-1 py-0.5 rounded break-all">לא דווח</span>;
                                        if (holiday) {
                                          statusBadge = <span className="inline-flex items-center gap-1 text-[10px] bg-amber-100 text-amber-900 px-1 py-0.5 rounded break-all">חופשה{holiday.name ? ` — ${holiday.name}` : ''}</span>;
                                        } else if (weeklyReport) {
                                          if (weeklyReport.status === 'completed') {
                                            statusBadge = <span className="inline-flex items-center gap-1 text-[10px] bg-green-100 text-green-800 px-1 py-0.5 rounded break-all"><CheckCircle className="w-3 h-3 shrink-0"/> בוצע</span>;
                                          } else {
                                            statusBadge = <span className="inline-flex items-center gap-1 text-[10px] bg-red-100 text-red-800 px-1 py-0.5 rounded break-all"><XCircle className="w-3 h-3 shrink-0"/> בוטל</span>;
                                          }
                                        }

                                        return (
                                          <div key={s.id} className={`text-xs border rounded p-1.5 shadow-sm ${holiday ? 'bg-amber-50 border-amber-200' : weeklyReport ? (weeklyReport.status === 'completed' ? 'bg-green-50 border-green-200' : 'bg-red-50 border-red-200') : 'bg-gray-50 border-gray-200'}`}>
                                            <div className="font-bold text-blue-800">{teacher?.name || 'לא ידוע'}</div>
                                            <div className="text-gray-700 font-semibold">{getScheduleDisplayLabel(s, students)}</div>
                                            <div className="text-gray-500">{s.subject}</div>
                                            <div className="mt-1 flex justify-between items-center">
                                              {statusBadge}
                                              {!weeklyReport && !holiday && (
                                                <button onClick={() => openAdminReport(s, cellDateStr)} className="press text-blue-600 hover:bg-blue-100 px-1.5 py-1 rounded transition text-xs font-bold flex items-center gap-1" title="דווח שיעור"><ClipboardCheck className="w-3.5 h-3.5"/><span className="hidden xl:inline">דווח</span></button>
                                              )}
                                            </div>
                                          </div>
                                        );
                                      })}
                                    </div>
                                  </td>
                                );
                              })}
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
              </motion.div>
            )}

            {/* TAB: REPORTS */}
            {adminTab === 'reports' && (
              <motion.div
                key="admin-reports"
                variants={tabVariants}
                initial="initial"
                animate="enter"
                exit="exit"
                transition={tabTransition}
                className="space-y-6"
              >
                <div className="bg-white p-4 sm:p-5 rounded-xl shadow-sm border border-gray-100">
                    <h4 className="font-bold text-gray-900 text-sm mb-4">סנן דיווחי שיעור</h4>
                    <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3">
                       <div><label className="text-xs font-bold block mb-1">מורה:</label><select className="w-full p-2 border rounded-lg bg-gray-50" value={filterTeacher} onChange={e => setFilterTeacher(e.target.value)}><option value="all">הכל</option>{teachers.map(t=><option key={t.id} value={t.id}>{t.name}</option>)}</select></div>
                       <div><label className="text-xs font-bold block mb-1">סטטוס:</label><select className="w-full p-2 border rounded-lg bg-gray-50" value={filterStatus} onChange={e => setFilterStatus(e.target.value)}><option value="all">הכל</option><option value="completed">התקיים</option><option value="missed">בוטל</option></select></div>
                       <div><label className="text-xs font-bold block mb-1">מתאריך:</label><input type="date" className="w-full p-2 border rounded-lg bg-gray-50" value={filterReportDateFrom} onChange={e => setFilterReportDateFrom(e.target.value)} dir="ltr" /></div>
                       <div><label className="text-xs font-bold block mb-1">עד תאריך:</label><input type="date" className="w-full p-2 border rounded-lg bg-gray-50" value={filterReportDateTo} onChange={e => setFilterReportDateTo(e.target.value)} dir="ltr" /></div>
                       <div className="sm:col-span-2 lg:col-span-1"><label className="text-xs font-bold block mb-1">חיפוש:</label><input className="w-full p-2 border rounded-lg outline-none focus:ring-2 focus:ring-blue-500" value={searchStudent} onChange={e=>setSearchStudent(e.target.value)} placeholder="תלמיד, מקצוע..." /></div>
                    </div>
                </div>

                <div className="bg-white rounded-lg border border-gray-200 shadow-sm flex-1 overflow-hidden">
                  <div className="p-4 sm:p-5 border-b bg-gray-50 flex flex-col sm:flex-row sm:justify-between gap-3">
                     <span className="font-bold text-sm">נמצאו {filteredReportsList.length} דיווחים</span>
                     <div className="flex flex-wrap gap-2"><button onClick={() => window.print()} className="text-xs font-bold flex items-center gap-1 bg-gray-800 text-white rounded-full px-3 py-1.5 hidden sm:flex"><Download className="w-3 h-3"/> הדפס (PDF)</button><button onClick={handleExportReports} className="text-xs font-bold flex items-center gap-1 bg-green-600 text-white rounded-full px-3 py-1.5"><Download className="w-3 h-3"/> ייצוא לאקסל</button></div>
                  </div>
                  <div className="md:hidden divide-y">
                    {filteredReportsList.map(rep => {
                       const sched = schedule.find(s => s.id === rep.scheduleId);
                       const teach = teachers.find(t => t.id === rep.teacherId);
                       return (
                         <div key={rep.id} className="p-4 space-y-2">
                           <div className="flex items-start justify-between gap-2">
                             <div className="min-w-0">
                               <p className="font-bold text-gray-900 break-words">{teach?.name || '-'}</p>
                               <p className="text-sm text-gray-700 break-words">{sched ? getReportAttendedLabel(rep, sched, students) || getScheduleDisplayLabel(sched, students) : 'נמחק'}</p>
                               <p className="text-xs text-gray-500">{formatHebrewDateShort(rep.date)} · {sched?.subject || '-'}</p>
                             </div>
                             <div className="flex items-center gap-2 shrink-0">
                               <span className={`px-2 py-1 rounded text-xs font-bold ${rep.status==='completed' ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>{rep.status==='completed' ? 'התקיים' : 'בוטל'}</span>
                               <button onClick={() => openAdminEditReport(rep)} className="press px-2 py-1.5 text-xs font-bold text-blue-700 bg-blue-50 hover:bg-blue-100 rounded-lg"><Edit3 className="w-3.5 h-3.5"/></button>
                               <button onClick={() => handleDeleteReport(rep.id)} className="press p-1.5 text-red-500 hover:bg-red-50 rounded transition-colors"><Trash2 className="w-4 h-4"/></button>
                             </div>
                           </div>
                           {rep.text && (
                             <p className="text-sm text-gray-600 italic bg-gray-50 border rounded p-2 break-words">"{rep.text}"</p>
                           )}
                         </div>
                       );
                    })}
                  </div>
                  <div className="hidden md:block overflow-x-auto">
                    <table className="w-full text-right border-collapse">
                      <thead>
                        <tr className="bg-gray-50 text-xs font-bold text-gray-500 border-b">
                          <th className="px-4 py-3">תאריך</th><th className="px-4 py-3">מורה</th><th className="px-4 py-3">תלמיד</th><th className="px-4 py-3">מקצוע</th><th className="px-4 py-3">סטטוס</th><th className="px-4 py-3">פירוט</th><th className="px-4 py-3 text-center">פעולות</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y text-sm">
                        {filteredReportsList.map(rep => {
                           const sched = schedule.find(s => s.id === rep.scheduleId);
                           const teach = teachers.find(t => t.id === rep.teacherId);
                           return (
                             <tr key={rep.id} className="hover:bg-blue-50/30 transition-colors">
                               <td className="px-4 py-3">{formatHebrewDateShort(rep.date)}</td>
                               <td className="px-4 py-3 font-bold">{teach?.name || '-'}</td>
                               <td className="px-4 py-3">{sched ? getReportAttendedLabel(rep, sched, students) || getScheduleDisplayLabel(sched, students) : 'נמחק'}</td>
                               <td className="px-4 py-3">{sched?.subject || '-'}</td>
                               <td className="px-4 py-3"><span className={`px-2 py-1 rounded text-xs font-bold ${rep.status==='completed' ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>{rep.status==='completed' ? 'התקיים' : 'בוטל'}</span></td>
                               <td className="px-4 py-3 italic max-w-xs">{rep.text}</td>
                               <td className="px-4 py-3">
                                 <div className="flex items-center justify-center gap-1.5">
                                   <button onClick={() => openAdminEditReport(rep)} className="press px-2 py-1 text-xs font-bold text-blue-700 bg-blue-50 hover:bg-blue-100 rounded-lg flex items-center gap-1"><Edit3 className="w-3.5 h-3.5"/> ערוך</button>
                                   <button onClick={() => handleDeleteReport(rep.id)} className="press px-2 py-1 text-xs font-bold text-red-600 bg-red-50 hover:bg-red-100 rounded-lg flex items-center gap-1"><Trash2 className="w-3.5 h-3.5"/> מחק</button>
                                 </div>
                               </td>
                             </tr>
                           )
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
              </motion.div>
            )}

            {/* TAB: OVERVIEW */}
            {adminTab === 'overview' && (
              <motion.div
                key="admin-overview"
                variants={tabVariants}
                initial="initial"
                animate="enter"
                exit="exit"
                transition={tabTransition}
                className="space-y-6"
              >
                {missingThisWeekCount > 0 && (
                  <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                    <div>
                      <p className="font-bold text-amber-950 text-sm sm:text-base">
                        יש {missingThisWeekCount} שיעורים שלא דווחו השבוע
                      </p>
                      <p className="text-xs text-amber-800/80 mt-0.5">עבור ללוח השבועי כדי לדווח או לעקוב אחרי מורים</p>
                    </div>
                    <button
                      type="button"
                      onClick={() => setAdminTab('timetable')}
                      className="press px-4 py-2.5 rounded-xl text-sm font-bold bg-amber-500 hover:bg-amber-600 text-[#111827] shrink-0"
                    >
                      פתח לוח שבועי
                    </button>
                  </div>
                )}

                {/* Period selector */}
                <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-4 space-y-3">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div className="flex items-center gap-2 font-bold text-gray-700">
                      <Calendar className="w-4 h-4 text-indigo-600" />
                      תקופת ניתוח
                    </div>
                    <div className="text-xs text-gray-500 font-mono" dir="ltr">
                      {formatRangeLabel(statsRange.startStr, statsRange.endStr)}
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {([
                      { id: '7d', label: '7 ימים' },
                      { id: '30d', label: '30 ימים' },
                      { id: '90d', label: '90 ימים' },
                      { id: 'year', label: 'שנת לימודים' },
                    ] as { id: StatsPeriodPreset; label: string }[]).map((p) => {
                      const isActive = statsPeriod.type === 'preset' && statsPeriod.preset === p.id;
                      return (
                        <button
                          key={p.id}
                          onClick={() => setStatsPeriod({ type: 'preset', preset: p.id })}
                          className={`press px-3 py-1.5 text-sm font-bold rounded transition-colors ${
                            isActive
                              ? 'bg-indigo-600 text-white'
                              : 'bg-gray-100 hover:bg-gray-200 text-gray-700'
                          }`}
                        >
                          {p.label}
                        </button>
                      );
                    })}
                    <button
                      onClick={() =>
                        setStatsPeriod({
                          type: 'custom',
                          start: statsRange.startStr,
                          end: statsRange.endStr,
                        })
                      }
                      className={`press px-3 py-1.5 text-sm font-bold rounded transition-colors ${
                        statsPeriod.type === 'custom'
                          ? 'bg-indigo-600 text-white'
                          : 'bg-gray-100 hover:bg-gray-200 text-gray-700'
                      }`}
                    >
                      מותאם אישית
                    </button>
                  </div>
                  {statsPeriod.type === 'custom' && (
                    <div className="flex flex-wrap items-end gap-3 pt-2 border-t">
                      <label className="text-sm">
                        <span className="block text-xs font-bold text-gray-500 mb-1">מתאריך</span>
                        <input
                          type="date"
                          value={statsPeriod.start}
                          max={statsPeriod.end}
                          onChange={(e) =>
                            setStatsPeriod({ ...statsPeriod, start: e.target.value })
                          }
                          className="border rounded p-1.5 text-sm focus:ring-2 focus:ring-indigo-500 outline-none"
                          dir="ltr"
                        />
                      </label>
                      <label className="text-sm">
                        <span className="block text-xs font-bold text-gray-500 mb-1">עד תאריך</span>
                        <input
                          type="date"
                          value={statsPeriod.end}
                          min={statsPeriod.start}
                          onChange={(e) => setStatsPeriod({ ...statsPeriod, end: e.target.value })}
                          className="border rounded p-1.5 text-sm focus:ring-2 focus:ring-indigo-500 outline-none"
                          dir="ltr"
                        />
                      </label>
                    </div>
                  )}
                  <div className="text-xs text-gray-400 pt-1 space-y-1">
                    <p>
                      מערכת נוכחית: <span className="font-bold text-gray-600">{totalClassesPlanned}</span> שיעורים שבועיים • <span className="font-bold text-gray-600">{activeTeachersCount}</span> מורים פעילים
                    </p>
                    <p>
                      הסטטיסטיקה מבוססת על מערכת השעות הנוכחית בלבד. נספרים רק שיעורים שכבר היו אמורים להתקיים (עד היום), ודיווח נספר רק כשהוזן לתאריך הנכון של השיעור.
                    </p>
                  </div>
                </div>

                {/* Period stat cards */}
                <motion.div
                  className="grid grid-cols-2 md:grid-cols-4 gap-3 sm:gap-4"
                  variants={cardListVariants}
                  initial="initial"
                  animate="enter"
                >
                  {(() => {
                    const pct = periodTotals.compliancePct;
                    const pctColor =
                      pct >= 85 ? 'text-green-600' : pct >= 70 ? 'text-amber-600' : 'text-red-600';
                    return [
                      {
                        label: 'שיעורים שהיו אמורים להתקיים',
                        value: periodTotals.expected.toLocaleString('he-IL'),
                        color: 'text-[#111827]',
                        sub: 'עד היום, לפי מערכת השעות הנוכחית',
                      },
                      {
                        label: 'שיעורים שדווחו',
                        value: periodTotals.reported.toLocaleString('he-IL'),
                        color: 'text-indigo-700',
                        sub: `${periodTotals.completed.toLocaleString('he-IL')} התקיימו • ${periodTotals.missed.toLocaleString('he-IL')} בוטלו`,
                      },
                      {
                        label: 'חסר דיווח',
                        value: periodTotals.unreported.toLocaleString('he-IL'),
                        color: 'text-red-600',
                        sub: periodTotals.expected > 0
                          ? `${Math.round((periodTotals.unreported / periodTotals.expected) * 100)}% מהצפי`
                          : null,
                      },
                      {
                        label: '% היענות',
                        value: `${pct}%`,
                        color: pctColor,
                        sub: pct >= 85 ? 'מעולה' : pct >= 70 ? 'סביר' : 'בעייתי',
                      },
                    ];
                  })().map((stat) => (
                    <motion.div
                      key={stat.label}
                      variants={cardItemVariants}
                      transition={{ duration: MOTION.durationBase, ease: MOTION.easeOut }}
                      className="bg-white p-3 sm:p-5 rounded border transition-shadow hover:shadow-md"
                    >
                      <span className="text-gray-400 text-[10px] sm:text-xs font-bold leading-tight block">{stat.label}</span>
                      <h3 className={`text-2xl sm:text-3xl font-bold ${stat.color}`}>{stat.value}</h3>
                      {stat.sub && (
                        <p className="text-[10px] sm:text-xs text-gray-500 mt-1 break-words">{stat.sub}</p>
                      )}
                    </motion.div>
                  ))}
                </motion.div>

                {/* Teacher leaderboard */}
                <div className="bg-white rounded border overflow-hidden">
                  <div className="flex flex-wrap justify-between items-center gap-2 p-3 sm:p-4 border-b">
                    <div className="flex flex-wrap items-center gap-2 min-w-0">
                      <TrendingDown className="w-4 h-4 text-red-600 shrink-0" />
                      <span className="font-bold">לידרבורד מורים</span>
                      <span className="text-xs text-gray-400">({teacherComplianceSorted.length})</span>
                    </div>
                    <button
                      onClick={exportTeacherComplianceCsv}
                      className="press flex items-center gap-1.5 px-3 py-1.5 text-xs bg-gray-100 hover:bg-gray-200 rounded font-bold transition-colors"
                    >
                      <Download className="w-3.5 h-3.5" /> יצוא CSV
                    </button>
                  </div>
                  {/* Mobile leaderboard cards */}
                  <div className="md:hidden divide-y max-h-[480px] overflow-y-auto">
                    {teacherComplianceSorted.length === 0 && (
                      <div className="text-center text-gray-400 p-6 text-sm">אין נתונים בתקופה זו</div>
                    )}
                    {teacherComplianceSorted.map((tc) => {
                      const pct = tc.compliancePct;
                      const barColor =
                        pct >= 85 ? '#16a34a' : pct >= 70 ? '#d97706' : '#dc2626';
                      return (
                        <div
                          key={tc.teacher.id}
                          className={`p-3 space-y-2 ${!tc.teacher.active ? 'opacity-50' : ''}`}
                        >
                          <div className="flex items-start justify-between gap-2">
                            <div className="min-w-0">
                              <button
                                type="button"
                                onClick={() => { setFilterTeacher(tc.teacher.id); setAdminTab('reports'); }}
                                className="font-bold text-gray-900 break-words text-right hover:text-blue-700"
                              >
                                {tc.teacher.name}
                                {!tc.teacher.active && (
                                  <span className="mr-2 text-xs bg-gray-200 text-gray-600 px-1.5 py-0.5 rounded">
                                    לא פעיל
                                  </span>
                                )}
                              </button>
                              <div className="text-xs text-gray-400 break-all" dir="ltr">{tc.teacher.email}</div>
                            </div>
                            <span
                              className="font-bold text-sm tabular-nums shrink-0"
                              style={{ color: barColor }}
                            >
                              {pct}%
                            </span>
                          </div>
                          <div className="h-2 bg-gray-100 rounded overflow-hidden" dir="ltr">
                            <div
                              className="h-full rounded transition-[width]"
                              style={{ width: `${pct}%`, backgroundColor: barColor }}
                            />
                          </div>
                          <div className="flex justify-between text-xs text-gray-500 font-mono">
                            <span>צפויים {tc.expected}</span>
                            <span className="text-indigo-700">דווחו {tc.reported}</span>
                            <span className="text-red-600 font-bold">חסר {tc.unreported}</span>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                  {/* Desktop table */}
                  <div className="hidden md:block overflow-x-auto max-h-[480px] overflow-y-auto">
                    <table className="w-full text-sm">
                      <thead className="bg-gray-50 text-gray-500 text-xs uppercase sticky top-0">
                        <tr>
                          <th className="text-right p-3 font-bold">
                            <button type="button" onClick={() => toggleLeaderboardSort('name')} className="press inline-flex items-center hover:text-gray-800 transition-colors">
                              {leaderboardSortIndicator('name')}מורה
                            </button>
                          </th>
                          <th className="text-center p-3 font-bold">
                            <button type="button" onClick={() => toggleLeaderboardSort('expected')} className="press inline-flex items-center hover:text-gray-800 transition-colors">
                              {leaderboardSortIndicator('expected')}צפויים
                            </button>
                          </th>
                          <th className="text-center p-3 font-bold">
                            <button type="button" onClick={() => toggleLeaderboardSort('reported')} className="press inline-flex items-center hover:text-gray-800 transition-colors">
                              {leaderboardSortIndicator('reported')}דווחו
                            </button>
                          </th>
                          <th className="text-center p-3 font-bold">
                            <button type="button" onClick={() => toggleLeaderboardSort('unreported')} className="press inline-flex items-center hover:text-gray-800 transition-colors">
                              {leaderboardSortIndicator('unreported')}חסר
                            </button>
                          </th>
                          <th className="text-right p-3 font-bold w-1/3">
                            <button type="button" onClick={() => toggleLeaderboardSort('compliancePct')} className="press inline-flex items-center hover:text-gray-800 transition-colors">
                              {leaderboardSortIndicator('compliancePct')}% היענות
                            </button>
                          </th>
                        </tr>
                      </thead>
                      <tbody>
                        {teacherComplianceSorted.length === 0 && (
                          <tr>
                            <td colSpan={5} className="text-center text-gray-400 p-6">
                              אין נתונים בתקופה זו
                            </td>
                          </tr>
                        )}
                        {teacherComplianceSorted.map((tc) => {
                          const pct = tc.compliancePct;
                          const barColor =
                            pct >= 85 ? '#16a34a' : pct >= 70 ? '#d97706' : '#dc2626';
                          return (
                            <tr
                              key={tc.teacher.id}
                              className={`border-t hover:bg-gray-50 transition-colors ${
                                !tc.teacher.active ? 'opacity-50' : ''
                              }`}
                            >
                              <td className="p-3">
                                <button
                                  type="button"
                                  onClick={() => { setFilterTeacher(tc.teacher.id); setAdminTab('reports'); }}
                                  className="font-bold text-gray-900 hover:text-blue-700 text-right"
                                >
                                  {tc.teacher.name}
                                  {!tc.teacher.active && (
                                    <span className="mr-2 text-xs bg-gray-200 text-gray-600 px-1.5 py-0.5 rounded">
                                      לא פעיל
                                    </span>
                                  )}
                                </button>
                                <div className="text-xs text-gray-400" dir="ltr">{tc.teacher.email}</div>
                              </td>
                              <td className="text-center p-3 font-mono text-sm text-gray-600">
                                {tc.expected}
                              </td>
                              <td className="text-center p-3 font-mono text-sm text-indigo-700">
                                {tc.reported}
                              </td>
                              <td className="text-center p-3 font-mono text-sm text-red-600 font-bold">
                                {tc.unreported}
                              </td>
                              <td className="p-3">
                                <div className="flex items-center gap-2">
                                  <div className="flex-1 h-2 bg-gray-100 rounded overflow-hidden" dir="ltr">
                                    <div
                                      className="h-full rounded transition-[width]"
                                      style={{
                                        width: `${pct}%`,
                                        backgroundColor: barColor,
                                      }}
                                    />
                                  </div>
                                  <span
                                    className="font-bold text-sm w-12 text-left tabular-nums"
                                    style={{ color: barColor }}
                                  >
                                    {pct}%
                                  </span>
                                </div>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>

                {/* Weekly trend chart */}
                <div className="bg-white rounded border p-4">
                  <div className="font-bold mb-1 flex items-center gap-2">
                    <TrendingUp className="w-4 h-4 text-indigo-600" />
                    דיווחים שבועיים לאורך זמן
                  </div>
                  <p className="text-xs text-gray-500 mb-4">
                    האזור האפור הוא הצפי השבועי, הקו הכחול הוא הדיווחים שהוזנו בפועל. שבועות שבהם הקו הכחול צונח חזק מתחת לאפור = שבועות בעייתיים.
                  </p>
                  {weeklyTrend.length === 0 ? (
                    <div className="text-center text-gray-400 py-8 text-sm">
                      אין מספיק נתונים בתקופה הזו להצגת מגמה.
                    </div>
                  ) : (
                    <div dir="ltr">
                      <ResponsiveContainer width="100%" height={220}>
                        <AreaChart
                          data={weeklyTrend.map((w) => ({
                            label: `${w.weekStart.slice(8)}/${w.weekStart.slice(5, 7)}`,
                            weekStart: w.weekStart,
                            weekEnd: w.weekEnd,
                            expected: w.expected,
                            reported: w.reported,
                          }))}
                          margin={{ top: 8, right: 8, left: 0, bottom: 0 }}
                        >
                          <defs>
                            <linearGradient id="grad-expected" x1="0" y1="0" x2="0" y2="1">
                              <stop offset="0%" stopColor="#9ca3af" stopOpacity={0.4} />
                              <stop offset="100%" stopColor="#9ca3af" stopOpacity={0.05} />
                            </linearGradient>
                            <linearGradient id="grad-reported" x1="0" y1="0" x2="0" y2="1">
                              <stop offset="0%" stopColor="#4f46e5" stopOpacity={0.55} />
                              <stop offset="100%" stopColor="#4f46e5" stopOpacity={0.05} />
                            </linearGradient>
                          </defs>
                          <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                          <XAxis
                            dataKey="label"
                            tick={{ fill: '#6b7280', fontSize: 11 }}
                            reversed
                          />
                          <YAxis
                            allowDecimals={false}
                            tick={{ fill: '#6b7280', fontSize: 11 }}
                            orientation="right"
                          />
                          <Tooltip
                            cursor={{ stroke: '#a5b4fc', strokeWidth: 1 }}
                            contentStyle={{
                              direction: 'rtl',
                              borderRadius: 6,
                              border: '1px solid #e5e7eb',
                              fontSize: 12,
                            }}
                            labelFormatter={(_, payload) => {
                              const p = payload?.[0]?.payload as
                                | { weekStart: string; weekEnd: string }
                                | undefined;
                              if (!p) return '';
                              return `שבוע ${formatRangeLabel(p.weekStart, p.weekEnd)}`;
                            }}
                            formatter={(value: number, name: string) => {
                              const label = name === 'expected' ? 'צפויים' : 'דווחו';
                              return [value, label];
                            }}
                          />
                          <Legend
                            verticalAlign="top"
                            height={28}
                            formatter={(value: string) =>
                              value === 'expected' ? 'צפויים' : 'דווחו'
                            }
                          />
                          <Area
                            type="monotone"
                            dataKey="expected"
                            stroke="#9ca3af"
                            fill="url(#grad-expected)"
                            strokeWidth={2}
                          />
                          <Area
                            type="monotone"
                            dataKey="reported"
                            stroke="#4f46e5"
                            fill="url(#grad-reported)"
                            strokeWidth={2}
                          />
                        </AreaChart>
                      </ResponsiveContainer>
                    </div>
                  )}
                </div>

                {/* Day-of-week chart */}
                <div className="bg-white rounded border p-4">
                  <div className="font-bold mb-1 flex items-center gap-2">
                    <AlertCircle className="w-4 h-4 text-amber-600" />
                    השמטות לפי יום בשבוע
                  </div>
                  <p className="text-xs text-gray-500 mb-4">
                    כל עמודה מציגה את סך השיעורים הצפויים ביום זה בתקופה. החלק הכחול = דווחו. החלק האדום בראש = לא דווחו. ככל שהחלק האדום גדול יותר, כך היום בעייתי יותר.
                  </p>
                  {dayOfWeekStats.every((d) => d.expected === 0) ? (
                    <div className="text-center text-gray-400 py-8 text-sm">
                      אין שיעורים בתקופה זו.
                    </div>
                  ) : (
                    <div dir="ltr">
                      <ResponsiveContainer width="100%" height={220}>
                        <BarChart
                          data={dayOfWeekStats.map((d) => ({
                            dayName: d.dayName,
                            reported: d.reported,
                            unreported: d.unreported,
                            expected: d.expected,
                            compliancePct: d.compliancePct,
                          }))}
                          margin={{ top: 8, right: 8, left: 0, bottom: 0 }}
                        >
                          <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                          <XAxis
                            dataKey="dayName"
                            tick={{ fill: '#6b7280', fontSize: 12, fontWeight: 700 }}
                            reversed
                          />
                          <YAxis
                            allowDecimals={false}
                            tick={{ fill: '#6b7280', fontSize: 11 }}
                            orientation="right"
                          />
                          <Tooltip
                            cursor={{ fill: '#f3f4f6' }}
                            contentStyle={{
                              direction: 'rtl',
                              borderRadius: 6,
                              border: '1px solid #e5e7eb',
                              fontSize: 12,
                            }}
                            labelFormatter={(label, payload) => {
                              const p = payload?.[0]?.payload as
                                | { compliancePct: number; expected: number }
                                | undefined;
                              if (!p) return `יום ${label}`;
                              return `יום ${label} — ${p.compliancePct}% היענות`;
                            }}
                            formatter={(value: number, name: string) => {
                              const label = name === 'reported' ? 'דווחו' : 'לא דווחו';
                              return [value, label];
                            }}
                          />
                          <Legend
                            verticalAlign="top"
                            height={28}
                            formatter={(value: string) =>
                              value === 'reported' ? 'דווחו' : 'לא דווחו'
                            }
                          />
                          <Bar dataKey="reported" stackId="day" fill="#4f46e5" radius={[0, 0, 0, 0]} />
                          <Bar dataKey="unreported" stackId="day" fill="#dc2626" radius={[6, 6, 0, 0]}>
                            {dayOfWeekStats.map((_, i) => (
                              <Cell key={i} fill="#dc2626" />
                            ))}
                          </Bar>
                        </BarChart>
                      </ResponsiveContainer>
                    </div>
                  )}
                </div>
              </motion.div>
            )}
            </AnimatePresence>
            </div>

            {/* Admin report modal — available from schedule + timetable + reports */}
            <Modal
              open={showAdminReportModal && !!adminReportingSchedule}
              onClose={closeAdminReportModal}
              title={editingAdminReport ? 'עריכת דיווח' : 'דיווח מנהל'}
              maxWidthClassName="max-w-lg"
            >
              {adminReportingSchedule && (
                <form onSubmit={handleAdminSubmitReport} className="space-y-4">
                  <div>
                    <h3 className="font-bold text-lg text-gray-900">
                      {editingAdminReport ? 'עריכת דיווח' : 'דיווח מנהל'}
                    </h3>
                    <p className="text-sm text-gray-500 mt-0.5">
                      {getScheduleDisplayLabel(adminReportingSchedule, students)} · יום {adminReportingSchedule.day} · {formatHourSlot(adminReportingSchedule.hour)}
                    </p>
                  </div>
                  <div>
                    <label className="text-xs font-bold text-gray-600 block mb-1">תאריך השיעור (יום {adminReportingSchedule.day}):</label>
                    <input
                      type="date"
                      value={reportDate}
                      onChange={e => setReportDate(e.target.value)}
                      className="w-full p-2.5 border border-gray-200 rounded-xl bg-white focus:ring-2 focus:ring-blue-500 outline-none"
                      required
                    />
                    {reportDate && !isLessonDateForSchedule(adminReportingSchedule, reportDate) && (
                      <p className="text-xs text-red-600 mt-1">התאריך חייב להיות ביום {adminReportingSchedule.day}</p>
                    )}
                  </div>
                  <div>
                    <label className="text-xs font-bold text-gray-600 block mb-1.5">התקיים בפועל?</label>
                    <div className="grid grid-cols-2 gap-2">
                      <button type="button" onClick={() => setReportStatus('completed')} className={`press py-2.5 rounded-xl font-bold text-sm ${reportStatus === 'completed' ? 'bg-green-600 text-white' : 'bg-white border border-gray-200'}`}>כן, התקיים</button>
                      <button type="button" onClick={() => setReportStatus('missed')} className={`press py-2.5 rounded-xl font-bold text-sm ${reportStatus === 'missed' ? 'bg-red-600 text-white' : 'bg-white border border-gray-200'}`}>לא, בוטל</button>
                    </div>
                  </div>
                  {reportStatus === 'completed' && (
                    <StudentPicker
                      students={getStudentsForAttendance(adminReportingSchedule)}
                      selectedIds={reportAttendedIds}
                      onChange={setReportAttendedIds}
                      lastSessionIds={getLastAttendedStudentIds(adminReportingSchedule.id, reports)}
                      label={isFlexibleAttendance(adminReportingSchedule) ? 'מי נוכח בשיעור?' : 'סמן מי נוכח'}
                    />
                  )}
                  <div>
                    <label className="text-xs font-bold text-gray-600 block mb-1">
                      {reportStatus === 'missed' ? 'סיבת ביטול (חובה)' : 'פירוט (אופציונלי)'}
                    </label>
                    <input
                      type="text"
                      value={reportText}
                      onChange={e => setReportText(e.target.value)}
                      className="w-full p-2.5 border border-gray-200 rounded-xl bg-white focus:ring-2 focus:ring-blue-500 outline-none"
                      required={reportStatus === 'missed'}
                      placeholder={reportStatus === 'missed' ? 'סיבת הביטול' : 'מה התבצע?'}
                    />
                  </div>
                  <div className="flex gap-2 pt-1">
                    <button
                      type="submit"
                      disabled={adminReportSubmitting}
                      className="press flex-1 py-3 bg-blue-600 hover:bg-blue-700 disabled:opacity-60 text-white font-bold rounded-xl text-sm flex items-center justify-center gap-2"
                    >
                      {adminReportSubmitting ? (<><Loader2 className="w-4 h-4 animate-spin" /> שומר...</>) : (editingAdminReport ? 'עדכן דיווח' : 'שלח דיווח')}
                    </button>
                    <button type="button" onClick={closeAdminReportModal} className="press px-4 py-3 bg-gray-100 hover:bg-gray-200 text-gray-700 font-bold rounded-xl text-sm">בטל</button>
                  </div>
                </form>
              )}
            </Modal>
          </div>
        )}
      </main>

      <footer className="bg-gray-900 text-gray-400 py-6 border-t border-gray-800 text-center text-xs mt-auto">
        <p>ישיבת צביה אלישיב לוד © {new Date().getFullYear()} • {SITE_TITLE}</p>
      </footer>

      
      {/* Edit Teacher Modal */}
      <Modal
        open={!!teacherToEdit}
        onClose={() => setTeacherToEdit(null)}
        title={teacherToEdit ? `עריכת מורה: ${teacherToEdit.name}` : undefined}
      >
        {teacherToEdit && (
          <>
            <h2 className="text-xl font-bold mb-4">עריכת מורה: {teacherToEdit.name}</h2>
            <form onSubmit={handleEditTeacherSubmit} className="space-y-4">
              <div><label className="text-sm font-bold mb-1 block">שם מלא:</label><input type="text" value={teacherToEdit.name} onChange={e => setTeacherToEdit({...teacherToEdit, name: e.target.value})} required className="w-full border rounded p-2 focus:ring-2 focus:ring-blue-500 outline-none"/></div>
              <div><label className="text-sm font-bold mb-1 block">אימייל (Microsoft/Google):</label><input type="email" value={teacherToEdit.email} onChange={e => setTeacherToEdit({...teacherToEdit, email: e.target.value})} required className="w-full border rounded p-2 text-left focus:ring-2 focus:ring-blue-500 outline-none" dir="ltr"/></div>
              <div><label className="text-sm font-bold mb-1 block">תחום לימוד / מקצוע (רשות):</label><input type="text" value={teacherToEdit.subject} onChange={e => setTeacherToEdit({...teacherToEdit, subject: e.target.value})} className="w-full border rounded p-2 focus:ring-2 focus:ring-blue-500 outline-none"/></div>
              <div className="flex justify-end gap-3 pt-4 border-t">
                <button type="button" onClick={() => setTeacherToEdit(null)} className="press px-4 py-2 bg-gray-100 hover:bg-gray-200 rounded font-bold transition-colors">ביטול</button>
                <button type="submit" className="press px-4 py-2 bg-green-600 hover:bg-green-700 text-white rounded font-bold transition-colors">שמור שינויים</button>
              </div>
            </form>
          </>
        )}
      </Modal>

      {/* Edit Schedule Modal */}
      <Modal
        open={!!scheduleToEdit}
        onClose={() => setScheduleToEdit(null)}
        title="עריכת שיעור פרטני"
      >
        {scheduleToEdit && (
          <>
            <h2 className="text-xl font-bold mb-4">עריכת שיעור פרטני</h2>
            <form onSubmit={handleEditScheduleSubmit} className="space-y-4">
              <div>
                <label className="text-sm font-bold mb-1 block">מורה משובץ:</label>
                <select value={scheduleToEdit.teacherId} onChange={e => setScheduleToEdit({...scheduleToEdit, teacherId: e.target.value})} required className="w-full p-2 border rounded-lg bg-white focus:ring-2 focus:ring-blue-500 outline-none">
                  <option value="" disabled>-- בחר מורה --</option>
                  {teachers.map(t => (
                    <option key={t.id} value={t.id}>{t.name}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="text-sm font-bold mb-2 block">סוג שיעור:</label>
                <div className="grid grid-cols-2 gap-3">
                  <button type="button" onClick={() => setScheduleToEdit({...scheduleToEdit, lessonType: 'fixed'})} className={`py-2 rounded-lg font-bold text-sm ${(scheduleToEdit.lessonType || 'fixed') === 'fixed' ? 'bg-blue-600 text-white' : 'bg-white border'}`}>קבוע</button>
                  <button type="button" onClick={() => setScheduleToEdit({...scheduleToEdit, lessonType: 'flexible', studentIds: []})} className={`py-2 rounded-lg font-bold text-sm ${scheduleToEdit.lessonType === 'flexible' ? 'bg-amber-500 text-white' : 'bg-white border'}`}>גמיש</button>
                </div>
              </div>
              {(scheduleToEdit.lessonType || 'fixed') === 'fixed' && (
                <StudentPicker
                  students={students}
                  selectedIds={scheduleToEdit.studentIds || []}
                  onChange={(ids) => setScheduleToEdit({...scheduleToEdit, studentIds: ids})}
                  label="תלמידים משויכים"
                  maxHeight="max-h-40"
                />
              )}
              <div>
                <label className="text-sm font-bold mb-1 block">מקצוע הנלמד:</label>
                <select
                  value={scheduleToEdit.subject}
                  onChange={e => setScheduleToEdit({...scheduleToEdit, subject: e.target.value})}
                  required
                  className="w-full p-2 border rounded-lg bg-white focus:ring-2 focus:ring-blue-500 outline-none"
                >
                  {!scheduleSubjectOptions.includes(scheduleToEdit.subject) && scheduleToEdit.subject && (
                    <option value={scheduleToEdit.subject}>{scheduleToEdit.subject} (קיים)</option>
                  )}
                  {scheduleSubjectOptions.map(s => (
                    <option key={s} value={s}>{s}</option>
                  ))}
                </select>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-sm font-bold mb-1 block">יום בשבוע:</label>
                  <select value={scheduleToEdit.day} onChange={e => setScheduleToEdit({...scheduleToEdit, day: e.target.value})} required className="w-full p-2 border rounded-lg bg-white focus:ring-2 focus:ring-blue-500 outline-none">
                    <option value="" disabled>-- בחר יום --</option>
                    {['ראשון', 'שני', 'שלישי', 'רביעי', 'חמישי', 'שישי'].map(d => (
                      <option key={d} value={d}>{d}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="text-sm font-bold mb-1 block">שעה:</label>
                  <select
                    value={scheduleToEdit.hour}
                    onChange={e => setScheduleToEdit({...scheduleToEdit, hour: e.target.value})}
                    required
                    className="w-full p-2 border rounded-lg bg-white focus:ring-2 focus:ring-blue-500 outline-none"
                  >
                    {!(SCHEDULE_HOUR_OPTIONS as readonly string[]).includes(scheduleToEdit.hour) && scheduleToEdit.hour && (
                      <option value={scheduleToEdit.hour}>{formatHourSlot(scheduleToEdit.hour)} (קיים)</option>
                    )}
                    {SCHEDULE_HOUR_OPTIONS.map(h => (
                      <option key={h} value={h}>{formatHourSlot(h)}</option>
                    ))}
                  </select>
                </div>
              </div>
              <div className="flex justify-end gap-3 pt-4 border-t">
                <button type="button" onClick={() => setScheduleToEdit(null)} className="press px-4 py-2 bg-gray-100 hover:bg-gray-200 rounded font-bold transition-colors">ביטול</button>
                <button type="submit" className="press px-4 py-2 bg-green-600 hover:bg-green-700 text-white rounded font-bold transition-colors">שמור שינויים</button>
              </div>
            </form>
          </>
        )}
      </Modal>

      {/* Delete Modals */}
      <Modal
        open={!!teacherToDelete}
        onClose={() => setTeacherToDelete(null)}
        title="אישור מחיקת מורה"
        maxWidthClassName="max-w-sm"
      >
        {teacherToDelete && (
          <>
            <h3 className="font-bold text-lg mb-2 text-gray-900">אישור מחיקה</h3>
            <p className="text-gray-600 mb-6">האם אתה בטוח שברצונך למחוק את {teacherToDelete.name}?</p>
            <div className="flex gap-3 justify-end">
              <button onClick={() => setTeacherToDelete(null)} className="press px-4 py-2 bg-gray-100 hover:bg-gray-200 text-gray-800 rounded font-bold transition-colors">ביטול</button>
              <button onClick={confirmDeleteTeacher} className="press px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded font-bold transition-colors">מחק מורה</button>
            </div>
          </>
        )}
      </Modal>

      <Modal
        open={!!reportToDelete}
        onClose={() => setReportToDelete(null)}
        title="אישור מחיקת דיווח"
        maxWidthClassName="max-w-sm"
      >
        <h3 className="font-bold text-lg mb-2 text-gray-900">אישור מחיקה</h3>
        <p className="text-gray-600 mb-6">האם אתה בטוח שברצונך למחוק דיווח זה מהמערכת?</p>
        <div className="flex gap-3 justify-end">
          <button onClick={() => setReportToDelete(null)} className="press px-4 py-2 bg-gray-100 hover:bg-gray-200 text-gray-800 rounded font-bold transition-colors">ביטול</button>
          <button onClick={confirmDeleteReport} className="press px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded font-bold transition-colors">מחק דיווח</button>
        </div>
      </Modal>

      <Modal
        open={!!studentToEdit}
        onClose={() => setStudentToEdit(null)}
        title={studentToEdit ? `עריכת תלמיד: ${studentToEdit.name}` : undefined}
      >
        {studentToEdit && (
          <form onSubmit={handleEditStudentSubmit} className="space-y-4">
            <div><label className="text-sm font-bold mb-1 block">שם מלא:</label><input type="text" value={studentToEdit.name} onChange={e => setStudentToEdit({...studentToEdit, name: e.target.value})} required className="w-full border rounded p-2 focus:ring-2 focus:ring-blue-500 outline-none"/></div>
            <div><label className="text-sm font-bold mb-1 block">כיתה:</label><input type="text" value={studentToEdit.className} onChange={e => setStudentToEdit({...studentToEdit, className: e.target.value})} required className="w-full border rounded p-2 focus:ring-2 focus:ring-blue-500 outline-none"/></div>
            <div className="flex justify-end gap-3 pt-4 border-t">
              <button type="button" onClick={() => setStudentToEdit(null)} className="press px-4 py-2 bg-gray-100 hover:bg-gray-200 rounded font-bold transition-colors">ביטול</button>
              <button type="submit" className="press px-4 py-2 bg-green-600 hover:bg-green-700 text-white rounded font-bold transition-colors">שמור שינויים</button>
            </div>
          </form>
        )}
      </Modal>

      <Modal
        open={!!studentToDelete}
        onClose={() => setStudentToDelete(null)}
        title="אישור מחיקת תלמיד"
        maxWidthClassName="max-w-sm"
      >
        {studentToDelete && (
          <>
            <p className="text-gray-600 mb-6">האם אתה בטוח שברצונך למחוק את {studentToDelete.name}?</p>
            <div className="flex gap-3 justify-end">
              <button onClick={() => setStudentToDelete(null)} className="press px-4 py-2 bg-gray-100 hover:bg-gray-200 text-gray-800 rounded font-bold transition-colors">ביטול</button>
              <button onClick={confirmDeleteStudent} className="press px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded font-bold transition-colors">מחק תלמיד</button>
            </div>
          </>
        )}
      </Modal>

      <StudentCard
        student={studentCardStudent}
        summary={studentCardSummary}
        onClose={() => setStudentCardStudent(null)}
      />

      <Modal
        open={!!scheduleToDelete}
        onClose={() => setScheduleToDelete(null)}
        title="אישור מחיקת שיעור"
        maxWidthClassName="max-w-sm"
      >
        <h3 className="font-bold text-lg mb-2 text-gray-900">אישור מחיקה</h3>
        <p className="text-gray-600 mb-6">האם אתה בטוח שברצונך למחוק שעת שיעור זו? כל הדיווחים של שיעור זה יימחקו גם מהמערכת ומהדשבורד.</p>
        <div className="flex gap-3 justify-end">
          <button onClick={() => setScheduleToDelete(null)} className="press px-4 py-2 bg-gray-100 hover:bg-gray-200 text-gray-800 rounded font-bold transition-colors">ביטול</button>
          <button onClick={confirmDeleteSchedule} className="press px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded font-bold transition-colors">מחק שיעור</button>
        </div>
      </Modal>
    </div>
  );
}

export default App;
