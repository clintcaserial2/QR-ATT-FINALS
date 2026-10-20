
import Ionicons from '@expo/vector-icons/Ionicons';

import DateTimePicker, {
  type DateTimePickerEvent,
} from '@react-native-community/datetimepicker';

import { useFocusEffect } from 'expo-router';

import { useCallback, useEffect, useRef, useState } from 'react';

import {
  ActivityIndicator,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

import QRCode from 'react-native-qrcode-svg';

import AppButton from '@/components/AppButton';
import { COLORS } from '@/constants/colors';
import { useAuth } from '@/lib/auth';
import { createEvent } from '@/lib/events';
import { getProfile, type Role } from '@/lib/profiles';
import { buildQRPayload } from '@/lib/qr';

function toLocalISO(date: Date) {
  const pad = (n: number) => String(n).padStart(2, '0');

  return (
    `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}` +
    `T${pad(date.getHours())}:${pad(date.getMinutes())}:00`
  );
}

function getDefaultStartDate() {
  const start = new Date();
  start.setSeconds(0, 0);
  start.setMinutes(start.getMinutes() - 5);
  return start;
}

function formatDateTime(date: Date) {
  const pad = (n: number) => String(n).padStart(2, '0');
  const month = date.toLocaleString('en-US', { month: 'short' });

  return `${month} ${pad(date.getDate())}, ${date.getFullYear()} at ${pad(
    date.getHours()
  )}:${pad(date.getMinutes())}`;
}

function toInputDateTimeValue(date: Date) {
  const pad = (n: number) => String(n).padStart(2, '0');

  return (
    `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}` +
    `T${pad(date.getHours())}:${pad(date.getMinutes())}`
  );
}

function parseKeyboardDateTime(value: string) {
  const match = /^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})$/.exec(
    value.trim()
  );

  if (!match) return null;

  const [, year, month, day, hour, minute] = match;
  const date = new Date(
    Number(year),
    Number(month) - 1,
    Number(day),
    Number(hour),
    Number(minute)
  );

  if (
    date.getFullYear() !== Number(year) ||
    date.getMonth() !== Number(month) - 1 ||
    date.getDate() !== Number(day) ||
    date.getHours() !== Number(hour) ||
    date.getMinutes() !== Number(minute)
  ) {
    return null;
  }

  return date;
}

const QUICK_END_OPTIONS = [
  { label: '+30 min', ms: 30 * 60 * 1000 },
  { label: '+1 hour', ms: 60 * 60 * 1000 },
  { label: '+2 hours', ms: 2 * 60 * 60 * 1000 },
];

type EditTarget = 'start' | 'end';

