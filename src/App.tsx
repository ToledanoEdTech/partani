import React, { useState, useEffect, createContext, useContext } from 'react';
import { 
  BookOpen, Users, Calendar, CheckCircle, XCircle, Plus, Trash2, Edit3, 
  Clock, TrendingUp, Search, Filter, ArrowRight, LogOut, GraduationCap, 
  FileText, AlertCircle, Menu, X, Lock, Download, Upload, Settings, ClipboardCheck
} from 'lucide-react';
import { signInWithPopup, GoogleAuthProvider, signOut, onAuthStateChanged, User } from 'firebase/auth';
import { auth } from './firebase';
import { 
  subscribeToTeachers, subscribeToSchedules, subscribeToReports, subscribeToSettings, updateSettings,
  addTeacher, updateTeacher, deleteTeacher, addSchedule, deleteSchedule, updateSchedule, addReport, deleteReport 
} from './lib/db';
import { Teacher, Schedule, Report } from './types';
import * as XLSX from 'xlsx';

// Admin email from requirements
const ADMIN_EMAIL = 'yossitole@gmail.com';

const getSunday = (d: Date) => {
  const dCopy = new Date(d);
  dCopy.setHours(0,0,0,0);
  const day = dCopy.getDay();
  const diff = dCopy.getDate() - day;
  return new Date(dCopy.setDate(diff));
};

