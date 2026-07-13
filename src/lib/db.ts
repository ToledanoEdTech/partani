import { collection, doc, getDocs, getDoc, setDoc, deleteDoc, query, where, onSnapshot } from 'firebase/firestore';
import { db } from '../firebase';
import { Teacher, Schedule, Report, Student } from '../types';
import { adminAddTeacher, adminDeleteTeacher, adminUpdateTeacher } from './admin-teachers-api';
import { handleFirestoreError, OperationType, reportFirestoreSnapshotError } from './firestore-errors';

export function subscribeToStudents(callback: (students: Student[]) => void, errorCallback?: (err: Error) => void) {
  return onSnapshot(collection(db, 'students'), (snapshot) => {
    const students = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Student));
    callback(students);
  }, (error) => {
    reportFirestoreSnapshotError(error, OperationType.LIST, 'students');
    if (errorCallback) errorCallback(new Error(error.message));
  });
}

export function subscribeToTeachers(callback: (teachers: Teacher[]) => void, errorCallback?: (err: Error) => void) {
  return onSnapshot(collection(db, 'teachers'), (snapshot) => {
    const teachers = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Teacher));
    callback(teachers);
  }, (error) => {
    reportFirestoreSnapshotError(error, OperationType.LIST, 'teachers');
    if(errorCallback) errorCallback(new Error(error.message));
  });
}

export function subscribeToSchedules(teacherEmail: string | null, callback: (schedules: Schedule[]) => void, errorCallback?: (err: Error) => void) {
  let q = collection(db, 'schedules') as any;
  if (teacherEmail && teacherEmail !== 'yossitole@gmail.com') { // Basic check, better handled by proper role context
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
  if (teacherEmail && teacherEmail !== 'yossitole@gmail.com') {
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