export default function TeacherScreen() {
  const { user } = useAuth();

  const [role, setRole] = useState<Role | null>(null);
  const [roleLoading, setRoleLoading] = useState(true);
  const [roleError, setRoleError] = useState(false);

  const [title, setTitle] = useState('');
  const [eventId, setEventId] = useState('');
  const [description, setDescription] = useState('');
  const [venue, setVenue] = useState('');

  const [startDate, setStartDate] = useState(getDefaultStartDate);
  const [startDateInputValid, setStartDateInputValid] = useState(true);

  const [endDate, setEndDate] = useState(
    () => new Date(getDefaultStartDate().getTime() + 60 * 60 * 1000)
  );
  const [endDateInputValid, setEndDateInputValid] = useState(true);

  const [editTarget, setEditTarget] = useState<EditTarget | null>(null);
  const [editingPart, setEditingPart] = useState<'date' | 'time'>('date');

  const [payload, setPayload] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const isAndroid = Platform.OS === 'android';

  useFocusEffect(
    useCallback(() => {
      let active = true;

      if (!user) {
        setRoleLoading(false);

        return () => {
          active = false;
        };
      }

      getProfile(user.id).then((profile: { role: Role } | null) => {
        if (!active) return;

        setRole(profile?.role ?? 'student');
        setRoleLoading(false);
      }).catch(() => {
        if (!active) return;
        setRoleError(true);
        setRoleLoading(false);
      });

      return () => {
        active = false;
      };
    }, [user])
  );

  if (roleLoading) {
    return (
      <View style={styles.centerContainer}>
        <ActivityIndicator size="large" color={COLORS.primary} />

        <Text style={styles.checkingText}>
          Checking your account...
        </Text>
      </View>
    );
  }

  if (role !== 'teacher' && role !== 'admin') {
    return (
      <View style={styles.centerContainer}>
        <Ionicons
          name="lock-closed-outline"
          size={40}
          color={COLORS.textSecondary}
        />

        <Text style={styles.lockTitle}>
          {roleError ? 'Account Could Not Be Verified' : 'Teachers Only'}
        </Text>

        <Text style={styles.lockSubtitle}>
          {roleError
            ? 'Check your connection and reload this screen.'
            : 'Only teacher or administrator accounts can create events.'}
        </Text>
      </View>
    );
  }

  const openPicker = (target: EditTarget) => {
    setMessage(null);
    setEditTarget(target);
    setEditingPart('date');
  };

  const renderDateTimeField = (target: EditTarget) => {
    const value = target === 'start' ? startDate : endDate;

    const icon =
      target === 'start' ? 'sunny-outline' : 'moon-outline';

    const handleChange = (next: Date) => {
      setMessage(null);

      if (target === 'start') {
        setStartDate(next);
      } else {
        setEndDate(next);
      }
    };

    if (Platform.OS === 'web') {
      return (
        <WebDateTimeField
          value={value}
          icon={icon}
          onChange={handleChange}
            onValidityChange={
              target === 'start'
                ? setStartDateInputValid
                : setEndDateInputValid
            }
          />
      );
    }

    return (
      <PickerField
        value={formatDateTime(value)}
        icon={icon}
        onPress={() => openPicker(target)}
      />
    );
  };

  const onPickerChange = (
    event: DateTimePickerEvent,
    selected?: Date
  ) => {
    if (!editTarget) return;

    if (event.type === 'dismissed' || !selected) {
      setEditTarget(null);
      setEditingPart('date');
      return;
    }

    const current =
      editTarget === 'start' ? startDate : endDate;

    const next = new Date(current);

    next.setFullYear(
      selected.getFullYear(),
      selected.getMonth(),
      selected.getDate()
    );

    next.setHours(
      selected.getHours(),
      selected.getMinutes(),
      0,
      0
    );

    if (editTarget === 'start') {
      setStartDate(next);
    } else {
      setEndDate(next);
    }

    if (isAndroid && editingPart === 'date') {
      setEditingPart('time');
    } else {
      setEditTarget(null);
      setEditingPart('date');
    }
  };

  const handleQuickEnd = (ms: number) => {
    setMessage(null);

    setEndDate(
      new Date(startDate.getTime() + ms)
    );
  };

  const handleCreateEvent = async () => {
    if (!startDateInputValid || !endDateInputValid) {
      setPayload(null);
      setMessage('Enter dates and times as YYYY-MM-DD HH:mm.');
      return;
    }

    const event = {
      eventId: eventId.trim(),
      title: title.trim(),
      start: toLocalISO(startDate),
      end: toLocalISO(endDate),
      description: description.trim(),
      venue: venue.trim(),
    };

    if (!event.eventId || !event.title) {
      setPayload(null);
      setMessage('Event title and code are required.');
      return;
    }

    if (endDate.getTime() <= startDate.getTime()) {
      setPayload(null);
      setMessage('End time must be after start time.');
      return;
    }

    setPayload(null);
    setMessage(null);
    setSaving(true);
    try {
      const { error, eventCode } = await createEvent(event);
      if (error) {
        setMessage(error);
        return;
      }

      setMessage(
        'Event saved! Its QR code is ready to scan.'
      );

      setPayload(
        buildQRPayload({
          event: eventCode ?? event.eventId,
          title: event.title,
          start: event.start,
          end: event.end,
        })
      );
    } catch {
      setMessage('Could not save the event. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.content}
      keyboardShouldPersistTaps="handled"
    >
      <Text style={styles.title}>Create Event QR</Text>

      <Text style={styles.subtitle}>
        Fill in the event details, then scan the generated QR with the Scan tab. Attendance is accepted while the event status is open.
      </Text>

      <Text style={styles.label}>Event Title</Text>

      <TextInput
        style={styles.input}
        value={title}
        onChangeText={(value) => {
          setTitle(value);
          setPayload(null);
          setMessage(null);
        }}
        placeholder="e.g. Founders Day Assembly"
        placeholderTextColor={COLORS.textSecondary}
      />

      <Text style={styles.label}>Description</Text>

      <TextInput
        style={[styles.input, styles.multilineInput]}
        value={description}
        onChangeText={(value) => {
          setDescription(value);
          setPayload(null);
          setMessage(null);
        }}
        placeholder="Event details (optional)"
        placeholderTextColor={COLORS.textSecondary}
        multiline
      />

      <Text style={styles.label}>Event Code</Text>

      <TextInput
        style={styles.input}
        value={eventId}
        onChangeText={(value) => {
          setEventId(value);
          setPayload(null);
          setMessage(null);
        }}
        placeholder="e.g. EVT-2026-0002"
        placeholderTextColor={COLORS.textSecondary}
        autoCapitalize="characters"
      />

      <Text style={styles.label}>Venue</Text>

      <TextInput
        style={styles.input}
        value={venue}
        onChangeText={(value) => {
          setVenue(value);
          setPayload(null);
          setMessage(null);
        }}
        placeholder="e.g. School Auditorium"
        placeholderTextColor={COLORS.textSecondary}
      />

      <Text style={styles.label}>Starts</Text>

      {renderDateTimeField('start')}

      <Text style={styles.label}>Ends</Text>

      {renderDateTimeField('end')}

      <View style={styles.chipRow}>
        {QUICK_END_OPTIONS.map((option) => (
          <Pressable
            key={option.label}
            style={styles.chip}
            onPress={() => handleQuickEnd(option.ms)}
          >
            <Text style={styles.chipText}>
              {option.label}
            </Text>
          </Pressable>
        ))}
      </View>

      <Text style={styles.hint}>
        Tap a chip to set the end time from start.
      </Text>

      {message && (
        <Text style={styles.message}>
          {message}
        </Text>
      )}

      <AppButton
        theme="primary"
        title={saving ? 'Saving Event...' : 'Create Event'}
        icon="add-circle-outline"
        onPress={handleCreateEvent}
        disabled={saving}
      />
      {saving && <ActivityIndicator color={COLORS.primary} style={styles.saving} />}

      {editTarget && Platform.OS !== 'web' && (
        <View style={styles.pickerContainer}>
          <DateTimePicker
            value={
              editTarget === 'start'
                ? startDate
                : endDate
            }
            mode={
              isAndroid
                ? editingPart
                : 'datetime'
            }
            display={
              isAndroid
                ? 'default'
                : 'spinner'
            }
            onChange={onPickerChange}
          />
        </View>
      )}

      {payload && (
        <View style={styles.resultCard}>
          <Text style={styles.resultTitle}>
            Scan this QR code with the Scan tab:
          </Text>

          <View style={styles.qrBox}>
            <QRCode
              value={payload}
              size={200}
            />
          </View>

          <Text style={styles.payloadText}>
            {payload}
          </Text>
        </View>
      )}
    </ScrollView>
  );
}

type PickerFieldProps = {
  value: string;
  icon: keyof typeof Ionicons.glyphMap;
  onPress: () => void;
};

function PickerField({
  value,
  icon,
  onPress,
}: PickerFieldProps) {
  return (
    <Pressable
      style={({ pressed }) => [
        styles.pickerField,
        pressed && styles.pickerFieldPressed,
      ]}
      onPress={onPress}
    >
      <Ionicons
        name={icon}
        size={20}
        color={COLORS.primary}
      />

      <Text style={styles.pickerValue}>
        {value}
      </Text>

      <Ionicons
        name="calendar-outline"
        size={18}
        color={COLORS.textSecondary}
      />
    </Pressable>
  );
}

type WebDateTimeFieldProps = {
  value: Date;
  icon: keyof typeof Ionicons.glyphMap;
  onChange: (date: Date) => void;
  onValidityChange: (isValid: boolean) => void;
};

function WebDateTimeField({
  value,
  icon,
  onChange,
  onValidityChange,
}: WebDateTimeFieldProps) {
  const [draft, setDraft] = useState(
    () => toInputDateTimeValue(value).replace('T', ' ')
  );
  const [isValid, setIsValid] = useState(true);
  const pickerRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setDraft(toInputDateTimeValue(value).replace('T', ' '));
    setIsValid(true);
    onValidityChange(true);
  }, [onValidityChange, value]);

  const handleTextChange = (nextValue: string) => {
    setDraft(nextValue);

    const parsed = parseKeyboardDateTime(nextValue);
    const valid = parsed !== null;
    setIsValid(valid);
    onValidityChange(valid);
    if (parsed) onChange(parsed);
  };

  return (
    <View>
      <View style={styles.pickerField}>
        <Ionicons
          name={icon}
          size={20}
          color={COLORS.primary}
        />

        <input
          type="text"
          value={draft}
          onChange={(event) => handleTextChange(event.target.value)}
          placeholder="YYYY-MM-DD HH:mm"
          aria-label="Date and time, format YYYY-MM-DD HH:mm"
          aria-invalid={!isValid}
          style={webInputStyle}
        />

        <button
          type="button"
          aria-label="Choose date and time"
          onClick={() => {
            try {
              pickerRef.current?.showPicker();
            } catch {
              pickerRef.current?.focus();
            }
          }}
          style={webPickerButtonStyle}
        >
          <Ionicons
            name="calendar-outline"
            size={18}
            color={COLORS.textSecondary}
          />
        </button>

        <input
          ref={pickerRef}
          type="datetime-local"
          value={toInputDateTimeValue(value)}
          onChange={(event) => {
            const next = new Date(event.target.value);
            if (!Number.isNaN(next.getTime())) onChange(next);
          }}
          aria-label="Choose date and time"
          tabIndex={-1}
          style={webPickerInputStyle}
        />
      </View>
      {!isValid && (
        <Text style={styles.dateTimeHint}>
          Enter a valid date and time as YYYY-MM-DD HH:mm.
        </Text>
      )}
    </View>
  );
}

