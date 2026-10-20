import Ionicons from '@expo/vector-icons/Ionicons';
import { useFocusEffect } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

import { COLORS } from '@/constants/colors';
import { useAuth } from '@/lib/auth';
import {
  correctAdminAttendance,
  deleteAdminAttendance,
  getAdminAttendance,
  getAdminEvents,
  getAdminSummary,
  getAdminUsers,
  setAdminEventStatus,
  setAdminUserRole,
  type AdminAttendance,
  type AdminEvent,
  type AdminProfile,
  type AdminSummary,
} from '@/lib/admin';
import { getProfile, type Role } from '@/lib/profiles';

const ROLE_OPTIONS: Role[] = ['student', 'teacher', 'admin'];
const STATUS_OPTIONS: AdminAttendance['status'][] = [
  'present',
  'excused',
  'absent',
];

export default function AdminScreen() {
  const { user } = useAuth();
  const [authorized, setAuthorized] = useState(false);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [summary, setSummary] = useState<AdminSummary | null>(null);
  const [users, setUsers] = useState<AdminProfile[]>([]);
  const [events, setEvents] = useState<AdminEvent[]>([]);
  const [attendance, setAttendance] = useState<AdminAttendance[]>([]);
  const [query, setQuery] = useState('');

  const load = useCallback(async (refresh = false) => {
    if (!user) {
      setAuthorized(false);
      setLoading(false);
      return;
    }
    setError(null);
    if (refresh) setRefreshing(true);
    else setLoading(true);

    try {
      const profile = await getProfile(user.id);
      if (profile?.role !== 'admin') {
        setAuthorized(false);
        return;
      }
      setAuthorized(true);
      const [nextSummary, nextUsers, nextEvents, nextAttendance] =
        await Promise.all([
          getAdminSummary(),
          getAdminUsers(),
          getAdminEvents(),
          getAdminAttendance(),
        ]);
      setSummary(nextSummary);
      setUsers(nextUsers);
      setEvents(nextEvents);
      setAttendance(nextAttendance);
    } catch (loadError) {
      setError(
        loadError instanceof Error
          ? loadError.message
          : 'Could not load administrator data.'
      );
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [user]);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load])
  );

  const filteredUsers = useMemo(() => {
    const value = query.trim().toLowerCase();
    if (!value) return users;
    return users.filter((person) =>
      `${person.full_name ?? ''} ${person.email} ${person.role}`
        .toLowerCase()
        .includes(value)
    );
  }, [query, users]);

  const filteredEvents = useMemo(() => {
    const value = query.trim().toLowerCase();
    if (!value) return events;
    return events.filter((event) =>
      `${event.title} ${event.event_code} ${event.venue} ${event.status}`
        .toLowerCase()
        .includes(value)
    );
  }, [events, query]);

  const filteredAttendance = useMemo(() => {
    const value = query.trim().toLowerCase();
    if (!value) return attendance;
    return attendance.filter((record) =>
      `${record.student_name ?? ''} ${record.student_email ?? ''} ${record.event_title} ${record.attendance_time} ${record.status}`
        .toLowerCase()
        .includes(value)
    );
  }, [attendance, query]);

  const runAdminAction = async (action: () => Promise<void>) => {
    try {
      await action();
      await load(true);
    } catch (actionError) {
      Alert.alert(
        'Action failed',
        actionError instanceof Error
          ? actionError.message
          : 'The administrator action could not be completed.'
      );
    }
  };

  const askForRole = (person: AdminProfile) => {
    const actions = ROLE_OPTIONS.map((role) => ({
      text: roleLabel(role),
      onPress: () =>
        void runAdminAction(() => setAdminUserRole(person.id, role)),
    }));
    Alert.alert(
      'Change user role',
      `Choose a role for ${person.full_name || person.email}.`,
      actions
    );
  };

  const askForAttendanceStatus = (record: AdminAttendance) => {
    const actions = STATUS_OPTIONS.map((status) => ({
      text: roleLabel(status),
      onPress: () =>
        void runAdminAction(() =>
          correctAdminAttendance(record.id, status)
        ),
    }));
    Alert.alert(
      'Correct attendance',
      `Select a status for ${record.student_name ?? 'this student'} at ${record.event_title}.`,
      actions
    );
  };

  const confirmDeleteAttendance = (record: AdminAttendance) => {
    Alert.alert(
      'Delete attendance record?',
      `Delete ${record.student_name ?? 'this student'}'s record for ${record.event_title}? This action is audited and cannot be undone.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: () =>
            void runAdminAction(() => deleteAdminAttendance(record.id)),
        },
      ]
    );
  };

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color={COLORS.primary} />
        <Text style={styles.muted}>Loading administrator dashboard...</Text>
      </View>
    );
  }

  if (!authorized) {
    return (
      <View style={styles.center}>
        <Ionicons name="lock-closed-outline" size={40} color={COLORS.textSecondary} />
        <Text style={styles.heading}>Administrators only</Text>
        <Text style={styles.muted}>This dashboard requires an administrator account.</Text>
      </View>
    );
  }

  return (
    <ScrollView
      style={styles.page}
      contentContainerStyle={styles.content}
      refreshControl={
        <RefreshControl
          refreshing={refreshing}
          onRefresh={() => void load(true)}
          tintColor={COLORS.primary}
        />
      }
    >
      <View style={styles.titleRow}>
        <View>
          <Text style={styles.heading}>Administrator</Text>
          <Text style={styles.muted}>System overview and management</Text>
        </View>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Refresh administrator data"
          style={styles.refreshButton}
          onPress={() => void load(true)}
        >
          <Ionicons name="refresh" size={21} color={COLORS.primary} />
        </Pressable>
      </View>

      {error ? (
        <View style={styles.errorBox}>
          <Text style={styles.errorText}>{error}</Text>
          <Pressable onPress={() => void load(true)}>
            <Text style={styles.linkText}>Try again</Text>
          </Pressable>
        </View>
      ) : null}

      <Text style={styles.sectionTitle}>System totals</Text>
      <View style={styles.summaryGrid}>
        <SummaryCard label="Users" value={summary?.users ?? 0} />
        <SummaryCard label="Students" value={summary?.students ?? 0} />
        <SummaryCard label="Teachers" value={summary?.teachers ?? 0} />
        <SummaryCard label="Admins" value={summary?.admins ?? 0} />
        <SummaryCard label="Events" value={summary?.events ?? 0} />
        <SummaryCard label="Attendance" value={summary?.attendance ?? 0} />
      </View>

      <TextInput
        value={query}
        onChangeText={setQuery}
        placeholder="Search users, events, attendance..."
        placeholderTextColor={COLORS.textSecondary}
        style={styles.search}
        autoCapitalize="none"
        returnKeyType="search"
      />

      <Text style={styles.sectionTitle}>Users ({filteredUsers.length})</Text>
      {filteredUsers.length ? filteredUsers.map((person) => (
        <View key={person.id} style={styles.card}>
          <View style={styles.cardMain}>
            <Text style={styles.cardTitle}>{person.full_name || 'Name not set'}</Text>
            <Text style={styles.muted}>{person.email}</Text>
            <View style={[styles.roleBadge, roleBadgeStyle(person.role)]}>
              <Text style={[styles.roleBadgeText, roleBadgeTextStyle(person.role)]}>
                {roleLabel(person.role)}
              </Text>
            </View>
          </View>
          <Pressable
            accessibilityRole="button"
            style={styles.actionButton}
            onPress={() => askForRole(person)}
          >
            <Text style={styles.actionText}>Change role</Text>
          </Pressable>
        </View>
      )) : <Empty label="No users match your search." />}

      <Text style={styles.sectionTitle}>Events ({filteredEvents.length})</Text>
      {filteredEvents.length ? filteredEvents.map((event) => (
        <View key={event.id} style={styles.card}>
          <View style={styles.cardMain}>
            <Text style={styles.cardTitle}>{event.title}</Text>
            <Text style={styles.muted}>
              {event.event_code} · {event.event_date} · {event.venue}
            </Text>
            <Text style={styles.role}>Status: {event.status}</Text>
          </View>
          <Pressable
            accessibilityRole="button"
            style={styles.actionButton}
            onPress={() =>
              void runAdminAction(() =>
                setAdminEventStatus(
                  event.id,
                  event.status === 'open' ? 'closed' : 'open'
                )
              )
            }
          >
            <Text style={styles.actionText}>
              {event.status === 'open' ? 'Close event' : 'Reopen'}
            </Text>
          </Pressable>
        </View>
      )) : <Empty label="No events match your search." />}

      <Text style={styles.sectionTitle}>
        Attendance records ({filteredAttendance.length})
      </Text>
      {filteredAttendance.length ? filteredAttendance.map((record) => (
        <View key={record.id} style={styles.card}>
          <View style={styles.cardMain}>
            <Text style={styles.cardTitle}>{record.student_name || 'Student name unavailable'}</Text>
            <Text style={styles.muted}>
              {record.event_title} · {record.student_email ?? 'Email unavailable'} · {new Date(record.attendance_time).toLocaleString()}
            </Text>
            <Text style={styles.role}>Status: {record.status}</Text>
          </View>
          <View style={styles.attendanceActions}>
            <Pressable
              accessibilityRole="button"
              style={styles.actionButton}
              onPress={() => askForAttendanceStatus(record)}
            >
              <Text style={styles.actionText}>Correct</Text>
            </Pressable>
            <Pressable
              accessibilityRole="button"
              style={[styles.actionButton, styles.deleteButton]}
              onPress={() => confirmDeleteAttendance(record)}
            >
              <Text style={[styles.actionText, styles.deleteText]}>Delete</Text>
            </Pressable>
          </View>
        </View>
      )) : <Empty label="No attendance records match your search." />}
    </ScrollView>
  );
}

function SummaryCard({ label, value }: { label: string; value: number }) {
  return (
    <View style={styles.summaryCard}>
      <Text style={styles.summaryValue}>{value}</Text>
      <Text style={styles.summaryLabel}>{label}</Text>
    </View>
  );
}

function Empty({ label }: { label: string }) {
  return <Text style={styles.empty}>{label}</Text>;
}

function roleLabel(value: string) {
  return value === 'admin' ? 'Administrator' : value.charAt(0).toUpperCase() + value.slice(1);
}

function roleBadgeStyle(role: Role) {
  if (role === 'admin') return styles.adminBadge;
  if (role === 'teacher') return styles.teacherBadge;
  return styles.studentBadge;
}

function roleBadgeTextStyle(role: Role) {
  if (role === 'admin') return styles.adminBadgeText;
  if (role === 'teacher') return styles.teacherBadgeText;
  return styles.studentBadgeText;
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: COLORS.background },
  content: { padding: 20, paddingBottom: 40 },
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 28,
    backgroundColor: COLORS.background,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 20,
  },
  heading: { fontSize: 22, fontWeight: '700', color: COLORS.textPrimary },
  muted: { color: COLORS.textSecondary, fontSize: 13, marginTop: 3 },
  refreshButton: {
    padding: 10,
    borderRadius: 10,
    backgroundColor: COLORS.card,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  sectionTitle: {
    color: COLORS.textPrimary,
    fontSize: 17,
    fontWeight: '700',
    marginTop: 22,
    marginBottom: 10,
  },
  summaryGrid: { flexDirection: 'row', flexWrap: 'wrap', marginHorizontal: -5 },
  summaryCard: {
    width: '31%',
    minWidth: 95,
    flexGrow: 1,
    backgroundColor: COLORS.card,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 12,
    padding: 12,
    margin: 4,
  },
  summaryValue: { fontSize: 21, fontWeight: '700', color: COLORS.primary },
  summaryLabel: { color: COLORS.textSecondary, fontSize: 12, marginTop: 3 },
  search: {
    backgroundColor: COLORS.card,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    marginTop: 18,
    color: COLORS.textPrimary,
  },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.card,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 12,
    padding: 13,
    marginBottom: 9,
  },
  cardMain: { flex: 1, paddingRight: 8 },
  cardTitle: { color: COLORS.textPrimary, fontSize: 14, fontWeight: '700' },
  role: { color: COLORS.primary, fontSize: 12, fontWeight: '600', marginTop: 5 },
  roleBadge: {
    alignSelf: 'flex-start',
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 4,
    marginTop: 6,
  },
  studentBadge: { backgroundColor: '#DBEAFE' },
  teacherBadge: { backgroundColor: '#FEF3C7' },
  adminBadge: { backgroundColor: '#EDE9FE' },
  roleBadgeText: { fontSize: 11, fontWeight: '700' },
  studentBadgeText: { color: '#1D4ED8' },
  teacherBadgeText: { color: '#B45309' },
  adminBadgeText: { color: '#6D28D9' },
  actionButton: {
    paddingVertical: 8,
    paddingHorizontal: 10,
    borderRadius: 8,
    backgroundColor: COLORS.surface,
    marginLeft: 5,
  },
  actionText: { color: COLORS.primary, fontWeight: '700', fontSize: 12 },
  attendanceActions: { alignItems: 'flex-end' },
  deleteButton: { backgroundColor: '#FEE2E2', marginTop: 6 },
  deleteText: { color: COLORS.danger },
  empty: {
    color: COLORS.textSecondary,
    textAlign: 'center',
    padding: 16,
    backgroundColor: COLORS.card,
    borderRadius: 10,
  },
  errorBox: {
    padding: 12,
    borderRadius: 10,
    backgroundColor: '#FEE2E2',
    marginBottom: 12,
  },
  errorText: { color: COLORS.danger, fontSize: 13 },
  linkText: { color: COLORS.primary, fontWeight: '700', marginTop: 8 },
});
