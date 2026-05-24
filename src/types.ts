export interface Teacher {
  id: string;
  name: string;
  email: string;
  subject: string;
  active: boolean;
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
