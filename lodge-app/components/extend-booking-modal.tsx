import React, { useEffect, useMemo, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Modal,
  Pressable,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
} from 'react-native';
import DateTimePicker, { DateTimePickerEvent } from '@react-native-community/datetimepicker';
import { AppColors } from '@/constants/theme';
import type { Booking, BookingType } from '@/lib/types';

const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;

interface ExtensionOption {
  key: string;
  label: string;
  getNewCheckOut: (currentCheckOut: Date) => Date;
  newBookingType?: BookingType;
}

const OPTIONS: ExtensionOption[] = [
  {
    key: '12h',
    label: '+12 Hours',
    getNewCheckOut: (c) => new Date(c.getTime() + 12 * HOUR_MS),
  },
  {
    key: '1d',
    label: '+1 Day',
    getNewCheckOut: (c) => new Date(c.getTime() + DAY_MS),
    newBookingType: 'full_day',
  },
  {
    key: 'custom',
    label: 'Custom',
    getNewCheckOut: (c) => new Date(c.getTime() + DAY_MS),
  },
];

interface Props {
  visible: boolean;
  booking: Booking | null;
  onClose: () => void;
  onConfirm: (
    booking: Booking,
    newCheckOut: Date,
    additionalAmount: number,
    newBookingType?: BookingType,
  ) => Promise<void> | void;
}

function formatDateTime(d: Date): string {
  return d.toLocaleString('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: true,
  });
}

function computeExtensionCharge(
  room: Booking['room'],
  currentCheckOut: Date,
  newCheckOut: Date,
): number {
  if (!room) return 0;
  const diffMs = newCheckOut.getTime() - currentCheckOut.getTime();
  if (diffMs <= 0) return 0;

  const hours = diffMs / HOUR_MS;

  if (hours >= 24) {
    const days = Math.ceil(hours / 24);
    return days * room.price;
  }
  if (hours >= 12) {
    return room.half_day_price ?? Math.round(room.price * 0.6);
  }
  const rate = room.hourly_price ?? Math.round(room.price / 24);
  return Math.ceil(hours) * rate;
}

