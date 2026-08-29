import { collection, doc, getDocs, getDoc, setDoc, deleteDoc, query, where, onSnapshot, writeBatch } from 'firebase/firestore';
import { db } from '../firebase';
import { Teacher, Schedule, Report, Student, AdminUser } from '../types';
import { adminAddTeacher, adminDeleteTeacher, adminUpdateTeacher } from './admin-teachers-api';
import { handleFirestoreError, OperationType, reportFirestoreSnapshotError } from './firestore-errors';
import { PRIMARY_ADMIN_EMAIL } from './branding';
import { sortByHebrewName } from './students';

export function subscribeToStudents(callback: (students: Student[]) => void, errorCallback?: (err: Error) => void) {
  return onSnapshot(collection(db, 'students'), (snapshot) => {
    const students = sortByHebrewName(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Student)));
    callback(students);
  }, (error) => {
    reportFirestoreSnapshotError(error, OperationType.LIST, 'students');
    if (errorCallback) errorCallback(new Error(error.message));
  });
}

export function subscribeToTeachers(callback: (teachers: Teacher[]) => void, errorCallback?: (err: Error) => void) {
  return onSnapshot(collection(db, 'teachers'), (snapshot) => {
    const teachers = sortByHebrewName(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Teacher)));
    callback(teachers);
  }, (error) => {
    reportFirestoreSnapshotError(error, OperationType.LIST, 'teachers');
    if(errorCallback) errorCallback(new Error(error.message));
  });
}

export function subscribeToSchedules(teacherEmail: string | null, callback: (schedules: Schedule[]) => void, errorCallback?: (err: Error) => void) {
  let q = collection(db, 'schedules') as any;
  // null = admin view (all schedules). Otherwise filter to that teacher's email.
  if (teacherEmail) {
    q = query(q, where('teacherEmail', '==', teacherEmail));
  }
  return onSnapshot(q, (snapshot: any) => {
    const schedules = snapshot.docs.map((doc: any) => ({ id: doc.id, ...doc.data() } as Schedule));
    callback(schedules);
  }, (error: any) => {
    reportFirestoreSnapshotError(error, OperationType.LIST, 'schedules');
    if(errorCallback) errorCallback(new Error(error.message));
  });
}

export function subscribeToReports(teacherEmail: string | null, callback: (reports: Report[]) => void, errorCallback?: (err: Error) => void) {
  let q = collection(db, 'reports') as any;
  if (teacherEmail) {
    q = query(q, where('teacherEmail', '==', teacherEmail));
  }
  return onSnapshot(q, (snapshot: any) => {
    const reports = snapshot.docs.map((doc: any) => ({ id: doc.id, ...doc.data() } as Report));
    callback(reports);
  }, (error: any) => {
    reportFirestoreSnapshotError(error, OperationType.LIST, 'reports');
    if(errorCallback) errorCallback(new Error(error.message));
  });
}

export async function addStudent(student: Omit<Student, 'id'>) {
  try {
    const newDocRef = doc(collection(db, 'students'));
    await setDoc(newDocRef, student);
    return newDocRef.id;
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, 'students');
  }
}

export async function updateStudent(id: string, updates: Partial<Student>) {
  try {
    await setDoc(doc(db, 'students', id), updates, { merge: true });
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, `students/${id}`);
  }
}

export async function deleteStudent(id: string) {
  try {
    await deleteDoc(doc(db, 'students', id));
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, `students/${id}`);
  }
}

export async function addTeacher(teacher: Omit<Teacher, 'id'>) {
  // Admin SDK via API — client Firestore rules were blocking admin writes in production.
  try {
    return await adminAddTeacher(teacher);
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, 'teachers');
  }
}

export async function updateTeacher(id: string, updates: Partial<Teacher>) {
  try {
    const { id: _ignore, ...fields } = updates as Partial<Teacher> & { id?: string };
    await adminUpdateTeacher(id, fields);
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, `teachers/${id}`);
  }
}

export async function deleteTeacher(id: string) {
  try {
    await adminDeleteTeacher(id);
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, `teachers/${id}`);
  }
}

export async function addSchedule(schedule: Omit<Schedule, 'id'>) {
  try {
    const newDocRef = doc(collection(db, 'schedules'));
    await setDoc(newDocRef, schedule);
    return newDocRef.id;
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, 'schedules');
  }
}

export async function updateSchedule(id: string, updates: Partial<Schedule>) {
  try {
    await setDoc(doc(db, 'schedules', id), updates, { merge: true });
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, `schedules/${id}`);
  }
}

