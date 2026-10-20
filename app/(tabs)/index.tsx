import { router, useFocusEffect } from 'expo-router';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useCallback, useState } from 'react';
import {
  ActivityIndicator,
  Modal,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import AppButton from '@/components/AppButton';
import Header from '@/components/Header';
import { COLORS } from '@/constants/colors';
import { getAdminEvents, type AdminEvent } from '@/lib/admin';
import { useAuth } from '@/lib/auth';
import { getEventsByTeacher } from '@/lib/events';
import { getProfile, type Role } from '@/lib/profiles';
import QRCode from 'react-native-qrcode-svg';
import { buildQRPayload } from '@/lib/qr';

type HomeEvent = Pick<
  AdminEvent,
  'id' | 'event_code' | 'title' | 'event_date' | 'start_time' | 'venue' | 'status'
>;

export default function Index() {
  const { user } = useAuth();
  const [role, setRole] = useState<Role | null>(null);
  const [roleError, setRoleError] = useState<string | null>(null);
  const [homeEvents, setHomeEvents] = useState<HomeEvent[]>([]);
  const [eventsLoading, setEventsLoading] = useState(false);
  const [eventsError, setEventsError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [selectedEvent, setSelectedEvent] = useState<HomeEvent | null>(null);

  useFocusEffect(
    useCallback(() => {
      let active = true;
      setRole(null);
      setRoleError(null);
      if (user) {
        getProfile(user.id)
          .then(async (nextProfile) => {
            if (!active) return;
            if (!nextProfile) {
              setRoleError('Your account profile could not be found.');
              return;
            }

            setRole(nextProfile.role);
            if (nextProfile.role === 'admin' || nextProfile.role === 'teacher') {
              setEventsLoading(true);
              setEventsError(null);
              try {
                const events = nextProfile.role === 'admin'
                  ? await getAdminEvents()
                  : await getEventsByTeacher(user.id);
                if (active) setHomeEvents(events);
              } catch (error) {
                if (active) {
                  setEventsError(
                    error instanceof Error
                      ? error.message
                      : 'Could not load available events.'
                  );
                }
              } finally {
                if (active) setEventsLoading(false);
              }
            }
          })
          .catch(() => {
            if (active) setRoleError('Could not verify your account role. Check your connection and retry.');
          });
      } else {
        setRoleError('Sign in to load your dashboard.');
      }
      return () => {
        active = false;
      };
    }, [user])
  );

  const refreshEvents = async () => {
    setRefreshing(true);
    setEventsError(null);
    try {
      if (!user || (role !== 'admin' && role !== 'teacher')) return;
      const events = role === 'admin'
        ? await getAdminEvents()
        : await getEventsByTeacher(user.id);
      setHomeEvents(events);
    } catch (error) {
      setEventsError(
        error instanceof Error ? error.message : 'Could not load available events.'
      );
    } finally {
      setRefreshing(false);
    }
  };

  if (role === 'admin' || role === 'teacher') {
    const availableEvents = homeEvents.filter((event) => event.status === 'open');

    return (
      <SafeAreaView style={styles.adminContainer}>
        <ScrollView
          contentContainerStyle={styles.adminContent}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={() => void refreshEvents()}
              tintColor={COLORS.primary}
            />
          }
        >
          <View style={styles.greetingRow}>
            <View style={styles.greetingText}>
              <Text style={styles.greeting}>
                Hello, {role === 'admin' ? 'Admin' : 'Teacher'}
              </Text>
              <Text style={styles.greetingSubtitle}>Ready to stay connected?</Text>
            </View>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Open profile"
              style={styles.profileButton}
              onPress={() => router.push('/profile')}
            >
              <Ionicons name="person-outline" size={30} color={COLORS.primary} />
            </Pressable>
          </View>

          <Pressable
            accessibilityRole="button"
            style={({ pressed }) => [
              styles.attendanceCard,
              pressed && styles.pressed,
            ]}
            onPress={() => router.push('/history')}
          >
            <View style={styles.attendanceIcon}>
              <Ionicons name="people-outline" size={34} color={COLORS.primary} />
            </View>
            <View style={styles.attendanceCopy}>
              <Text style={styles.attendanceTitle}>Review attendance</Text>
              <Text style={styles.attendanceSubtitle}>
                {role === 'admin'
                  ? 'View school-wide attendance records.'
                  : 'Monitor attendance for your events.'}
              </Text>
            </View>
            <Ionicons
              name="arrow-forward-circle"
              size={34}
              color={COLORS.textOnPrimary}
            />
          </Pressable>

          <View style={styles.eventsHeadingRow}>
            <View>
              <Text style={styles.sectionTitle}>Available events</Text>
              <Text style={styles.sectionSubtitle}>
                Events currently open for attendance
              </Text>
            </View>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Refresh available events"
              style={styles.refreshButton}
              onPress={() => void refreshEvents()}
              disabled={eventsLoading || refreshing}
            >
              <Ionicons
                name="refresh"
                size={23}
                color={COLORS.primary}
              />
            </Pressable>
          </View>

          {eventsLoading && availableEvents.length === 0 ? (
            <ActivityIndicator
              color={COLORS.primary}
              style={styles.eventsLoading}
            />
          ) : eventsError ? (
            <View style={styles.eventsMessage}>
              <Text style={styles.sectionSubtitle}>{eventsError}</Text>
              <Pressable onPress={() => void refreshEvents()}>
                <Text style={styles.retryText}>Try again</Text>
              </Pressable>
            </View>
          ) : availableEvents.length === 0 ? (
            <Text style={styles.eventsMessage}>
              No events are currently open for attendance.
            </Text>
          ) : (
            availableEvents.map((event) => (
              <Pressable
                key={event.id}
                accessibilityRole="button"
                accessibilityLabel={`Show QR code for ${event.title}`}
                style={({ pressed }) => [
                  styles.eventCard,
                  pressed && styles.pressed,
                ]}
                onPress={() => setSelectedEvent(event)}
              >
                <View style={styles.eventIcon}>
                  <Ionicons
                    name="people-outline"
                    size={26}
                    color={COLORS.primary}
                  />
                </View>
                <View style={styles.eventCopy}>
                  <Text style={styles.eventTitle} numberOfLines={1}>
                    {event.title}
                  </Text>
                  <Text style={styles.eventMeta} numberOfLines={1}>
                    {formatEventDate(event)} · {event.venue || 'Venue not set'}
                  </Text>
                  <Text style={styles.eventQrHint}>Tap to show QR</Text>
                </View>
                <View style={styles.openBadge}>
                  <Text style={styles.openBadgeText}>OPEN</Text>
                </View>
                <Ionicons
                  name="qr-code-outline"
                  size={22}
                  color={COLORS.primary}
                  style={styles.eventQrIcon}
                />
              </Pressable>
            ))
          )}
        </ScrollView>
        <Modal
          visible={selectedEvent !== null}
          transparent
          animationType="fade"
          onRequestClose={() => setSelectedEvent(null)}
        >
          <View style={styles.modalBackdrop}>
            <View style={styles.qrModal}>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Close QR code"
                style={styles.closeButton}
                onPress={() => setSelectedEvent(null)}
              >
                <Ionicons name="close" size={24} color={COLORS.textSecondary} />
              </Pressable>
              {selectedEvent && (
                <>
                  <Text style={styles.qrTitle}>{selectedEvent.title}</Text>
                  <Text style={styles.qrEventCode}>{selectedEvent.event_code}</Text>
                  <View style={styles.qrCodeBox}>
                    <QRCode
                      value={buildQRPayload({ event: selectedEvent.event_code })}
                      size={220}
                    />
                  </View>
                  <Text style={styles.qrHint}>
                    Scan this QR code with the Scan tab to record attendance.
                  </Text>
                </>
              )}
            </View>
          </View>
        </Modal>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.headerContainer}>
        <Header title="QR Attendance" />
      </View>

      <View style={styles.bodyContainer}>
        <Text style={styles.mainTitle}>
          {role === 'student' ? 'School Event Attendance' : 'Dashboard'}
        </Text>
        <Text style={styles.subtitle}>
          {role === 'student'
            ? 'Scan QR Codes to record attendance during school activities.'
            : roleError ?? 'Checking your account permissions...'}
        </Text>
      </View>

      <View style={styles.footerContainer}>
        {role === 'student' ? (
          <>
            <AppButton
              theme="primary"
              title="Scan QR Code"
              icon="qr-code-outline"
              onPress={() => router.push('/scan')}
            />
            <AppButton
              title="Attendance History"
              icon="time-outline"
              onPress={() => router.push('/history')}
            />
          </>
        ) : null}
        <AppButton
          title="Profile"
          icon="person-outline"
          onPress={() => router.push('/profile')}
        />
      </View>
    </SafeAreaView>
  );
}

function formatEventDate(event: HomeEvent) {
  const dateValue = event.start_time || event.event_date;
  const date = new Date(dateValue);
  return Number.isNaN(date.getTime())
    ? event.event_date
    : date.toLocaleString(undefined, {
        month: 'short',
        day: 'numeric',
        hour: 'numeric',
        minute: '2-digit',
      });
}

const styles = StyleSheet.create({
  container: { 
    flex: 1, 
    backgroundColor: COLORS.background, 
    alignItems: 'center',
    justifyContent: 'center', 
    paddingVertical: 24,
  },
  headerContainer: { 
    alignItems: 'center',
    marginBottom: 225,
  },
  bodyContainer: { 
    paddingHorizontal: 24, 
    marginBottom: 12, 
    alignItems: 'center', 
  },
  mainTitle: {
    fontSize: 22,
    fontWeight: '700',
    color: COLORS.textPrimary,
    marginBottom: 6,
    textAlign: 'center',
  },
  subtitle: {
    fontSize: 15,
    color: COLORS.textSecondary,
    lineHeight: 21,
    textAlign: 'center',
  },
  footerContainer: { 
    paddingHorizontal: 24, 
    width: '100%',
    gap: 1, 
  },
  adminContainer: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
  adminContent: {
    paddingHorizontal: 24,
    paddingTop: 30,
    paddingBottom: 36,
  },
  greetingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 28,
  },
  greetingText: {
    flex: 1,
  },
  greeting: {
    color: COLORS.textPrimary,
    fontSize: 30,
    lineHeight: 38,
    fontWeight: '700',
  },
  greetingSubtitle: {
    color: COLORS.textSecondary,
    fontSize: 16,
    marginTop: 4,
  },
  profileButton: {
    width: 58,
    height: 58,
    borderRadius: 18,
    backgroundColor: COLORS.surface,
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: 16,
  },
  attendanceCard: {
    minHeight: 136,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.primary,
    borderRadius: 22,
    padding: 18,
    marginBottom: 30,
  },
  attendanceIcon: {
    width: 68,
    height: 68,
    borderRadius: 20,
    backgroundColor: COLORS.card,
    alignItems: 'center',
    justifyContent: 'center',
  },
  attendanceCopy: {
    flex: 1,
    marginHorizontal: 16,
  },
  attendanceTitle: {
    color: COLORS.textOnPrimary,
    fontSize: 19,
    fontWeight: '700',
    marginBottom: 7,
  },
  attendanceSubtitle: {
    color: COLORS.textOnPrimary,
    fontSize: 14,
    lineHeight: 20,
  },
  eventsHeadingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 16,
  },
  sectionTitle: {
    color: COLORS.textPrimary,
    fontSize: 23,
    fontWeight: '700',
  },
  sectionSubtitle: {
    color: COLORS.textSecondary,
    fontSize: 14,
    marginTop: 5,
  },
  refreshButton: {
    width: 42,
    height: 42,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 14,
    backgroundColor: COLORS.surface,
    marginLeft: 12,
  },
  eventsLoading: {
    marginTop: 28,
  },
  eventsMessage: {
    color: COLORS.textSecondary,
    textAlign: 'center',
    paddingVertical: 28,
  },
  retryText: {
    color: COLORS.primary,
    fontWeight: '700',
    textAlign: 'center',
    marginTop: 10,
  },
  eventCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.card,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: COLORS.border,
    padding: 14,
    minHeight: 100,
    marginBottom: 14,
  },
  eventIcon: {
    width: 58,
    height: 58,
    borderRadius: 17,
    backgroundColor: COLORS.surface,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 14,
  },
  eventCopy: {
    flex: 1,
    minWidth: 0,
  },
  eventTitle: {
    color: COLORS.textPrimary,
    fontSize: 16,
    fontWeight: '700',
  },
  eventMeta: {
    color: COLORS.textSecondary,
    fontSize: 13,
    marginTop: 6,
  },
  eventQrHint: {
    color: COLORS.primary,
    fontSize: 12,
    fontWeight: '600',
    marginTop: 5,
  },
  eventQrIcon: {
    marginLeft: 10,
  },
  openBadge: {
    backgroundColor: COLORS.surface,
    borderRadius: 999,
    paddingHorizontal: 13,
    paddingVertical: 8,
    marginLeft: 8,
  },
  openBadgeText: {
    color: COLORS.success,
    fontSize: 12,
    fontWeight: '700',
  },
  modalBackdrop: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
    backgroundColor: 'rgba(0, 0, 0, 0.45)',
  },
  qrModal: {
    width: '100%',
    maxWidth: 380,
    alignItems: 'center',
    backgroundColor: COLORS.card,
    borderRadius: 18,
    padding: 24,
  },
  closeButton: {
    alignSelf: 'flex-end',
    padding: 4,
  },
  qrTitle: {
    color: COLORS.textPrimary,
    fontSize: 20,
    fontWeight: '700',
    textAlign: 'center',
    marginTop: 4,
  },
  qrEventCode: {
    color: COLORS.textSecondary,
    fontSize: 14,
    marginTop: 6,
  },
  qrCodeBox: {
    padding: 12,
    marginTop: 18,
    backgroundColor: '#FFFFFF',
  },
  qrHint: {
    color: COLORS.textSecondary,
    fontSize: 14,
    lineHeight: 20,
    textAlign: 'center',
    marginTop: 16,
  },
  pressed: {
    opacity: 0.82,
  },
});