export function ExtendBookingModal({ visible, booking, onClose, onConfirm }: Props) {
  const [selectedOptionKey, setSelectedOptionKey] = useState('12h');
  const [customDate, setCustomDate] = useState<Date>(new Date());
  const [showCustomPicker, setShowCustomPicker] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const currentCheckOut = useMemo(() => {
    if (!booking) return new Date();
    const d = new Date(booking.check_out);
    return isNaN(d.getTime()) ? new Date() : d;
  }, [booking]);

  useEffect(() => {
    if (visible && booking) {
      setSelectedOptionKey('12h');
      setCustomDate(new Date(currentCheckOut.getTime() + DAY_MS));
      setError(null);
      setSubmitting(false);
    }
  }, [visible, booking, currentCheckOut]);

  const selectedOption = OPTIONS.find((o) => o.key === selectedOptionKey) ?? OPTIONS[0];

  const newCheckOut = useMemo(() => {
    if (selectedOptionKey === 'custom') return customDate;
    return selectedOption.getNewCheckOut(currentCheckOut);
  }, [selectedOption, selectedOptionKey, customDate, currentCheckOut]);

  const additionalAmount = useMemo(
    () => computeExtensionCharge(booking?.room, currentCheckOut, newCheckOut),
    [booking?.room, currentCheckOut, newCheckOut],
  );

  const handleCustomChange = (_: DateTimePickerEvent, date?: Date) => {
    setShowCustomPicker(false);
    if (!date) return;
    setCustomDate(date);
  };

  const handleConfirm = async () => {
    if (!booking) return;
    if (newCheckOut <= currentCheckOut) {
      setError('New check-out must be after current check-out.');
      return;
    }
    setError(null);
    setSubmitting(true);
    try {
      await onConfirm(booking, newCheckOut, additionalAmount, selectedOption.newBookingType);
      onClose();
    } catch (e: any) {
      setError(e?.message ?? 'Failed to extend booking.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <KeyboardAvoidingView
        style={styles.overlay}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <View style={styles.sheet}>
          <View style={styles.handle} />
          <View style={styles.modalHeader}>
            <Text style={styles.title}>Extend Booking</Text>
            <Pressable onPress={onClose} hitSlop={12}>
              <Text style={styles.closeBtn}>✕</Text>
            </Pressable>
          </View>

          <View style={styles.currentBox}>
            <Text style={styles.currentLabel}>Current Check-out</Text>
            <Text style={styles.currentValue}>{formatDateTime(currentCheckOut)}</Text>
          </View>

          <Text style={styles.label}>Extension</Text>
          <View style={styles.optionsRow}>
            {OPTIONS.map((opt) => (
              <Pressable
                key={opt.key}
                style={[
                  styles.optionChip,
                  selectedOptionKey === opt.key && styles.optionChipActive,
                ]}
                onPress={() => setSelectedOptionKey(opt.key)}
              >
                <Text
                  style={[
                    styles.optionText,
                    selectedOptionKey === opt.key && styles.optionTextActive,
                  ]}
                >
                  {opt.label}
                </Text>
              </Pressable>
            ))}
          </View>

          {selectedOptionKey === 'custom' && (
            <View style={{ marginTop: 12 }}>
              {Platform.OS === 'web' ? (
                React.createElement('input', {
                  type: 'datetime-local',
                  value: toDateTimeLocalString(customDate),
                  min: toDateTimeLocalString(currentCheckOut),
                  onChange: (e: any) => {
                    const picked = new Date(e.target.value);
                    if (!isNaN(picked.getTime())) setCustomDate(picked);
                  },
                  style: {
                    padding: 14,
                    fontSize: 16,
                    borderRadius: 12,
                    border: `1px solid ${AppColors.border}`,
                    backgroundColor: AppColors.white,
                    color: AppColors.black,
                    width: '100%',
                    boxSizing: 'border-box' as const,
                  },
                })
              ) : (
                <Pressable style={styles.customPickBtn} onPress={() => setShowCustomPicker(true)}>
                  <Text style={styles.customPickLabel}>New Check-out</Text>
                  <Text style={styles.customPickValue}>{formatDateTime(customDate)}</Text>
                </Pressable>
              )}
            </View>
          )}

          <View style={styles.summaryBox}>
            <View style={styles.summaryRow}>
              <Text style={styles.summaryLabel}>New Check-out</Text>
              <Text style={styles.summaryValue}>{formatDateTime(newCheckOut)}</Text>
            </View>
            <View style={[styles.summaryRow, styles.summaryTotal]}>
              <Text style={styles.totalLabel}>Additional Charge</Text>
              <Text style={styles.totalValue}>₹{additionalAmount}</Text>
            </View>
          </View>

          {error && <Text style={styles.errorText}>{error}</Text>}

          <View style={styles.actions}>
            <Pressable
              style={({ pressed }) => [styles.actionBtn, styles.backBtn, pressed && { opacity: 0.8 }]}
              onPress={onClose}
              disabled={submitting}
            >
              <Text style={styles.backBtnText}>Cancel</Text>
            </Pressable>
            <Pressable
              style={({ pressed }) => [
                styles.actionBtn,
                styles.confirmBtn,
                pressed && { opacity: 0.85 },
                submitting && { opacity: 0.6 },
              ]}
              onPress={handleConfirm}
              disabled={submitting}
            >
              {submitting ? (
                <ActivityIndicator color={AppColors.white} />
              ) : (
                <Text style={styles.confirmBtnText}>Confirm Extension</Text>
              )}
            </Pressable>
          </View>
        </View>
      </KeyboardAvoidingView>

      {Platform.OS !== 'web' && showCustomPicker && (
        <DateTimePicker
          value={customDate}
          mode="datetime"
          minimumDate={currentCheckOut}
          onChange={handleCustomChange}
        />
      )}
    </Modal>
  );
}

function toDateTimeLocalString(d: Date): string {
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  const hh = String(d.getHours()).padStart(2, '0');
  const mi = String(d.getMinutes()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}T${hh}:${mi}`;
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.45)',
    justifyContent: 'flex-end',
  },
  sheet: {
    backgroundColor: AppColors.white,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingHorizontal: 24,
    paddingBottom: 36,
  },
  handle: {
    width: 40,
    height: 4,
    backgroundColor: AppColors.border,
    borderRadius: 2,
    alignSelf: 'center',
    marginTop: 12,
    marginBottom: 8,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  title: {
    fontSize: 20,
    fontWeight: '700',
    color: AppColors.black,
  },
  closeBtn: {
    fontSize: 22,
    color: AppColors.grey,
    fontWeight: '600',
  },
  currentBox: {
    backgroundColor: AppColors.lightGrey,
    borderRadius: 12,
    padding: 14,
    marginBottom: 20,
    borderWidth: 1,
    borderColor: AppColors.border,
  },
  currentLabel: {
    fontSize: 11,
    color: AppColors.grey,
    textTransform: 'uppercase',
    fontWeight: '600',
    marginBottom: 4,
  },
  currentValue: {
    fontSize: 16,
    fontWeight: '700',
    color: AppColors.black,
  },
  label: {
    fontSize: 14,
    fontWeight: '600',
    color: AppColors.black,
    marginBottom: 10,
  },
  optionsRow: {
    flexDirection: 'row',
    gap: 8,
  },
  optionChip: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 10,
    borderWidth: 1.5,
    borderColor: AppColors.border,
    backgroundColor: AppColors.lightGrey,
    alignItems: 'center',
  },
  optionChipActive: {
    backgroundColor: AppColors.primary,
    borderColor: AppColors.primary,
  },
  optionText: {
    fontSize: 14,
    fontWeight: '600',
    color: AppColors.grey,
  },
  optionTextActive: {
    color: AppColors.white,
  },
  customPickBtn: {
    backgroundColor: AppColors.white,
    borderRadius: 12,
    padding: 14,
    borderWidth: 1,
    borderColor: AppColors.border,
  },
  customPickLabel: {
    fontSize: 11,
    color: AppColors.grey,
    textTransform: 'uppercase',
    fontWeight: '600',
    marginBottom: 4,
  },
  customPickValue: {
    fontSize: 16,
    fontWeight: '600',
    color: AppColors.black,
  },
  summaryBox: {
    backgroundColor: AppColors.white,
    borderRadius: 12,
    padding: 16,
    marginTop: 20,
    borderWidth: 1,
    borderColor: AppColors.border,
  },
  summaryRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 6,
  },
  summaryLabel: {
    fontSize: 14,
    color: AppColors.grey,
  },
  summaryValue: {
    fontSize: 14,
    fontWeight: '600',
    color: AppColors.black,
  },
  summaryTotal: {
    borderTopWidth: 1,
    borderTopColor: AppColors.border,
    marginTop: 4,
    paddingTop: 10,
  },
  totalLabel: {
    fontSize: 15,
    fontWeight: '700',
    color: AppColors.black,
  },
  totalValue: {
    fontSize: 18,
    fontWeight: '800',
    color: AppColors.primary,
  },
  errorText: {
    color: AppColors.danger,
    fontSize: 13,
    marginTop: 10,
    fontWeight: '500',
  },
  actions: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 20,
  },
  actionBtn: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 10,
    alignItems: 'center',
  },
  backBtn: {
    backgroundColor: AppColors.lightGrey,
    borderWidth: 1,
    borderColor: AppColors.border,
  },
  backBtnText: {
    fontSize: 15,
    fontWeight: '600',
    color: AppColors.black,
  },
  confirmBtn: {
    backgroundColor: AppColors.primary,
  },
  confirmBtnText: {
    fontSize: 15,
    fontWeight: '700',
    color: AppColors.white,
  },
});
