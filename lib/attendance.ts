
import { parseQRPayload } from './qr';
import { supabase } from './supabase';

export type AttendanceRecord = {
  id: string;
  eventId: string;
  eventTitle: string;
  scannedAt: string;
  status: string;
};

export type RegisterResult = {
  success: boolean;
  message: string;
  eventTitle?: string;
};

export async function registerAttendance(
  rawPayload: string
): Promise<RegisterResult> {
  const parsed = parseQRPayload(rawPayload);

  if (!parsed.ok) {
    return {
      success: false,
      message: parsed.message,
    };
  }

  const { data: { user }, error: userError } = await supabase.auth.getUser();
  if (userError || !user) {
    return { success: false, message: 'Please sign in before recording attendance.' };
  }

  const { data, error } = await supabase.rpc('record_attendance', {
    p_event_code: parsed.payload.event,
  });
  if (error) {
    if (error.code === '23505') {
      return { success: false, message: 'You have already attended this event.' };
    }
    if (error.code === 'P0002') {
      return { success: false, message: 'This QR code does not match an event.' };
    }
    if (error.code === '42501') {
      return { success: false, message: 'Only student accounts can record attendance.' };
    }
    if (error.code === 'P0001') {
      return { success: false, message: error.message };
    }
    return { success: false, message: 'Could not record attendance. Please try again.' };
  }

  const result = Array.isArray(data) ? data[0] : data;
  return {
    success: true,
    message: 'Attendance recorded!',
    eventTitle: result?.event_title,
  };
}

export async function getAttendanceHistory(
  studentId: string
): Promise<AttendanceRecord[]> {
  const { data, error } = await supabase
    .from('attendance')
    .select('id, attendance_time, status, events(event_code, title)')
    .eq('student_id', studentId)
    .order('attendance_time', { ascending: false });

  if (error) {
    throw new Error(error.message);
  }
  if (!data) {
    return [];
  }

  return data.map((row: any) => ({
    id: row.id,
    eventId: row.events?.event_code ?? '',
    eventTitle: row.events?.title ?? '',
    scannedAt: row.attendance_time,
    status: row.status,
  }));
}

export type TeacherEventAttendance = {
  eventId: string;
  eventCode: string;
  title: string;
  startTime: string | null;
  endTime: string | null;
  attendeeCount: number;
  attendees: {
    studentId: string;
    studentName: string | null;
    scannedAt: string;
  }[];
};

export type TeacherEventSummary = {
  eventId: string;
  eventCode: string;
  title: string;
  attendeeCount: number;
};

export async function getTeacherEventAttendance(
  teacherId: string
): Promise<TeacherEventAttendance[]> {
  const { data: events, error: eventError } = await supabase
    .from('events')
    .select('id, event_code, title, start_time, end_time')
    .eq('created_by', teacherId)
    .order('created_at', { ascending: false });

  if (eventError) {
    throw new Error(eventError.message);
  }
  if (!events) {
    return [];
  }

  const eventIds = events.map((event: any) => event.id);

  if (eventIds.length === 0) {
    return [];
  }

  const { data: attendance, error: attError } = await supabase
    .from('attendance')
    .select('student_id, attendance_time, event_id')
    .in('event_id', eventIds)
    .order('attendance_time', { ascending: false });

  if (attError) {
    throw new Error(attError.message);
  }
  if (!attendance) {
    return [];
  }

  const studentIds = [
    ...new Set(
      attendance.map((record: any) => record.student_id)
    ),
  ];

  const { data: profilesData, error: profileError } =
    studentIds.length > 0
      ? await supabase
          .from('profiles')
          .select('id, full_name, email')
          .in('id', studentIds)
      : { data: null, error: null };
  if (profileError) {
    throw new Error(profileError.message);
  }

  const profilesById = new Map(
    (profilesData ?? []).map((profile: any) => [
      profile.id,
      profile,
    ])
  );

  return events.map((event: any) => {
    const rows = attendance.filter(
      (record: any) => record.event_id === event.id
    );

    return {
      eventId: event.id,
      eventCode: event.event_code,
      title: event.title,
      startTime: event.start_time,
      endTime: event.end_time,
      attendeeCount: rows.length,

      attendees: rows.map((record: any) => ({
        studentId: record.student_id,
        studentName:
          profilesById.get(record.student_id)?.full_name ?? null,
        scannedAt: record.attendance_time,
      })),
    };
  });
}

export async function getTeacherEventSummary(
  teacherId: string
): Promise<TeacherEventSummary[]> {
  const { data: events, error: eventError } = await supabase
    .from('events')
    .select('id, event_code, title')
    .eq('created_by', teacherId)
    .order('created_at', { ascending: false });

  if (eventError) {
    throw new Error(eventError.message);
  }
  if (!events) {
    return [];
  }

  const eventIds = events.map((event: any) => event.id);

  if (eventIds.length === 0) {
    return [];
  }

  const { data: attRows, error: attError } = await supabase
    .from('attendance')
    .select('event_id')
    .in('event_id', eventIds);

  if (attError) {
    throw new Error(attError.message);
  }
  if (!attRows) {
    return [];
  }

  const counts: Record<string, number> = {};

  attRows.forEach((row: any) => {
    counts[row.event_id] = (counts[row.event_id] ?? 0) + 1;
  });

  return events.map((event: any) => ({
    eventId: event.id,
    eventCode: event.event_code,
    title: event.title,
    attendeeCount: counts[event.id] ?? 0,
  }));
}
