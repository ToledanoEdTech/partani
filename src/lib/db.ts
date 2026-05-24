import { collection, doc, getDocs, getDoc, setDoc, deleteDoc, query, where, onSnapshot } from 'firebase/firestore';
import { db } from '../firebase';
import { Teacher, Schedule, Report } from '../types';
import { handleFirestoreError, OperationType, reportFirestoreSnapshotError } from './firestore-errors';

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

export async function addTeacher(teacher: Omit<Teacher, 'id'>) {
  try {
    const newDocRef = doc(collection(db, 'teachers'));
    await setDoc(newDocRef, teacher);
    return newDocRef.id;
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, 'teachers');
  }
}

export async function updateTeacher(id: string, updates: Partial<Teacher>) {
  try {
    await setDoc(doc(db, 'teachers', id), updates, { merge: true });
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, `teachers/${id}`);
  }
}

export async function deleteTeacher(id: string) {
  try {
    await deleteDoc(doc(db, 'teachers', id));
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

export async function deleteSchedule(id: string) {
  try {
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
