import { supabase } from './supabase';
import type { Role } from './profiles';

export type AdminProfile = {
  id: string;
  email: string;
  full_name: string | null;
  role: Role;
};

export type AdminEvent = {
  id: string;
  event_code: string;
  title: string;
  event_date: string;
  start_time: string | null;
  venue: string;
  status: 'open' | 'closed' | 'cancelled';
  created_by: string | null;
};

export type AdminAttendance = {
  id: string;
  student_id: string;
  event_id: string;
  attendance_time: string;
  status: 'present' | 'excused' | 'absent';
  student_name: string | null;
  student_email: string | null;
  event_title: string;
};

export type AdminSummary = {
  users: number;
  students: number;
  teachers: number;
  admins: number;
  events: number;
  attendance: number;
};

async function readCount(table: 'profiles' | 'events' | 'attendance') {
  const { count, error } = await supabase
    .from(table)
    .select('*', { count: 'exact', head: true });
  if (error) throw new Error(error.message);
  return count ?? 0;
}

export async function getAdminSummary(): Promise<AdminSummary> {
  const [users, students, teachers, admins, events, attendance] = await Promise.all([
    supabase.from('profiles').select('*', { count: 'exact', head: true }),
    supabase.from('profiles').select('*', { count: 'exact', head: true }).eq('role', 'student'),
    supabase.from('profiles').select('*', { count: 'exact', head: true }).eq('role', 'teacher'),
    supabase.from('profiles').select('*', { count: 'exact', head: true }).eq('role', 'admin'),
    readCount('events'),
    readCount('attendance'),
  ]);
  const countResults = [users, students, teachers, admins];
  const countError = countResults.find((result) => result.error)?.error;
  if (countError) throw new Error(countError.message);
  return {
    users: users.count ?? 0,
    students: students.count ?? 0,
    teachers: teachers.count ?? 0,
    admins: admins.count ?? 0,
    events,
    attendance,
  };
}

export async function getAdminUsers(): Promise<AdminProfile[]> {
  const { data, error } = await supabase
    .from('profiles')
    .select('id, email, full_name, role')
    .order('created_at', { ascending: false });
  if (error) throw new Error(error.message);
  return (data ?? []) as AdminProfile[];
}

export async function setAdminUserRole(userId: string, role: Role) {
  const { error } = await supabase.rpc('admin_set_user_role', {
    p_user_id: userId,
    p_role: role,
  });
  if (error) throw new Error(error.message);
}

export async function getAdminEvents(): Promise<AdminEvent[]> {
  const { data, error } = await supabase
    .from('events')
    .select('id, event_code, title, event_date, start_time, venue, status, created_by')
    .order('event_date', { ascending: false });
  if (error) throw new Error(error.message);
  return (data ?? []) as AdminEvent[];
}

export async function setAdminEventStatus(
  eventId: string,
  status: AdminEvent['status']
) {
  const { error } = await supabase
    .from('events')
    .update({ status })
    .eq('id', eventId);
  if (error) throw new Error(error.message);
}

export async function getAdminAttendance(): Promise<AdminAttendance[]> {
  const { data, error } = await supabase
    .from('attendance')
    .select(
      'id, student_id, event_id, attendance_time, status, profiles(full_name, email), events(title)'
    )
    .order('attendance_time', { ascending: false });
  if (error) throw new Error(error.message);
  return (data ?? []).map((row: any) => ({
    id: row.id,
    student_id: row.student_id,
    event_id: row.event_id,
    attendance_time: row.attendance_time,
    status: row.status,
    student_name: row.profiles?.full_name ?? null,
    student_email: row.profiles?.email ?? null,
    event_title: row.events?.title ?? 'Unknown event',
  }));
}

export async function correctAdminAttendance(
  attendanceId: string,
  status: AdminAttendance['status']
) {
  const { error } = await supabase.rpc('admin_correct_attendance', {
    p_attendance_id: attendanceId,
    p_status: status,
  });
  if (error) throw new Error(error.message);
}

export async function deleteAdminAttendance(attendanceId: string) {
  const { error } = await supabase.rpc('admin_delete_attendance', {
    p_attendance_id: attendanceId,
  });
  if (error) throw new Error(error.message);
}