const webInputStyle = {
  flex: 1,
  marginLeft: 10,
  marginRight: 10,
  fontSize: 15,
  fontWeight: 500,
  color: COLORS.textPrimary,
  background: 'transparent',
  border: 'none',
  outline: 'none',
  padding: 0,
  fontFamily: 'inherit',
};

const webPickerButtonStyle = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  width: 32,
  height: 32,
  padding: 0,
  border: 'none',
  background: 'transparent',
  cursor: 'pointer',
};

const webPickerInputStyle = {
  position: 'absolute' as const,
  right: 8,
  width: 1,
  height: 1,
  opacity: 0,
  pointerEvents: 'none' as const,
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.background,
  },

  centerContainer: {
    flex: 1,
    backgroundColor: COLORS.background,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 32,
  },

  checkingText: {
    fontSize: 15,
    color: COLORS.textSecondary,
    marginTop: 12,
  },

  lockTitle: {
    fontSize: 22,
    fontWeight: '700',
    color: COLORS.textPrimary,
    marginTop: 12,
  },

  lockSubtitle: {
    fontSize: 14,
    color: COLORS.textSecondary,
    textAlign: 'center',
    lineHeight: 20,
    marginTop: 4,
  },

  content: {
    paddingHorizontal: 24,
    paddingTop: 24,
    paddingBottom: 40,
  },

  title: {
    fontSize: 20,
    fontWeight: '600',
    color: COLORS.textPrimary,
    marginBottom: 4,
  },

  subtitle: {
    fontSize: 14,
    color: COLORS.textSecondary,
    lineHeight: 20,
    marginBottom: 16,
  },

  label: {
    fontSize: 14,
    fontWeight: '600',
    color: COLORS.textPrimary,
    marginBottom: 6,
    marginTop: 10,
  },

  input: {
    backgroundColor: COLORS.card,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: COLORS.border,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 16,
    color: COLORS.textPrimary,
  },
  multilineInput: {
    minHeight: 80,
    textAlignVertical: 'top',
  },
  saving: {
    marginTop: 12,
  },

  pickerField: {
    backgroundColor: COLORS.card,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: COLORS.border,
    paddingHorizontal: 14,
    paddingVertical: 14,
    flexDirection: 'row',
    alignItems: 'center',
  },

  pickerFieldPressed: {
    backgroundColor: COLORS.surface,
  },

  dateTimeHint: {
    color: COLORS.danger,
    fontSize: 12,
    marginTop: 4,
  },

  pickerValue: {
    flex: 1,
    fontSize: 15,
    fontWeight: '500',
    color: COLORS.textPrimary,
    marginHorizontal: 10,
  },

  chipRow: {
    flexDirection: 'row',
    marginTop: 8,
  },

  chip: {
    backgroundColor: COLORS.surface,
    borderRadius: 999,
    paddingHorizontal: 14,
    paddingVertical: 7,
    marginRight: 8,
  },

  chipText: {
    fontSize: 13,
    fontWeight: '600',
    color: COLORS.primary,
  },

  hint: {
    fontSize: 12,
    color: COLORS.textSecondary,
    marginTop: 6,
  },

  pickerContainer: {
    marginTop: 12,
    alignItems: 'center',
  },

  message: {
    fontSize: 14,
    color: COLORS.primary,
    textAlign: 'center',
    marginTop: 12,
  },

  resultCard: {
    backgroundColor: COLORS.card,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: COLORS.border,
    padding: 16,
    marginTop: 20,
    alignItems: 'center',
  },

  resultTitle: {
    fontSize: 15,
    fontWeight: '600',
    color: COLORS.textPrimary,
    textAlign: 'center',
    marginBottom: 12,
  },

  qrBox: {
    backgroundColor: COLORS.card,
    padding: 12,
    borderRadius: 10,
    marginBottom: 12,
  },

  payloadText: {
    fontSize: 12,
    color: COLORS.textSecondary,
    textAlign: 'center',
    lineHeight: 16,
  },
});