export async function deleteReportsForSchedule(scheduleId: string) {
  try {
    const q = query(collection(db, 'reports'), where('scheduleId', '==', scheduleId));
    const snapshot = await getDocs(q);
    await Promise.all(snapshot.docs.map((reportDoc) => deleteDoc(reportDoc.ref)));
    return snapshot.size;
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, `reports?scheduleId=${scheduleId}`);
  }
}

export async function deleteSchedule(id: string) {
  try {
    await deleteReportsForSchedule(id);
    await deleteDoc(doc(db, 'schedules', id));
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, `schedules/${id}`);
  }
}

export async function addReport(report: Omit<Report, 'id'>) {
  try {
    const newDocRef = doc(collection(db, 'reports'));
    await setDoc(newDocRef, report);
    return newDocRef.id;
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, 'reports');
  }
}

export async function updateReport(id: string, data: Partial<Omit<Report, 'id'>>) {
  try {
    await setDoc(doc(db, 'reports', id), data, { merge: true });
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, `reports/${id}`);
  }
}

export async function deleteReport(id: string) {
  try {
    await deleteDoc(doc(db, 'reports', id));
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, `reports/${id}`);
  }
}

export function subscribeToSettings(callback: (settings: any) => void) {
  return onSnapshot(
    doc(db, 'settings', 'general'),
    (snapshot) => {
      if (snapshot.exists()) {
        callback(snapshot.data());
      } else {
        callback({});
      }
    },
    (error) => {
      reportFirestoreSnapshotError(error, OperationType.GET, 'settings/general');
    },
  );
}

export async function updateSettings(settings: any) {
  try {
    await setDoc(doc(db, 'settings', 'general'), settings, { merge: true });
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, 'settings/general');
  }
}

/** Watch whether a specific email has an admins/{email} document. */
export function subscribeToAdminMembership(
  email: string | null | undefined,
  callback: (isMember: boolean) => void,
) {
  const normalized = (email || '').trim().toLowerCase();
  if (!normalized) {
    callback(false);
    return () => {};
  }
  if (normalized === PRIMARY_ADMIN_EMAIL.toLowerCase()) {
    callback(true);
    return () => {};
  }
  return onSnapshot(
    doc(db, 'admins', normalized),
    (snapshot) => callback(snapshot.exists()),
    (error) => {
      reportFirestoreSnapshotError(error, OperationType.GET, `admins/${normalized}`);
      callback(false);
    },
  );
}

/** List all secondary admins (requires admin privileges). */
export function subscribeToAdmins(
  callback: (admins: AdminUser[]) => void,
  errorCallback?: (err: Error) => void,
) {
  return onSnapshot(
    collection(db, 'admins'),
    (snapshot) => {
      const admins = snapshot.docs.map((d) => {
        const data = d.data() as { email?: string; name?: string };
        return {
          id: d.id,
          email: (data.email || d.id).toLowerCase(),
          name: data.name || '',
        } as AdminUser;
      });
      callback(sortByHebrewName(admins));
    },
    (error) => {
      reportFirestoreSnapshotError(error, OperationType.LIST, 'admins');
      if (errorCallback) errorCallback(new Error(error.message));
    },
  );
}

export async function addAdmin(email: string, name: string) {
  const normalized = email.trim().toLowerCase();
  if (!normalized) throw new Error('נא להזין אימייל');
  try {
    await setDoc(doc(db, 'admins', normalized), {
      email: normalized,
      name: name.trim() || normalized,
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, `admins/${normalized}`);
  }
}

export async function deleteAdmin(email: string) {
  const normalized = email.trim().toLowerCase();
  if (normalized === PRIMARY_ADMIN_EMAIL.toLowerCase()) {
    throw new Error('לא ניתן להסיר את מנהל־העל');
  }
  try {
    await deleteDoc(doc(db, 'admins', normalized));
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, `admins/${normalized}`);
  }
}

/** Apply many student updates in chunks of ≤400 (Firestore batch limit is 500). */
export async function batchUpdateStudents(
  updates: Array<{ id: string; data: Partial<Omit<Student, 'id'>> }>,
) {
  const CHUNK = 400;
  try {
    for (let i = 0; i < updates.length; i += CHUNK) {
      const slice = updates.slice(i, i + CHUNK);
      const batch = writeBatch(db);
      for (const item of slice) {
        batch.set(doc(db, 'students', item.id), item.data, { merge: true });
      }
      await batch.commit();
    }
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, 'students (batch)');
  }
}