const formatDateLocal = (d: Date) => {
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

const dayMapReverse: Record<string, number> = { 'ראשון': 0, 'שני': 1, 'שלישי': 2, 'רביעי': 3, 'חמישי': 4, 'שישי': 5, 'שבת': 6 };

const MiniCalendar = ({ selectedSchedule, reports, selectedDateStr, onDateSelect }: { selectedSchedule: Schedule, reports: Report[], selectedDateStr: string, onDateSelect: (d: string) => void }) => {
  const [currentMonthDate, setCurrentMonthDate] = useState(new Date(selectedDateStr));

  useEffect(() => {
    setCurrentMonthDate(new Date(selectedDateStr));
  }, [selectedDateStr, selectedSchedule.id]);

  const year = currentMonthDate.getFullYear();
  const month = currentMonthDate.getMonth();
  
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const firstDayOfMonth = new Date(year, month, 1).getDay();
  
  const prevMonth = () => setCurrentMonthDate(new Date(year, month - 1, 1));
  const nextMonth = () => setCurrentMonthDate(new Date(year, month + 1, 1));

  const monthNames = ['ינואר', 'פברואר', 'מרץ', 'אפריל', 'מאי', 'יוני', 'יולי', 'אוגוסט', 'ספטמבר', 'אוקטובר', 'נובמבר', 'דצמבר'];

  const daysRender = [];
  
  for (let i = 0; i < firstDayOfMonth; i++) {
    daysRender.push(<div key={`empty-${i}`} className="p-2"></div>);
  }

  const schedDayNum = dayMapReverse[selectedSchedule.day];

  for (let d = 1; d <= daysInMonth; d++) {
    const dateObj = new Date(year, month, d);
    const dateStr = formatDateLocal(dateObj);
    const isSelected = selectedDateStr === dateStr;
    const isScheduleDay = dateObj.getDay() === schedDayNum;
    
    const existingReport = reports.find(r => r.scheduleId === selectedSchedule.id && r.date === dateStr);
    
    let baseClass = "h-8 w-8 rounded-full flex items-center justify-center text-xs font-bold transition-all cursor-pointer ";
    
    if (isSelected) {
      baseClass += "ring-2 ring-blue-500 ring-offset-1 ";
    }

    if (existingReport) {
      if (existingReport.status === 'completed') {
        baseClass += "bg-green-500 text-white hover:bg-green-600";
      } else {
        baseClass += "bg-red-500 text-white hover:bg-red-600";
      }
    } else if (isScheduleDay) {
      baseClass += "bg-blue-100 text-blue-800 hover:bg-blue-200";
    } else {
      baseClass += "hover:bg-gray-100 text-gray-700";
    }

    daysRender.push(
      <div key={d} className="flex flex-col items-center justify-center p-1 relative">
        <button type="button" onClick={() => onDateSelect(dateStr)} className={baseClass} title={existingReport ? 'כבר דווח (ראה למטה)' : isScheduleDay ? 'יום שיעור - לחץ לדיווח' : 'בחר תאריך'}>
          {d}
        </button>
      </div>
    );
  }

  return (
    <div className="bg-white border rounded-lg p-3 select-none mb-4">
      <div className="flex justify-between items-center mb-3 text-sm font-bold">
        <button type="button" onClick={prevMonth} className="px-3 py-1 hover:bg-gray-100 rounded">&lt;</button>
        <span>{monthNames[month]} {year}</span>
        <button type="button" onClick={nextMonth} className="px-3 py-1 hover:bg-gray-100 rounded">&gt;</button>
      </div>
      <div className="grid grid-cols-7 text-center text-[10px] font-bold text-gray-400 mb-1">
        <div>א'</div><div>ב'</div><div>ג'</div><div>ד'</div><div>ה'</div><div>ו'</div><div>ש'</div>
      </div>
      <div className="grid grid-cols-7">
        {daysRender}
      </div>
      <div className="mt-3 text-[10px] flex justify-center gap-3">
        <div className="flex items-center gap-1"><div className="w-2 h-2 rounded-full bg-blue-100"></div> שיעור מתוכנן</div>
        <div className="flex items-center gap-1"><div className="w-2 h-2 rounded-full bg-green-500"></div> בוצע</div>
        <div className="flex items-center gap-1"><div className="w-2 h-2 rounded-full bg-red-500"></div> בוטל</div>
      </div>
    </div>
  );
};

const App = () => {
  // Global State
  const [user, setUser] = useState<User | null>(null);
  const [authLoading, setAuthLoading] = useState(true);
  
  const [teachers, setTeachers] = useState<Teacher[]>([]);
  const [schedule, setSchedule] = useState<Schedule[]>([]);
  const [reports, setReports] = useState<Report[]>([]);
  const [settings, setSettings] = useState<{logo1?: string, logo2?: string}>({});
  
  // UI State
  const [role, setRole] = useState<'landing' | 'teacher' | 'admin'>('landing');
  const [adminTab, setAdminTab] = useState('overview'); 
  const [teacherTab, setTeacherTab] = useState<'overview' | 'history'>('overview');
  const [timetableWeekStart, setTimetableWeekStart] = useState<Date>(getSunday(new Date()));
  const [teacherWeekStart, setTeacherWeekStart] = useState<Date>(getSunday(new Date())); 
  const [notification, setNotification] = useState({ show: false, message: '', type: 'success' });
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  
  // Admin Filters
  const [filterTeacher, setFilterTeacher] = useState('all');
  const [filterStatus, setFilterStatus] = useState('all');
  const [searchStudent, setSearchStudent] = useState('');

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
  const [newScheduleHour, setNewScheduleHour] = useState('');
  const [newScheduleStudent, setNewScheduleStudent] = useState('');
  const [newScheduleSubject, setNewScheduleSubject] = useState('');

  // Report state
  const [selectedScheduleForReport, setSelectedScheduleForReport] = useState<Schedule | null>(null);
  const [adminReportingSchedule, setAdminReportingSchedule] = useState<Schedule | null>(null);
  const [reportStatus, setReportStatus] = useState<'completed' | 'missed'>('completed');
  const [reportText, setReportText] = useState('');
  const [reportDate, setReportDate] = useState(new Date().toISOString().split('T')[0]);

  const [impersonateTeacherId, setImpersonateTeacherId] = useState<string | null>(null);

  // Derived state
  const isAdmin = user?.email === ADMIN_EMAIL;
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
        if (u.email === ADMIN_EMAIL) {
          setRole('admin');
        } else {
          setRole('teacher');
        }
      } else {
        setRole('landing');
      }
    });
    return unsub;
  }, []);

  // Data Subscription Effect
  useEffect(() => {
    // We can subscribe to settings regardless of auth so landing page sees it
    const unsubSettings = subscribeToSettings(
      (data) => setSettings(data)
    );

    if (!user) return unsubSettings;
    
    // Everyone verified logged in can read teachers
    const unsubTeachers = subscribeToTeachers(
      (data) => setTeachers(data),
      (err) => triggerNotification('שגיאה בטעינת מורים', 'error')
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
      unsubSchedules();
      unsubReports();
    };
  }, [user, isAdmin]);

  const handleLogin = async () => {
    const provider = new GoogleAuthProvider();
    provider.setCustomParameters({ prompt: 'select_account' });
    try {
      await signInWithPopup(auth, provider);
    } catch (e) {
      console.error(e);
      triggerNotification('התחברות נכשלה', 'error');
    }
  };


  const handleExportReports = () => {
    const data = filteredReportsList.map(rep => {
      const sched = schedule.find(s => s.id === rep.scheduleId);
      const teach = teachers.find(t => t.id === rep.teacherId);
      return {
        'תאריך': rep.date,
        'מורה': teach?.name || '-',
        'תלמיד': sched?.studentName || 'נמחק',
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
  };

  const handleLogoUpload = (e: React.ChangeEvent<HTMLInputElement>, key: 'logo1' | 'logo2') => {
    const file = e.target.files?.[0];
    if (!file) return;
    
    const reader = new FileReader();
    reader.onload = (event) => {
      const img = new window.Image();
      img.onload = async () => {
        const canvas = document.createElement('canvas');
        const MAX_WIDTH = 800;
        const MAX_HEIGHT = 800;
        let width = img.width;
        let height = img.height;

        if (width > height) {
          if (width > MAX_WIDTH) {
            height *= MAX_WIDTH / width;
            width = MAX_WIDTH;
          }
        } else {
          if (height > MAX_HEIGHT) {
            width *= MAX_HEIGHT / height;
            height = MAX_HEIGHT;
          }
        }
        
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        if (ctx) {
          ctx.drawImage(img, 0, 0, width, height);
          const base64 = canvas.toDataURL('image/jpeg', 0.8);
          
          try {
            await updateSettings({ [key]: base64 });
            triggerNotification('לוגו עודכן בהצלחה');
          } catch (error) {
            triggerNotification('שגיאה בשמירת הלוגו. נסה תמונה קטנה יותר', 'error');
          }
        }
      };
      img.src = event.target?.result as string;
    };
    reader.readAsDataURL(file);
    
    if (e.target) e.target.value = '';
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
        const student = String(row['תלמיד'] || row['Student'] || '');
        const subject = String(row['מקצוע'] || row['Subject'] || '');

        if (email && day && hour && student) {
          const teacher = teachers.find(t => t.email === email);
          if (teacher) {
            await addSchedule({
              teacherId: teacher.id,
              teacherEmail: teacher.email,
              day,
              hour,
              studentName: student,
              subject
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
      { 'אימייל מורה': 'israel@example.com', 'יום': 'ראשון', 'שעה': '9:00', 'תלמיד': 'אברהם פריד', 'מקצוע': 'מתמטיקה' },
      { 'אימייל מורה': 'moshe@example.com', 'יום': 'שני', 'שעה': '10:00', 'תלמיד': 'יעקב שמעון', 'מקצוע': 'אנגלית' }
    ]);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'שיעורים');
    XLSX.writeFile(wb, 'תבנית_יבוא_שיעורים.xlsx');
  };

  const [isSidebarOpen, setIsSidebarOpen] = useState(false);

  // Admin Actions
  const handleAddTeacher = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTeacherName.trim() || !newTeacherSubject.trim() || !newTeacherEmail.trim()) {
      triggerNotification('נא למלא את כל השדות', 'error');
      return;
    }
    await addTeacher({
      name: newTeacherName,
      email: newTeacherEmail.toLowerCase(),
      subject: newTeacherSubject,
      active: true
    });
    setNewTeacherName('');
    setNewTeacherEmail('');
    setNewTeacherSubject('');
    setShowAddTeacherModal(false);
    triggerNotification(`המורה ${newTeacherName} נוסף בהצלחה למערכת`);
  };

  const handleToggleTeacherActive = async (id: string, current: boolean) => {
    await updateTeacher(id, { active: !current });
    triggerNotification('סטטוס מורה עודכן בהצלחה');
  };

  
  const handleEditTeacherSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!teacherToEdit || !teacherToEdit.name.trim() || !teacherToEdit.email.trim()) {
      triggerNotification('שם ואימייל הם שדות חובה', 'error');
      return;
    }
    await updateTeacher(teacherToEdit.id, {
      name: teacherToEdit.name,
      email: teacherToEdit.email,
      subject: teacherToEdit.subject
    });
    setTeacherToEdit(null);
    triggerNotification('פרטי המורה עודכנו בהצלחה');
  };

  const handleEditScheduleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!scheduleToEdit || !scheduleToEdit.day.trim() || !scheduleToEdit.hour.trim() || !scheduleToEdit.studentName.trim() || !scheduleToEdit.subject.trim()) {
      triggerNotification('כל שדות החובה חייבים להיות מלאים', 'error');
      return;
    }
    await updateSchedule(scheduleToEdit.id, {
      day: scheduleToEdit.day,
      hour: scheduleToEdit.hour,
      studentName: scheduleToEdit.studentName,
      subject: scheduleToEdit.subject,
      teacherId: scheduleToEdit.teacherId
    });
    setScheduleToEdit(null);
    triggerNotification('שעת השיעור עודכנה בהצלחה');
  };

  const handleDeleteTeacher = (id: string, name: string) => {
    setTeacherToDelete({ id, name });
  };

  const confirmDeleteTeacher = async () => {
    if (teacherToDelete) {
      await deleteTeacher(teacherToDelete.id);
      triggerNotification(`המורה נמחק בהצלחה מהמערכת`);
      setTeacherToDelete(null);
    }
  };

  const handleAddSchedule = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newScheduleTeacher || !newScheduleHour.trim() || !newScheduleStudent.trim() || !newScheduleSubject.trim()) {
      triggerNotification('נא למלא את כל השדות', 'error');
      return;
    }
    const tItem = teachers.find(t => t.id === newScheduleTeacher);
    if(!tItem) return;

    await addSchedule({
      teacherId: newScheduleTeacher,
      teacherEmail: tItem.email,
      day: newScheduleDay,
      hour: newScheduleHour,
      studentName: newScheduleStudent,
      subject: newScheduleSubject
    });
    setNewScheduleHour('');
    setNewScheduleStudent('');
    setNewScheduleSubject('');
    setShowAddScheduleModal(false);
    triggerNotification('שעת שיעור פרטני נוספה בהצלחה למערכת');
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
      triggerNotification('שעת השיעור נמחקה בהצלחה');
      setScheduleToDelete(null);
    }
  };

  const handleAdminSubmitReport = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!adminReportingSchedule) return;
    if (!reportText.trim()) {
      triggerNotification('נא להזין משפט קצר', 'error');
      return;
    }
    
    // Check if report exists for that date and schedule
    const existingIndex = reports.findIndex(
      r => r.scheduleId === adminReportingSchedule.id && r.date === reportDate
    );

    if (existingIndex !== -1) {
      triggerNotification('כבר קיים דיווח לשיעור זה בתאריך הנבחר.', 'error');
      return;
    }

    await addReport({
      scheduleId: adminReportingSchedule.id,
      teacherId: adminReportingSchedule.teacherId,
      teacherEmail: adminReportingSchedule.teacherEmail,
      date: reportDate,
      status: reportStatus,
      text: reportText,
      timestamp: new Date().toISOString()
    });
    
    triggerNotification('דיווח הוסף בהצלחה במערכת!');
    setReportText('');
    setShowAdminReportModal(false);
    setAdminReportingSchedule(null);
  };

  const handleSubmitReport = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedScheduleForReport) return;
    if (!reportText.trim()) {
      triggerNotification('נא להזין משפט קצר', 'error');
      return;
    }
    
    // Check if report exists for that date and schedule
    const existingIndex = reports.findIndex(
      r => r.scheduleId === selectedScheduleForReport.id && r.date === reportDate
    );

    if (existingIndex !== -1) {
      triggerNotification('כבר קיים דיווח לשיעור זה בתאריך הנבחר. עריכת דיווחים אינה נתמכת כרגע בממשק.', 'error');
      return;
    }

    await addReport({
      scheduleId: selectedScheduleForReport.id,
      teacherId: selectedScheduleForReport.teacherId,
      teacherEmail: selectedScheduleForReport.teacherEmail,
      date: reportDate,
      status: reportStatus,
      text: reportText,
      timestamp: new Date().toISOString()
    });
    
    triggerNotification('הדיווח נקלט בהצלחה במערכת. תודה רבה!');
    setReportText('');
    setSelectedScheduleForReport(null);
  };

  const totalClassesPlanned = schedule.length;
  const totalReportsSubmitted = reports.length;
  const completedReports = reports.filter(r => r.status === 'completed').length;
  const missedReports = reports.filter(r => r.status === 'missed').length;
  const complianceRate = totalReportsSubmitted > 0 ? Math.round((completedReports / totalReportsSubmitted) * 100) : 0;

  const filteredReportsList = reports.filter(report => {
    const scheduleItem = schedule.find(s => s.id === report.scheduleId);
    const teacherItem = teachers.find(t => t.id === report.teacherId);
    
    const matchesTeacher = filterTeacher === 'all' || report.teacherId === filterTeacher;
    const matchesStatus = filterStatus === 'all' || report.status === filterStatus;
    
    const searchLower = searchStudent.toLowerCase();
    const matchesSearch = searchStudent === '' || 
      (scheduleItem && scheduleItem.studentName.toLowerCase().includes(searchLower)) ||
      (teacherItem && teacherItem.name.toLowerCase().includes(searchLower)) ||
      (scheduleItem && scheduleItem.subject.toLowerCase().includes(searchLower));

    return matchesTeacher && matchesStatus && matchesSearch;
  });

  if (authLoading) return <div className="flex items-center justify-center min-h-screen text-gray-500">טוען...</div>;

  return (
    <div className="min-h-screen bg-[#f3f4f6] text-[#111827] font-sans flex flex-col" dir="rtl">
      {notification.show && (
        <div className={`fixed bottom-5 left-5 z-50 p-4 rounded shadow-sm flex items-center gap-3 transition-all duration-300 max-w-md ${
          notification.type === 'success' ? 'bg-green-600 text-white' : 'bg-red-600 text-white'
        }`}>
          {notification.type === 'success' ? <CheckCircle className="w-6 h-6 shrink-0" /> : <AlertCircle className="w-6 h-6 shrink-0" />}
          <span className="font-semibold text-sm">{notification.message}</span>
        </div>
      )}

      {/* Header */}
      <header className="bg-[#1e293b] text-white border-b border-gray-700 sticky top-0 z-40">
        <div className="container mx-auto px-4 py-3 flex justify-between items-center">
          <div className="flex items-center gap-4">
            {/* כפתור תפריט צד (Hamburger) */}
            <button 
              className="p-2 text-white hover:bg-white/10 border border-transparent hover:border-gray-600 rounded-lg transition-colors bg-gray-800"
              onClick={() => setMobileMenuOpen(true)}
            >
              <Menu className="w-6 h-6" />
            </button>
            
            <div className="flex items-center gap-3 cursor-pointer">
              {settings.logo1 ? (
                <img src={settings.logo1} alt="Logo 1" className="h-10 w-auto object-contain rounded" />
              ) : (
                <div className="bg-amber-500 text-[#111827] p-2 rounded shadow-inner font-bold text-lg flex items-center justify-center">
                  <GraduationCap className="w-6 h-6" />
                </div>
              )}
              {settings.logo2 && (
                <img src={settings.logo2} alt="Logo 2" className="h-10 w-auto object-contain rounded" />
              )}
              <div>
                <h1 className="font-bold text-lg leading-tight md:text-xl">ישיבת צביה אלישיב לוד</h1>
                <p className="text-amber-400 text-xs font-semibold">מערכת מעקב ולמידה - שיעורים פרטניים</p>
              </div>
            </div>
          </div>
          <div className="hidden md:block"></div>
        </div>
      </header>

      {/* תפריט צד (Drawer) - נפתח מצד ימין */}
      {mobileMenuOpen && (
        <div className="fixed inset-0 z-50 flex justify-start bg-black/50 transition-opacity" onClick={() => setMobileMenuOpen(false)}>
          <div className="w-64 h-full bg-[#1e293b] text-white shadow-2xl flex flex-col transform transition-transform" onClick={e => e.stopPropagation()}>
            <div className="p-4 border-b border-gray-700 flex justify-between items-center bg-[#0f172a]">
              <span className="font-bold">תפריט אפשרויות</span>
              <button onClick={() => setMobileMenuOpen(false)} className="hover:bg-white/10 p-1 rounded-full"><X className="w-6 h-6" /></button>
            </div>
            <div className="flex-1 p-4 space-y-2 overflow-y-auto">
              {!user && (
                <button 
                  onClick={() => { handleLogin(); setMobileMenuOpen(false); }} 
                  className="w-full p-3 rounded-lg bg-amber-500 text-[#111827] font-bold transition flex items-center gap-3"
                >
                  <Lock className="w-5 h-5" /> כניסה למערכת
                </button>
              )}

              {user && (
                <div className="space-y-4">
                  <div className="text-sm text-gray-300 pb-4 border-b border-gray-700">
                    <p className="font-bold text-white mb-1">{isAdmin ? 'מנהל ישיבה' : currentTeacherProfile?.name || user.email}</p>
                    {isAdmin && <p className="text-xs text-amber-400">גישת הנהלה מורחבת</p>}
                  </div>
                  
                  {isAdmin && !isImpersonating && (
                    <div className="space-y-1">
                      <p className="text-xs font-bold text-gray-500 mb-2 uppercase">דפי ניהול</p>
                      <button onClick={() => { setAdminTab('overview'); setMobileMenuOpen(false); }} className={`w-full text-right p-2 rounded flex items-center gap-3 transition ${adminTab === 'overview' ? 'bg-blue-600 text-white' : 'text-gray-300 hover:bg-gray-800'}`}><TrendingUp className="w-4 h-4"/> מבט על וסטטיסטיקה</button>
                      <button onClick={() => { setAdminTab('teachers'); setMobileMenuOpen(false); }} className={`w-full text-right p-2 rounded flex items-center gap-3 transition ${adminTab === 'teachers' ? 'bg-blue-600 text-white' : 'text-gray-300 hover:bg-gray-800'}`}><Users className="w-4 h-4"/> ניהול מורים</button>
                      <button onClick={() => { setAdminTab('schedule'); setMobileMenuOpen(false); }} className={`w-full text-right p-2 rounded flex items-center gap-3 transition ${adminTab === 'schedule' ? 'bg-blue-600 text-white' : 'text-gray-300 hover:bg-gray-800'}`}><Calendar className="w-4 h-4"/> מערכת שעות פרטנית</button>
                      <button onClick={() => { setAdminTab('timetable'); setMobileMenuOpen(false); }} className={`w-full text-right p-2 rounded flex items-center gap-3 transition ${adminTab === 'timetable' ? 'bg-blue-600 text-white' : 'text-gray-300 hover:bg-gray-800'}`}><Clock className="w-4 h-4"/> מערכת שעות שבועית</button>
                      <button onClick={() => { setAdminTab('reports'); setMobileMenuOpen(false); }} className={`w-full text-right p-2 rounded flex items-center gap-3 transition ${adminTab === 'reports' ? 'bg-blue-600 text-white' : 'text-gray-300 hover:bg-gray-800'}`}><FileText className="w-4 h-4"/> כל הדיווחים במערכת</button>
                      <button onClick={() => { setAdminTab('settings'); setMobileMenuOpen(false); }} className={`w-full text-right p-2 rounded flex items-center gap-3 transition ${adminTab === 'settings' ? 'bg-blue-600 text-white' : 'text-gray-300 hover:bg-gray-800'}`}><Settings className="w-4 h-4"/> הגדרות לוגו / מערכת</button>
                    </div>
                  )}

                  {((!isAdmin && currentTeacherProfile) || isImpersonating) && (
                    <div className="space-y-1">
                      <p className="text-xs font-bold text-gray-500 mb-2 uppercase">דפי מורה</p>
                      <button onClick={() => { setTeacherTab('overview'); setMobileMenuOpen(false); }} className={`w-full text-right p-2 rounded flex items-center gap-3 transition ${teacherTab === 'overview' ? 'bg-blue-600 text-white' : 'text-gray-300 hover:bg-gray-800'}`}><Calendar className="w-4 h-4"/> דיווח שבוע נוכחי</button>
                      <button onClick={() => { setTeacherTab('history'); setMobileMenuOpen(false); }} className={`w-full text-right p-2 rounded flex items-center gap-3 transition ${teacherTab === 'history' ? 'bg-blue-600 text-white' : 'text-gray-300 hover:bg-gray-800'}`}><FileText className="w-4 h-4"/> היסטוריית דיווחים</button>
                    </div>
                  )}

                  {isImpersonating && (
                     <button onClick={() => { setImpersonateTeacherId(null); setMobileMenuOpen(false); }} className="w-full text-right p-2 rounded flex items-center gap-3 transition bg-amber-600 hover:bg-amber-700 text-white"><LogOut className="w-4 h-4"/> סיום צפייה כמורה</button>
                  )}

                  <div className="pt-4 mt-4 border-t border-gray-700">
                    <button 
                      onClick={() => { handleLogout(); setMobileMenuOpen(false); }} 
                      className="w-full text-right p-2 rounded-lg text-red-400 hover:bg-red-500 hover:text-white transition flex items-center gap-3"
                    >
                      <LogOut className="w-5 h-5" /> יציאה מהחשבון
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      <main className="flex-1">
        {/* LANDING */}
        {!user && (
          <div className="py-12 px-4 max-w-6xl mx-auto flex items-center flex-col text-center space-y-8">
             <div className="text-center max-w-3xl mx-auto space-y-4">
              <span className="px-4 py-1.5 rounded-full text-xs font-bold uppercase tracking-wider bg-blue-100 text-blue-800 border border-blue-200">
                צביה אלישיב - לוד
              </span>
              <h2 className="text-3xl md:text-5xl font-bold text-[#111827] leading-tight">
                מערכת דיווח ומעקב <br />
                <span className="text-amber-600">שיעורים פרטניים</span>
              </h2>
              <p className="text-gray-600 text-base md:text-lg">
                כלי מקוון ומהיר לצוות המורים ולהנהלת הישיבה למעקב, תיעוד ובקרה אחר שיעורי הלמידה הפרטניים של תלמידנו. המערכת מזהה אותך אוטומטית כמורה או הנהלה.
              </p>
            </div>
            
            <button
                onClick={handleLogin}
                className="py-4 px-12 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-lg transition duration-200 flex items-center justify-center gap-3 shadow-sm text-lg hover:shadow-sm"
              >
                <span>התחבר עם Google</span>
                <Lock className="w-5 h-5" />
            </button>
          </div>
        )}

        {/* TEACHER NOT FOUND (Logged in but no teacher profile) */}
        {user && !isAdmin && !isImpersonating && !currentTeacherProfile && (
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
        {((user && !isAdmin && currentTeacherProfile) || isImpersonating) && (
          <div className="py-8 px-4 max-w-6xl mx-auto space-y-8">
            {isImpersonating && (
              <div className="bg-amber-50 border border-amber-200 p-4 rounded-lg flex flex-col md:flex-row justify-between items-start md:items-center text-amber-900 gap-4">
                <span><strong>מצב צפייה כמורה:</strong> אתה צופה במערכת ופועל כמורה <strong>{currentTeacherProfile?.name}</strong>. פעולות שתבצע ירשמו תחתיו.</span>
                <button onClick={() => setImpersonateTeacherId(null)} className="px-4 py-2 bg-amber-500 hover:bg-amber-600 text-[#111827] font-bold rounded shadow-sm text-sm whitespace-nowrap">סיום צפייה כמורה</button>
              </div>
            )}
            <div className="bg-white rounded-lg p-6 shadow-sm border border-gray-100 flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
              <div>
                <span className="text-xs font-bold text-blue-800">מורה מדווח</span>
                <h2 className="text-2xl font-bold text-gray-900">{currentTeacherProfile.name}</h2>
                <p className="text-gray-500 text-sm">תחום הוראה עיקרי: {currentTeacherProfile.subject}</p>
              </div>
            </div>

            {teacherTab === 'overview' && (
              <div className="grid lg:grid-cols-3 gap-8">
                <div className="lg:col-span-2 space-y-6">
                  {/* Schedules */}
                <div className="bg-white rounded-lg shadow-sm border border-gray-100 overflow-hidden">
                  <div className="bg-gradient-to-l from-blue-900 to-indigo-950 text-white p-5 flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                    <div className="flex items-center gap-2">
                      <Calendar className="w-5 h-5 text-amber-400" />
                      <h3 className="font-bold text-lg">שעות השיעור הפרטניות שלי ({teacherSchedules.length})</h3>
                    </div>
                    <div className="flex items-center gap-2 text-sm bg-white/10 p-1.5 rounded-lg border border-white/20">
                      <button onClick={() => { const d = new Date(teacherWeekStart); d.setDate(d.getDate() - 7); setTeacherWeekStart(d); }} className="px-2 py-1 bg-white/10 hover:bg-white/20 rounded font-bold">שבוע קודם</button>
                      <span className="font-bold px-2 text-xs">שבוע של {formatDateLocal(teacherWeekStart)}</span>
                      <button onClick={() => { const d = new Date(teacherWeekStart); d.setDate(d.getDate() + 7); setTeacherWeekStart(d); }} className="px-2 py-1 bg-white/10 hover:bg-white/20 rounded font-bold">שבוע הבא</button>
                    </div>
                  </div>

                  <div className="p-5">
                    {teacherSchedules.length === 0 ? (
                      <div className="text-center py-12 text-gray-400">
                        <p className="font-bold">לא נמצאו שעות פרטניות המשוייכות אליך במערכת.</p>
                      </div>
                    ) : (
                      <div className="grid gap-4">
                        {teacherSchedules.map(slot => {
                          const dayMap: Record<string, number> = { 'ראשון': 0, 'שני': 1, 'שלישי': 2, 'רביעי': 3, 'חמישי': 4, 'שישי': 5, 'שבת': 6 };
                          const dayOffset = dayMap[slot.day] || 0;
                          const cellDateObj = new Date(teacherWeekStart);
                          cellDateObj.setDate(cellDateObj.getDate() + dayOffset);
                          const cellDateStr = formatDateLocal(cellDateObj);

                          const weeklyReport = teacherReports.find(r => r.scheduleId === slot.id && r.date === cellDateStr);
                          const isReportingThis = selectedScheduleForReport?.id === slot.id;
                          
                          return (
                            <div key={slot.id} className={`p-5 rounded-lg border transition-all duration-200 ${
                                isReportingThis ? 'border-blue-500 bg-blue-50' : 
                                weeklyReport ? (weeklyReport.status === 'completed' ? 'border-green-100 bg-green-50/30' : 'border-red-100 bg-red-50/30') : 'border-gray-100 bg-white'
                              }`}>
                              <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
                                <div>
                                  <div className="flex flex-wrap items-center gap-2 mb-1">
                                    <span className="px-2.5 py-1 rounded-lg bg-gray-100 text-gray-800 text-xs font-bold">יום {slot.day} ({cellDateStr})</span>
                                    <span className="px-2.5 py-1 rounded-lg bg-blue-50 text-blue-800 text-xs font-bold">{slot.hour}</span>
                                  </div>
                                  <h4 className="font-bold text-gray-900 text-base">תלמיד: {slot.studentName}</h4>
                                  <p className="text-xs text-gray-500">מקצוע: {slot.subject}</p>
                                </div>
                                <div className="min-w-[120px] text-left">
                                    {!isReportingThis && (
                                       <button
                                        onClick={() => {
                                          setSelectedScheduleForReport(slot);
                                          setReportDate(cellDateStr);
                                          setReportStatus('completed');
                                          setReportText('');
                                        }}
                                        className="px-4 py-2 rounded text-xs font-bold bg-indigo-50 text-indigo-900 hover:bg-indigo-100 transition-colors w-full sm:w-auto mb-2 sm:mb-0 sm:ml-2"
                                      >
                                        צפה בלוח שנה / דווח
                                      </button>
                                    )}
                                    {weeklyReport && !isReportingThis && (
                                        <span className={`font-bold text-xs inline-flex items-center ${weeklyReport.status === 'completed' ? 'text-green-600' : 'text-red-500'}`}>
                                          {weeklyReport.status === 'completed' ? <CheckCircle className="w-4 h-4 inline mr-1" /> : <XCircle className="w-4 h-4 inline mr-1" />}
                                          {weeklyReport.status === 'completed' ? 'בוצע השבוע' : 'בוטל השבוע'}
                                        </span>
                                    )}
                                    {isReportingThis && (
                                        <span className="text-xs font-bold text-blue-600">הלוח פתוח בצד...</span>
                                    )}
                                </div>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                </div>
              </div>

              {/* REPORT FORM */}
              <div className="lg:col-span-1">
                {selectedScheduleForReport ? (
                  <div className="bg-white rounded-lg shadow-sm border border-blue-100 p-6 sticky top-24 space-y-6">
                    <div className="flex justify-between">
                      <h3 className="font-bold text-[#111827] text-lg">טופס דיווח שיעור</h3>
                      <button onClick={() => setSelectedScheduleForReport(null)} className="text-gray-400"><X className="w-5 h-5" /></button>
                    </div>
                    <form onSubmit={handleSubmitReport} className="space-y-4">
                      <div>
                        <label className="text-xs font-bold text-gray-600 block mb-2">תאריך השיעור (בחר מלוח השנה):</label>
                        <MiniCalendar 
                           selectedSchedule={selectedScheduleForReport} 
                           reports={teacherReports} 
                           selectedDateStr={reportDate} 
                           onDateSelect={(d) => setReportDate(d)}
                        />
                      </div>
                      <div>
                         <label className="text-xs font-bold text-gray-600 block mb-1">התקיים בפועל?</label>
                         <div className="grid grid-cols-2 gap-3">
                           <button type="button" onClick={() => setReportStatus('completed')} className={`py-2 rounded font-bold text-sm ${reportStatus==='completed' ? 'bg-green-500 text-white' : 'bg-white border'}`}>כן, התקיים</button>
                           <button type="button" onClick={() => setReportStatus('missed')} className={`py-2 rounded font-bold text-sm ${reportStatus==='missed' ? 'bg-red-500 text-white' : 'bg-white border'}`}>לא, בוטל</button>
                         </div>
                      </div>
                      <div>
                        <label className="text-xs font-bold text-gray-600 block mb-1">פירוט (מה התבצע או סיבת ביטול):</label>
                        <textarea rows={3} value={reportText} onChange={e => setReportText(e.target.value)} className="w-full p-2 border rounded bg-gray-50 focus:ring-2 focus:ring-blue-500 outline-none" required />
                      </div>
                      <button type="submit" className="w-full py-3 bg-blue-600 text-white font-bold rounded shadow-sm">שלח דיווח</button>
                    </form>
                  </div>
                ) : (
                  <div className="bg-white rounded-lg shadow-sm border border-gray-100 p-6 text-center text-gray-400">
                    <BookOpen className="w-12 h-12 mx-auto text-gray-200 mb-3" />
                    <p className="text-sm font-bold text-gray-500">טרם נבחר שיעור לדיווח</p>
                  </div>
                )}
              </div>
            </div>
          )}

          {teacherTab === 'history' && (
              <div className="bg-white rounded-lg shadow-sm border border-gray-100 overflow-hidden">
                <div className="p-5 border-b border-gray-100">
                  <h3 className="font-bold text-gray-900 flex items-center gap-2"><FileText className="w-5 h-5 text-blue-600"/> היסטוריית דיווחים אישית מורחבת</h3>
                </div>
                <div className="p-5 min-h-[400px]">
                  {teacherReports.length === 0 ? (
                    <div className="text-center py-12 text-gray-400">
                      <p className="font-bold">אין דיווחים קודמים במערכת.</p>
                    </div>
                  ) : (
                    <div className="grid gap-4 md:grid-cols-2">
                    {teacherReports.map(rep => {
                      const sched = teacherSchedules.find(s => s.id === rep.scheduleId);
                      return (
                        <div key={rep.id} className="p-4 border rounded-lg bg-gray-50 flex flex-col justify-between">
                          <div className="flex justify-between items-start mb-3">
                            <div>
                              <h5 className="font-bold text-base text-gray-900">{sched?.studentName || 'שיעור נמחק'}</h5>
                              <p className="text-xs text-gray-500 mb-1">מקצוע: {sched?.subject || '-'} | תאריך יעד: {rep.date}</p>
                            </div>
                            <span className={`px-3 py-1 rounded-full text-xs font-bold ${rep.status === 'completed' ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'}`}>
                              {rep.status === 'completed' ? 'התקיים' : 'בוטל'}
                            </span>
                          </div>
                          <div className="mt-2 text-sm text-gray-700 bg-white p-3 rounded border border-gray-100">
                            <strong>פירוט:</strong><br/>
                            <span className="italic">"{rep.text}"</span>
                          </div>
                        </div>
                      );
                    })}
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        )}

        {/* ADMIN VIEW */}
        {user && isAdmin && !isImpersonating && (
          <div className="py-8 px-4 max-w-6xl mx-auto space-y-8">
            <div className="bg-white rounded-lg p-6 shadow-sm border border-gray-100 flex justify-between items-center">
              <div>
                <span className="text-xs font-bold text-amber-600">מנהל ישיבת צביה אלישיב לוד</span>
                <h2 className="text-2xl font-bold text-gray-900">לוח בקרה וניהול פדגוגי</h2>
              </div>
            </div>

            {/* TAB: SETTINGS */}
            {adminTab === 'settings' && (
              <div className="space-y-6">
                <div className="bg-white rounded-lg p-6 shadow-sm border border-gray-100">
                  <h3 className="text-xl font-bold mb-6 text-gray-900 border-b pb-4">הגדרות כלליות ולוגו</h3>
                  <div className="grid md:grid-cols-2 gap-8">
                    <div className="bg-gray-50 border border-gray-200 p-5 rounded-lg space-y-4">
                      <label className="block text-sm font-bold text-gray-800">לוגו ימני (ראשי)</label>
                      <input type="file" accept="image/*" onChange={(e) => handleLogoUpload(e, 'logo1')} className="block w-full text-sm text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded file:border-0 file:text-sm file:font-semibold file:bg-blue-600 file:text-white hover:file:bg-blue-700 cursor-pointer"/>
                      {settings.logo1 && (
                        <div className="mt-4">
                          <img src={settings.logo1} className="h-20 w-auto object-contain border border-gray-200 rounded p-2 bg-white"/>
                          <button onClick={() => updateSettings({logo1: null})} className="text-red-500 font-bold text-xs mt-2 hover:underline">הסר לוגו</button>
                        </div>
                      )}
                    </div>
                    
                    <div className="bg-gray-50 border border-gray-200 p-5 rounded-lg space-y-4">
                      <label className="block text-sm font-bold text-gray-800">לוגו שמאלי (משני)</label>
                      <input type="file" accept="image/*" onChange={(e) => handleLogoUpload(e, 'logo2')} className="block w-full text-sm text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded file:border-0 file:text-sm file:font-semibold file:bg-blue-600 file:text-white hover:file:bg-blue-700 cursor-pointer"/>
                      {settings.logo2 && (
                        <div className="mt-4">
                          <img src={settings.logo2} className="h-20 w-auto object-contain border border-gray-200 rounded p-2 bg-white"/>
                          <button onClick={() => updateSettings({logo2: null})} className="text-red-500 font-bold text-xs mt-2 hover:underline">הסר לוגו</button>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* TAB: TEACHERS */}
            {adminTab === 'teachers' && (
              <div className="space-y-6">
                                <div className="flex flex-wrap gap-2">
                  <button onClick={() => setShowAddTeacherModal(true)} className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded text-sm flex items-center gap-1.5 shadow-sm"><Plus className="w-4 h-4"/> הוספת מורה חדש</button>
                  <label className="px-4 py-2 bg-green-600 hover:bg-green-700 text-white font-bold rounded text-sm flex items-center gap-1.5 shadow-sm cursor-pointer">
                    <Upload className="w-4 h-4"/> ייבוא מורים מהאקסל
                    <input type="file" accept=".xlsx, .xls" className="hidden" onChange={handleTeachersExcelUpload} />
                  </label>
                  <button onClick={handleDownloadTeachersTemplate} className="px-4 py-2 bg-gray-100 border border-gray-300 hover:bg-gray-200 text-gray-700 font-bold rounded text-sm flex items-center gap-1.5 shadow-sm">
                    <Download className="w-4 h-4"/> הורד תבנית ריקה
                  </button>
                </div>
                
                {showAddTeacherModal && (
                  <div className="bg-gray-100 p-6 rounded-lg border border-blue-200">
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
                        <button type="submit" className="py-2.5 px-4 bg-green-600 text-white font-bold rounded-lg text-sm w-full">שמור</button>
                        <button type="button" onClick={() => setShowAddTeacherModal(false)} className="py-2.5 px-4 bg-gray-200 text-gray-700 font-bold rounded-lg text-sm w-full">בטל</button>
                      </div>
                    </form>
                  </div>
                )}

                <div className="bg-white rounded-lg border border-gray-200 shadow-sm flex-1 overflow-hidden">
                  <table className="w-full text-right">
                    <thead className="bg-gray-50 text-xs text-gray-500 border-b">
                      <tr><th className="px-6 py-4">שם מורה</th><th className="px-6 py-4">אימייל</th><th className="px-6 py-4">מקצוע</th><th className="px-6 py-4 text-center">סטטוס</th><th className="px-6 py-4 text-center">פעולות</th></tr>
                    </thead>
                    <tbody className="divide-y text-sm">
                      {teachers.map(t => (
                        <tr key={t.id}>
                          <td className="px-6 py-4 font-bold">{t.name}</td>
                          <td className="px-6 py-4">{t.email}</td>
                          <td className="px-6 py-4">{t.subject}</td>
                          <td className="px-6 py-4 text-center">
                            <button onClick={() => handleToggleTeacherActive(t.id, t.active)} className={`px-3 py-1 rounded-full text-xs font-bold ${t.active ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'}`}>
                              {t.active ? 'פעיל' : 'לא פעיל'}
                            </button>
                          </td>
                          <td className="px-6 py-4">
                            <div className="flex items-center justify-center gap-2">
                               <button onClick={() => setImpersonateTeacherId(t.id)} className="p-1.5 bg-blue-50 text-blue-600 hover:bg-blue-100 rounded transition" title="צפה כמורה זה"><BookOpen className="w-4 h-4"/></button>
                               <button onClick={() => setTeacherToEdit(t)} className="p-1.5 hover:bg-green-50 rounded transition"><Edit3 className="w-4 h-4 text-green-600"/></button>
                               <button onClick={() => handleDeleteTeacher(t.id, t.name)} className="p-1.5 hover:bg-red-50 rounded transition"><Trash2 className="w-4 h-4 text-red-500"/></button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* TAB: SCHEDULE */}
            {adminTab === 'schedule' && (
              <div className="space-y-6">
                                <div className="flex flex-wrap gap-2">
                  <button onClick={() => setShowAddScheduleModal(true)} className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded text-sm flex items-center gap-1.5 shadow-sm"><Plus className="w-4 h-4"/> הגדר שיעור פרטני</button>
                  <label className="px-4 py-2 bg-green-600 hover:bg-green-700 text-white font-bold rounded text-sm flex items-center gap-1.5 shadow-sm cursor-pointer">
                    <Upload className="w-4 h-4"/> ייבוא שיעורים מהאקסל
                    <input type="file" accept=".xlsx, .xls" className="hidden" onChange={handleSchedulesExcelUpload} />
                  </label>
                  <button onClick={handleDownloadSchedulesTemplate} className="px-4 py-2 bg-gray-100 border border-gray-300 hover:bg-gray-200 text-gray-700 font-bold rounded text-sm flex items-center gap-1.5 shadow-sm">
                    <Download className="w-4 h-4"/> הורד תבנית ריקה
                  </button>
                </div>
                
                {showAddScheduleModal && (
                  <div className="bg-gray-100 p-6 rounded-lg border border-blue-200 space-y-4">
                     <h4 className="font-bold text-gray-900 flex items-center gap-2">הוספת שעת שיעור פנויה</h4>
                     <form onSubmit={handleAddSchedule} className="grid sm:grid-cols-2 md:grid-cols-5 gap-4 items-end">
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
                       <div><label className="text-xs font-bold mb-1 block">שעות:</label><input type="text" value={newScheduleHour} onChange={e => setNewScheduleHour(e.target.value)} required className="w-full p-2 border rounded-lg"/></div>
                       <div><label className="text-xs font-bold mb-1 block">תלמיד/קבוצה:</label><input type="text" value={newScheduleStudent} onChange={e => setNewScheduleStudent(e.target.value)} required className="w-full p-2 border rounded-lg"/></div>
                       <div><label className="text-xs font-bold mb-1 block">מקצוע:</label><input type="text" value={newScheduleSubject} onChange={e => setNewScheduleSubject(e.target.value)} required className="w-full p-2 border rounded-lg"/></div>
                       
                       <div className="md:col-span-5 flex justify-end gap-2 mt-2">
                         <button type="submit" className="py-2.5 px-6 bg-green-600 text-white font-bold rounded-lg text-sm w-max">שמור</button>
                         <button type="button" onClick={() => setShowAddScheduleModal(false)} className="py-2.5 px-6 bg-gray-200 text-gray-700 font-bold rounded-lg text-sm w-max">בטל</button>
                       </div>
                     </form>
                  </div>
                )}

                {showAdminReportModal && adminReportingSchedule && (
                  <div className="bg-blue-50 p-6 rounded-lg border border-blue-200 space-y-4">
                     <h4 className="font-bold text-gray-900 flex items-center gap-2"><Edit3 className="w-5 h-5 text-blue-600" /> דיווח מנהל לשיעור ({adminReportingSchedule.studentName} / יום {adminReportingSchedule.day})</h4>
                     <form onSubmit={handleAdminSubmitReport} className="grid sm:grid-cols-2 md:grid-cols-4 gap-4 items-end">
                       <div>
                         <label className="text-xs font-bold text-gray-600 block mb-1">תאריך השיעור:</label>
                         <input type="date" value={reportDate} onChange={e => setReportDate(e.target.value)} className="w-full p-2 border rounded bg-white focus:ring-2 focus:ring-blue-500 outline-none" required />
                       </div>
                       <div>
                          <label className="text-xs font-bold text-gray-600 block mb-1">התקיים בפועל?</label>
                          <select value={reportStatus} onChange={e => setReportStatus(e.target.value as 'completed'|'missed')} className="w-full p-2 border rounded bg-white focus:ring-2 focus:ring-blue-500 outline-none">
                            <option value="completed">כן, התקיים</option>
                            <option value="missed">לא, בוטל</option>
                          </select>
                       </div>
                       <div className="md:col-span-2">
                         <label className="text-xs font-bold text-gray-600 block mb-1">פירוט (מה התבצע או סיבת ביטול):</label>
                         <input type="text" value={reportText} onChange={e => setReportText(e.target.value)} className="w-full p-2 border rounded bg-white focus:ring-2 focus:ring-blue-500 outline-none" required />
                       </div>
                       <div className="md:col-span-4 flex justify-end gap-2 mt-2">
                         <button type="submit" className="py-2.5 px-6 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-lg text-sm w-max">שלח דיווח מנהל</button>
                         <button type="button" onClick={() => { setShowAdminReportModal(false); setAdminReportingSchedule(null); }} className="py-2.5 px-6 bg-gray-200 hover:bg-gray-300 text-gray-700 font-bold rounded-lg text-sm w-max">בטל</button>
                       </div>
                     </form>
                  </div>
                )}
                
                <div className="bg-white rounded-lg border border-gray-200 shadow-sm flex-1 overflow-hidden">
                  <table className="w-full text-right border-collapse">
                    <thead>
                      <tr className="bg-gray-50 border-b text-xs text-gray-500 uppercase"><th className="px-6 py-4">יום</th><th className="px-6 py-4">שעה</th><th className="px-6 py-4">מורה</th><th className="px-6 py-4">תלמיד</th><th className="px-6 py-4">מקצוע</th><th className="px-6 py-4">מחק</th></tr>
                    </thead>
                    <tbody className="divide-y text-sm">
                      {schedule.map(s => {
                         const teacher = teachers.find(t => t.id === s.teacherId);
                         return (
                           <tr key={s.id} className="hover:bg-blue-50/30 transition-colors">
                             <td className="px-6 py-4 font-bold text-gray-700">{s.day}</td>
                             <td className="px-6 py-4 font-mono text-xs text-gray-700">{s.hour}</td>
                             <td className="px-6 py-4 font-bold">{teacher?.name || 'לא נמצא'}</td>
                             <td className="px-6 py-4 text-gray-800">{s.studentName}</td>
                             <td className="px-6 py-4">{s.subject}</td>
                             <td className="px-6 py-4">
                                <div className="flex gap-2 justify-end">
                                  <button onClick={() => { setAdminReportingSchedule(s); setReportDate(new Date().toISOString().split('T')[0]); setReportText(''); setReportStatus('completed'); setShowAdminReportModal(true); }} className="p-1.5 text-blue-600 hover:bg-blue-50 rounded" title="דווח שיעור למורה זה"><ClipboardCheck className="w-4 h-4"/></button>
                                  <button onClick={() => setScheduleToEdit(s)} className="p-1.5 text-green-600 hover:bg-green-50 rounded" title="ערוך שיעור"><Edit3 className="w-4 h-4"/></button>
                                  <button onClick={() => handleDeleteSchedule(s.id)} className="p-1.5 text-red-500 hover:bg-red-50 rounded" title="מחק שיעור"><Trash2 className="w-4 h-4"/></button>
                                </div>
                             </td>
                           </tr>
                         )
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* TAB: TIMETABLE */}
            {adminTab === 'timetable' && (
              <div className="bg-white rounded-lg border border-gray-200 shadow-sm overflow-x-auto p-4">
                <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-4 gap-4">
                  <h3 className="font-bold text-lg text-gray-800">מערכת שעות שבועית</h3>
                  <div className="flex items-center gap-2">
                    <button onClick={() => { const d = new Date(timetableWeekStart); d.setDate(d.getDate() - 7); setTimetableWeekStart(d); }} className="px-3 py-1 bg-gray-100 hover:bg-gray-200 rounded font-bold text-sm">שבוע קודם</button>
                    <span className="font-bold text-gray-800 bg-blue-50 px-3 py-1 rounded border border-blue-100">שבוע של {formatDateLocal(timetableWeekStart)}</span>
                    <button onClick={() => { const d = new Date(timetableWeekStart); d.setDate(d.getDate() + 7); setTimetableWeekStart(d); }} className="px-3 py-1 bg-gray-100 hover:bg-gray-200 rounded font-bold text-sm">שבוע הבא</button>
                    <button onClick={() => setTimetableWeekStart(getSunday(new Date()))} className="px-3 py-1 bg-blue-600 hover:bg-blue-700 text-white rounded font-bold text-sm mr-2 shadow-sm">השבוע הנוכחי</button>
                  </div>
                </div>
                <div className="min-w-[800px]">
                  <table className="w-full text-right border-collapse">
                    <thead>
                      <tr>
                        <th className="border p-2 bg-gray-100 text-center w-20">שעה \ יום</th>
                        {['ראשון', 'שני', 'שלישי', 'רביעי', 'חמישי', 'שישי'].map((day, idx) => {
                          const d = new Date(timetableWeekStart);
                          d.setDate(d.getDate() + idx);
                          return (
                            <th key={day} className="border p-2 bg-gray-100 text-center min-w-[120px]">
                              {day}<br/><span className="text-xs font-normal text-gray-500">{formatDateLocal(d)}</span>
                            </th>
                          );
                        })}
                      </tr>
                    </thead>
                    <tbody>
                      {[0, 1, 2, 3, 4, 5, 6, 7, 8, 9].map(hourNum => {
                        const hourStr = hourNum.toString();
                        return (
                          <tr key={hourStr}>
                            <td className="border p-2 font-bold text-center bg-gray-50">{hourStr}</td>
                            {['ראשון', 'שני', 'שלישי', 'רביעי', 'חמישי', 'שישי'].map((day, idx) => {
                              const cellDateObj = new Date(timetableWeekStart);
                              cellDateObj.setDate(cellDateObj.getDate() + idx);
                              const cellDateStr = formatDateLocal(cellDateObj);
                              
                              const classSchedules = schedule.filter(s => s.day === day && s.hour === hourStr);
                              return (
                                <td key={day} className="border p-2 min-h-[80px] align-top bg-white">
                                  <div className="flex flex-col gap-2">
                                    {classSchedules.map(s => {
                                      const teacher = teachers.find(t => t.id === s.teacherId);
                                      const weeklyReport = reports.find(r => r.scheduleId === s.id && r.date === cellDateStr);
                                      
                                      let statusBadge = <span className="inline-flex items-center gap-1 text-[10px] bg-gray-100 text-gray-500 px-1 py-0.5 rounded break-all">לא דווח</span>;
                                      if (weeklyReport) {
                                        if (weeklyReport.status === 'completed') {
                                          statusBadge = <span className="inline-flex items-center gap-1 text-[10px] bg-green-100 text-green-800 px-1 py-0.5 rounded break-all"><CheckCircle className="w-3 h-3 shrink-0"/> בוצע</span>;
                                        } else {
                                          statusBadge = <span className="inline-flex items-center gap-1 text-[10px] bg-red-100 text-red-800 px-1 py-0.5 rounded break-all"><XCircle className="w-3 h-3 shrink-0"/> בוטל</span>;
                                        }
                                      }

                                      return (
                                        <div key={s.id} className={`text-xs border rounded p-1.5 shadow-sm ${weeklyReport ? (weeklyReport.status === 'completed' ? 'bg-green-50 border-green-200' : 'bg-red-50 border-red-200') : 'bg-gray-50 border-gray-200'}`}>
                                          <div className="font-bold text-blue-800">{teacher?.name || 'לא ידוע'}</div>
                                          <div className="text-gray-700 font-semibold">{s.studentName}</div>
                                          <div className="text-gray-500">{s.subject}</div>
                                          <div className="mt-1 flex justify-between items-center">
                                            {statusBadge}
                                            {!weeklyReport && (
                                              <button onClick={() => { setAdminReportingSchedule(s); setReportDate(cellDateStr); setReportText(''); setReportStatus('completed'); setShowAdminReportModal(true); }} className="text-blue-600 hover:bg-blue-100 px-1 rounded transition" title="דווח שיעור עבור תאריך זה המשוייך לשבוע זה"><ClipboardCheck className="w-3 h-3"/></button>
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
            )}

            {/* TAB: REPORTS */}
            {adminTab === 'reports' && (
              <div className="space-y-6">
                <div className="bg-white p-6 rounded-lg shadow-sm border">
                    <h4 className="font-bold text-gray-900 text-sm mb-4">סנן דיווחי שיעור</h4>
                    <div className="grid sm:grid-cols-2 md:grid-cols-4 gap-4">
                       <div><label className="text-xs font-bold block mb-1">מורה:</label><select className="w-full p-2 border rounded-lg bg-gray-50" value={filterTeacher} onChange={e => setFilterTeacher(e.target.value)}><option value="all">הכל</option>{teachers.map(t=><option key={t.id} value={t.id}>{t.name}</option>)}</select></div>
                       <div><label className="text-xs font-bold block mb-1">סטטוס:</label><select className="w-full p-2 border rounded-lg bg-gray-50" value={filterStatus} onChange={e => setFilterStatus(e.target.value)}><option value="all">הכל</option><option value="completed">התקיים</option><option value="missed">בוטל</option></select></div>
                       <div className="col-span-2"><label className="text-xs font-bold block mb-1">חיפוש חופשי:</label><input className="w-full p-2 border rounded-lg outline-none focus:ring-2 focus:ring-blue-500" value={searchStudent} onChange={e=>setSearchStudent(e.target.value)} placeholder="שם תלמיד, מקצוע..." /></div>
                    </div>
                </div>

                <div className="bg-white rounded-lg border border-gray-200 shadow-sm flex-1 overflow-hidden">
                  <div className="p-5 border-b bg-gray-50 flex justify-between">
                     <span className="font-bold text-sm">נמצאו {filteredReportsList.length} דיווחים</span>
                     <div className="flex gap-2"><button onClick={() => window.print()} className="text-xs font-bold flex items-center gap-1 bg-gray-800 text-white rounded-full px-3 py-1 hidden sm:flex"><Download className="w-3 h-3"/> הדפס (PDF)</button><button onClick={handleExportReports} className="text-xs font-bold flex items-center gap-1 bg-green-600 text-white rounded-full px-3 py-1"><Download className="w-3 h-3"/> ייצוא לאקסל</button></div>
                  </div>
                  <table className="w-full text-right border-collapse">
                    <thead>
                      <tr className="bg-gray-50 text-xs font-bold text-gray-500 border-b">
                        <th className="px-6 py-4">תאריך</th><th className="px-6 py-4">מורה</th><th className="px-6 py-4">תלמיד</th><th className="px-6 py-4">מקצוע</th><th className="px-6 py-4">סטטוס</th><th className="px-6 py-4">פירוט</th><th className="px-6 py-4"></th>
                      </tr>
                    </thead>
                    <tbody className="divide-y text-sm">
                      {filteredReportsList.map(rep => {
                         const sched = schedule.find(s => s.id === rep.scheduleId);
                         const teach = teachers.find(t => t.id === rep.teacherId);
                         return (
                           <tr key={rep.id} className="hover:bg-blue-50/30 transition-colors">
                             <td className="px-6 py-4">{rep.date}</td>
                             <td className="px-6 py-4 font-bold">{teach?.name || '-'}</td>
                             <td className="px-6 py-4">{sched?.studentName || 'נמחק'}</td>
                             <td className="px-6 py-4">{sched?.subject || '-'}</td>
                             <td className="px-6 py-4"><span className={`px-2 py-1 rounded text-xs font-bold ${rep.status==='completed' ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>{rep.status==='completed' ? 'התקיים' : 'בוטל'}</span></td>
                             <td className="px-6 py-4 italic max-w-xs">{rep.text}</td><td className="px-6 py-4"><button onClick={() => handleDeleteReport(rep.id)} className="p-1.5 text-red-500 hover:bg-red-50 rounded"><Trash2 className="w-4 h-4"/></button></td>
                           </tr>
                         )
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* TAB: OVERVIEW */}
            {adminTab === 'overview' && (
              <div className="space-y-8">
                 <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  <div className="bg-white p-5 rounded border">
                    <span className="text-gray-400 text-xs font-bold">סך השיעורים השבועיים</span>
                    <h3 className="text-3xl font-bold text-[#111827]">{totalClassesPlanned}</h3>
                  </div>
                  <div className="bg-white p-5 rounded border">
                    <span className="text-gray-400 text-xs font-bold">דיווחים שהוזנו</span>
                    <h3 className="text-3xl font-bold text-indigo-700">{totalReportsSubmitted}</h3>
                  </div>
                  <div className="bg-white p-5 rounded border">
                    <span className="text-gray-400 text-xs font-bold">שיעורים שהתקיימו</span>
                    <h3 className="text-3xl font-bold text-green-600">{completedReports}</h3>
                  </div>
                  <div className="bg-white p-5 rounded border">
                    <span className="text-gray-400 text-xs font-bold">אחוז קיום</span>
                    <h3 className="text-3xl font-bold text-amber-600">{complianceRate}%</h3>
                  </div>
                </div>
                {/* Stats more if needed */}
              </div>
            )}
          </div>
        )}
      </main>

      <footer className="bg-gray-900 text-gray-400 py-6 border-t border-gray-800 text-center text-xs mt-auto">
        <p>ישיבת צביה אלישיב לוד © {new Date().getFullYear()} • מערכת דיווחים</p>
      </footer>

      
      {/* Edit Teacher Modal */}
      {teacherToEdit && (
        <div className="fixed inset-0 bg-black/50 flex justify-center items-center p-4 z-50">
          <div className="bg-white rounded-lg shadow-xl w-full max-w-md p-6">
            <h2 className="text-xl font-bold mb-4">עריכת מורה: {teacherToEdit.name}</h2>
            <form onSubmit={handleEditTeacherSubmit} className="space-y-4">
              <div><label className="text-sm font-bold mb-1 block">שם מלא:</label><input type="text" value={teacherToEdit.name} onChange={e => setTeacherToEdit({...teacherToEdit, name: e.target.value})} required className="w-full border rounded p-2"/></div>
              <div><label className="text-sm font-bold mb-1 block">אימייל (Microsoft/Google):</label><input type="email" value={teacherToEdit.email} onChange={e => setTeacherToEdit({...teacherToEdit, email: e.target.value})} required className="w-full border rounded p-2 text-left" dir="ltr"/></div>
              <div><label className="text-sm font-bold mb-1 block">תחום לימוד / מקצוע (רשות):</label><input type="text" value={teacherToEdit.subject} onChange={e => setTeacherToEdit({...teacherToEdit, subject: e.target.value})} className="w-full border rounded p-2"/></div>
              <div className="flex justify-end gap-3 pt-4 border-t">
                <button type="button" onClick={() => setTeacherToEdit(null)} className="px-4 py-2 bg-gray-100 hover:bg-gray-200 rounded font-bold">ביטול</button>
                <button type="submit" className="px-4 py-2 bg-green-600 hover:bg-green-700 text-white rounded font-bold">שמור שינויים</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Edit Schedule Modal */}
      {scheduleToEdit && (
        <div className="fixed inset-0 bg-black/50 flex justify-center items-center p-4 z-50">
          <div className="bg-white rounded-lg shadow-xl w-full max-w-md p-6">
            <h2 className="text-xl font-bold mb-4">עריכת שיעור פרטני</h2>
            <form onSubmit={handleEditScheduleSubmit} className="space-y-4">
              <div>
                <label className="text-sm font-bold mb-1 block">מורה משובץ:</label>
                <select value={scheduleToEdit.teacherId} onChange={e => setScheduleToEdit({...scheduleToEdit, teacherId: e.target.value})} required className="w-full p-2 border rounded-lg bg-white">
                  <option value="" disabled>-- בחר מורה --</option>
                  {teachers.map(t => (
                    <option key={t.id} value={t.id}>{t.name}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="text-sm font-bold mb-1 block">שם תלמיד:</label>
                <input type="text" value={scheduleToEdit.studentName} onChange={e => setScheduleToEdit({...scheduleToEdit, studentName: e.target.value})} required className="w-full p-2 border rounded-lg"/>
              </div>
              <div>
                <label className="text-sm font-bold mb-1 block">מקצוע הנלמד:</label>
                <input type="text" value={scheduleToEdit.subject} onChange={e => setScheduleToEdit({...scheduleToEdit, subject: e.target.value})} required className="w-full p-2 border rounded-lg"/>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-sm font-bold mb-1 block">יום בשבוע:</label>
                  <select value={scheduleToEdit.day} onChange={e => setScheduleToEdit({...scheduleToEdit, day: e.target.value})} required className="w-full p-2 border rounded-lg bg-white">
                    <option value="" disabled>-- בחר יום --</option>
                    {['ראשון', 'שני', 'שלישי', 'רביעי', 'חמישי', 'שישי'].map(d => (
                      <option key={d} value={d}>{d}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="text-sm font-bold mb-1 block">שעות (לדוגמה: משבצת 2 או 14:00):</label>
                  <input type="text" value={scheduleToEdit.hour} onChange={e => setScheduleToEdit({...scheduleToEdit, hour: e.target.value})} required className="w-full p-2 border rounded-lg"/>
                </div>
              </div>
              <div className="flex justify-end gap-3 pt-4 border-t">
                <button type="button" onClick={() => setScheduleToEdit(null)} className="px-4 py-2 bg-gray-100 hover:bg-gray-200 rounded font-bold">ביטול</button>
                <button type="submit" className="px-4 py-2 bg-green-600 hover:bg-green-700 text-white rounded font-bold">שמור שינויים</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Delete Modals */}
      {teacherToDelete && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-lg p-6 max-w-sm w-full shadow-xl">
            <h3 className="font-bold text-lg mb-2 text-gray-900">אישור מחיקה</h3>
            <p className="text-gray-600 mb-6">האם אתה בטוח שברצונך למחוק את {teacherToDelete.name}?</p>
            <div className="flex gap-3 justify-end">
              <button onClick={() => setTeacherToDelete(null)} className="px-4 py-2 bg-gray-100 hover:bg-gray-200 text-gray-800 rounded font-bold">ביטול</button>
              <button onClick={confirmDeleteTeacher} className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded font-bold">מחק מורה</button>
            </div>
          </div>
        </div>
      )}

      
      {reportToDelete && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-lg p-6 max-w-sm w-full shadow-xl">
            <h3 className="font-bold text-lg mb-2 text-gray-900">אישור מחיקה</h3>
            <p className="text-gray-600 mb-6">האם אתה בטוח שברצונך למחוק דיווח זה מהמערכת?</p>
            <div className="flex gap-3 justify-end">
              <button onClick={() => setReportToDelete(null)} className="px-4 py-2 bg-gray-100 hover:bg-gray-200 text-gray-800 rounded font-bold">ביטול</button>
              <button onClick={confirmDeleteReport} className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded font-bold">מחק דיווח</button>
            </div>
          </div>
        </div>
      )}

      {scheduleToDelete && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-lg p-6 max-w-sm w-full shadow-xl">
            <h3 className="font-bold text-lg mb-2 text-gray-900">אישור מחיקה</h3>
            <p className="text-gray-600 mb-6">האם אתה בטוח שברצונך למחוק שעת שיעור זו מהמערכת?</p>
            <div className="flex gap-3 justify-end">
              <button onClick={() => setScheduleToDelete(null)} className="px-4 py-2 bg-gray-100 hover:bg-gray-200 text-gray-800 rounded font-bold">ביטול</button>
              <button onClick={confirmDeleteSchedule} className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded font-bold">מחק שיעור</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default App;
