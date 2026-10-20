import { useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { FlatList, StyleSheet, Text, View } from 'react-native';

import { COLORS } from '@/constants/colors';
import { useAuth } from '@/lib/auth';
import {
  getAttendanceHistory,
  getTeacherEventAttendance,
  type AttendanceRecord,
  type TeacherEventAttendance,
} from '@/lib/attendance';
import { getAdminAttendance, type AdminAttendance } from '@/lib/admin';
import { getProfile, type Role } from '@/lib/profiles';

export default function HistoryScreen() {
  const { user } = useAuth();

  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [role, setRole] = useState<Role | null>(null);
  const [studentRecords, setStudentRecords] = useState<AttendanceRecord[]>([]);
  const [teacherEvents, setTeacherEvents] = useState<TeacherEventAttendance[]>([]);
  const [adminRecords, setAdminRecords] = useState<AdminAttendance[]>([]);

  const load = useCallback(async () => {
    setLoadError(null);
    if (!user) {
      setLoading(false);
      return;
    }

    try {
      const profile = await getProfile(user.id);
      if (!profile) {
        throw new Error('Your account profile could not be found.');
      }
      const currentRole = profile.role;
      setRole(currentRole);

      if (currentRole === 'admin') {
        const records = await getAdminAttendance();
        setAdminRecords(records);
        setTeacherEvents([]);
        setStudentRecords([]);
      } else if (currentRole === 'teacher') {
        const events = await getTeacherEventAttendance(user.id);
        setTeacherEvents(events);
        setStudentRecords([]);
        setAdminRecords([]);
      } else {
        const records = await getAttendanceHistory(user.id);
        setStudentRecords(records);
        setTeacherEvents([]);
        setAdminRecords([]);
      }
    } catch (error) {
      setLoadError(
        error instanceof Error ? error.message : 'Could not load attendance records.'
      );
    }

    setLoading(false);
  }, [user]);

  useFocusEffect(
    useCallback(() => {
      setLoading(true);
      load();
    }, [load])
  );

  if (loading) {
    return (
      <View style={styles.container}>
        <Text style={styles.title}>Attendance History</Text>
        <Text style={styles.subtitle}>Loading records...</Text>
      </View>
    );
  }

  if (loadError) {
    return (
      <View style={styles.container}>
        <Text style={styles.title}>Attendance History</Text>
        <Text style={styles.subtitle}>{loadError}</Text>
      </View>
    );
  }

  if (role === 'admin') {
    return (
      <View style={styles.container}>
        <Text style={styles.title}>Attendance History</Text>

        {adminRecords.length === 0 ? (
          <Text style={styles.subtitle}>No attendance records yet.</Text>
        ) : (
          <FlatList
            data={adminRecords}
            keyExtractor={(item) => item.id}
            contentContainerStyle={styles.list}
            renderItem={({ item }) => (
              <View style={styles.card}>
                <Text style={styles.eventTitle}>
                  {item.student_name || 'Student name unavailable'}
                </Text>
                <Text style={styles.eventMeta}>{item.event_title}</Text>
                <Text style={styles.eventMeta}>
                  {item.student_email ?? 'Email unavailable'}
                </Text>
                <Text style={styles.eventMeta}>{formatDate(item.attendance_time)}</Text>
                <Text style={styles.eventMeta}>Status: {item.status}</Text>
              </View>
            )}
          />
        )}
      </View>
    );
  }

  if (role === 'teacher') {
    return (
      <View style={styles.container}>
        <Text style={styles.title}>Attendance History</Text>

        {teacherEvents.length === 0 ? (
          <Text style={styles.subtitle}>
            No events yet. Create an event from the Events tab.
          </Text>
        ) : (
          <FlatList
            data={teacherEvents}
            keyExtractor={(item) => item.eventId}
            contentContainerStyle={styles.list}
            renderItem={({ item }) => (
              <View style={styles.card}>
                <View style={styles.eventHeader}>
                  <Text style={styles.eventTitle}>{item.title}</Text>
                  <View style={styles.countBadge}>
                    <Text style={styles.countText}>{item.attendeeCount}</Text>
                  </View>
                </View>

                <Text style={styles.eventMeta}>{item.eventCode}</Text>

                {item.startTime && (
                  <Text style={styles.eventMeta}>{formatDate(item.startTime)}</Text>
                )}

                {item.attendees.length === 0 ? (
                  <Text style={styles.attendeeEmpty}>No attendees yet.</Text>
                ) : (
                  <View style={styles.attendeeList}>
                    {item.attendees.map((attendee) => (
                      <View key={attendee.studentId} style={styles.attendeeRow}>
                        <Text style={styles.attendeeName}>
                          {attendee.studentName || shortId(attendee.studentId)}
                        </Text>
                        <Text style={styles.eventMeta}>
                          {formatDate(attendee.scannedAt)}
                        </Text>
                      </View>
                    ))}
                  </View>
                )}
              </View>
            )}
          />
        )}
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Attendance History</Text>

      {studentRecords.length === 0 ? (
        <Text style={styles.subtitle}>
          No records yet. Scan a QR code to register your attendance.
        </Text>
      ) : (
        <FlatList
          data={studentRecords}
          keyExtractor={(item) => String(item.id)}
          contentContainerStyle={styles.list}
          renderItem={({ item }) => (
            <View style={styles.card}>
              <Text style={styles.eventTitle}>{item.eventTitle}</Text>
              <Text style={styles.eventMeta}>{item.eventId}</Text>
              <Text style={styles.eventMeta}>{formatDate(item.scannedAt)}</Text>
              <Text style={styles.eventMeta}>Status: {item.status}</Text>
            </View>
          )}
        />
      )}
    </View>
  );
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleString();
}

function shortId(id: string) {
  return id ? `\u2026${id.slice(-8)}` : 'unknown';
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.background,
    paddingHorizontal: 24,
    paddingTop: 24,
  },
  title: {
    fontSize: 20,
    fontWeight: '600',
    color: COLORS.textPrimary,
    marginBottom: 16,
  },
  subtitle: {
    fontSize: 14,
    color: COLORS.textSecondary,
    textAlign: 'center',
    lineHeight: 20,
    marginTop: 32,
  },
  list: {
    paddingBottom: 24,
  },
  card: {
    backgroundColor: COLORS.card,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: COLORS.border,
    padding: 16,
    marginBottom: 12,
  },
  eventHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  eventTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: COLORS.textPrimary,
    marginBottom: 4,
    flex: 1,
  },
  eventMeta: {
    fontSize: 13,
    color: COLORS.textSecondary,
    marginTop: 2,
  },
  countBadge: {
    backgroundColor: COLORS.surface,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 999,
    marginLeft: 12,
  },
  countText: {
    fontSize: 13,
    fontWeight: '600',
    color: COLORS.primary,
  },
  attendeeList: {
    marginTop: 12,
  },
  attendeeRow: {
    borderTopWidth: 1,
    borderTopColor: COLORS.border,
    paddingVertical: 10,
  },
  attendeeName: {
    fontSize: 14,
    fontWeight: '600',
    color: COLORS.textPrimary,
  },
  attendeeEmpty: {
    fontSize: 13,
    color: COLORS.textSecondary,
    marginTop: 12,
  },
});
