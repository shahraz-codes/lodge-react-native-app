import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  TextInput,
  StyleSheet,
  Modal,
  Pressable,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
} from 'react-native';
import { AppColors } from '@/constants/theme';
import type { Room, RoomType, RoomStatus } from '@/lib/types';

const ROOM_TYPES: { value: RoomType; label: string }[] = [
  { value: 'single', label: 'Single' },
  { value: 'double', label: 'Double' },
  { value: 'suite', label: 'Suite' },
  { value: 'deluxe', label: 'Deluxe' },
];

const ROOM_STATUSES: { value: RoomStatus; label: string; color: string }[] = [
  { value: 'available', label: 'Available', color: AppColors.roomAvailable },
  { value: 'occupied', label: 'Occupied', color: AppColors.roomOccupied },
  { value: 'cleaning', label: 'Cleaning', color: AppColors.roomCleaning },
];

interface Props {
  visible: boolean;
  room: Room | null;
  onClose: () => void;
  onSubmit: (data: {
    room_number: string;
    type: RoomType;
    price: number;
    half_day_price: number | null;
    hourly_price: number | null;
    status: RoomStatus;
  }) => Promise<void>;
}

export function RoomForm({ visible, room, onClose, onSubmit }: Props) {
  const [roomNumber, setRoomNumber] = useState('');
  const [type, setType] = useState<RoomType>('single');
  const [price, setPrice] = useState('');
  const [halfDayPrice, setHalfDayPrice] = useState('');
  const [hourlyPrice, setHourlyPrice] = useState('');
  const [status, setStatus] = useState<RoomStatus>('available');
  const [submitting, setSubmitting] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});

  const isEditing = !!room;

  useEffect(() => {
    if (visible) {
      if (room) {
        setRoomNumber(room.room_number);
        setType(room.type);
        setPrice(String(room.price));
        setHalfDayPrice(room.half_day_price != null ? String(room.half_day_price) : '');
        setHourlyPrice(room.hourly_price != null ? String(room.hourly_price) : '');
        setStatus(room.status);
      } else {
        setRoomNumber('');
        setType('single');
        setPrice('');
        setHalfDayPrice('');
        setHourlyPrice('');
        setStatus('available');
      }
      setErrors({});
    }
  }, [visible, room]);

  function validate(): boolean {
    const newErrors: Record<string, string> = {};
    if (!roomNumber.trim()) newErrors.room_number = 'Room number is required';
    if (!price.trim()) {
      newErrors.price = 'Price is required';
    } else if (isNaN(Number(price)) || Number(price) <= 0) {
      newErrors.price = 'Price must be a positive number';
    }
    if (halfDayPrice.trim() && (isNaN(Number(halfDayPrice)) || Number(halfDayPrice) <= 0)) {
      newErrors.half_day_price = 'Half-day price must be a positive number';
    }
    if (hourlyPrice.trim() && (isNaN(Number(hourlyPrice)) || Number(hourlyPrice) <= 0)) {
      newErrors.hourly_price = 'Hourly price must be a positive number';
    }
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  }

  async function handleSubmit() {
    if (!validate()) return;
    setSubmitting(true);
    try {
      await onSubmit({
        room_number: roomNumber.trim(),
        type,
        price: Number(price),
        half_day_price: halfDayPrice.trim() ? Number(halfDayPrice) : null,
        hourly_price: hourlyPrice.trim() ? Number(hourlyPrice) : null,
        status,
      });
    } finally {
      setSubmitting(false);
    }
  }

  const nightly = Number(price) || 0;
  const halfDayHint = nightly > 0 ? `auto: ₹${Math.round(nightly * 0.6)}` : 'auto: 60% of nightly';
  const hourlyHint = nightly > 0 ? `auto: ₹${Math.round(nightly / 24)}` : 'auto: nightly / 24';

  return (
    <Modal
      visible={visible}
      animationType="slide"
      transparent
      onRequestClose={onClose}
    >
      <KeyboardAvoidingView
        style={styles.overlay}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <View style={styles.sheet}>
          <View style={styles.handle} />

          <View style={styles.modalHeader}>
            <Text style={styles.title}>
              {isEditing ? 'Edit Room' : 'Add Room'}
            </Text>
            <Pressable onPress={onClose} hitSlop={12}>
              <Text style={styles.closeBtn}>✕</Text>
            </Pressable>
          </View>

          <ScrollView
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
          >
            <Text style={styles.label}>Room Number</Text>
            <TextInput
              style={[styles.input, errors.room_number && styles.inputError]}
              value={roomNumber}
              onChangeText={setRoomNumber}
              placeholder="e.g. 101"
              placeholderTextColor={AppColors.grey}
              autoCapitalize="characters"
            />
            {errors.room_number && (
              <Text style={styles.errorText}>{errors.room_number}</Text>
            )}

            <Text style={styles.label}>Type</Text>
            <View style={styles.chipRow}>
              {ROOM_TYPES.map((t) => (
                <Pressable
                  key={t.value}
                  style={[
                    styles.chip,
                    type === t.value && styles.chipSelected,
                  ]}
                  onPress={() => setType(t.value)}
                >
                  <Text
                    style={[
                      styles.chipText,
                      type === t.value && styles.chipTextSelected,
                    ]}
                  >
                    {t.label}
                  </Text>
                </Pressable>
              ))}
            </View>

            <Text style={styles.label}>Price per Night (₹)</Text>
            <TextInput
              style={[styles.input, errors.price && styles.inputError]}
              value={price}
              onChangeText={setPrice}
              placeholder="e.g. 2500"
              placeholderTextColor={AppColors.grey}
              keyboardType="numeric"
            />
            {errors.price && (
              <Text style={styles.errorText}>{errors.price}</Text>
            )}

            <Text style={styles.label}>Half-Day Price (12 hrs, ₹)</Text>
            <TextInput
              style={[styles.input, errors.half_day_price && styles.inputError]}
              value={halfDayPrice}
              onChangeText={setHalfDayPrice}
              placeholder={`Optional — ${halfDayHint}`}
              placeholderTextColor={AppColors.grey}
              keyboardType="numeric"
            />
            {errors.half_day_price && (
              <Text style={styles.errorText}>{errors.half_day_price}</Text>
            )}

            <Text style={styles.label}>Hourly Price (per hour, ₹)</Text>
            <TextInput
              style={[styles.input, errors.hourly_price && styles.inputError]}
              value={hourlyPrice}
              onChangeText={setHourlyPrice}
              placeholder={`Optional — ${hourlyHint}`}
              placeholderTextColor={AppColors.grey}
              keyboardType="numeric"
            />
            {errors.hourly_price && (
              <Text style={styles.errorText}>{errors.hourly_price}</Text>
            )}

            <Text style={styles.label}>Status</Text>
            <View style={styles.chipRow}>
              {ROOM_STATUSES.map((s) => (
                <Pressable
                  key={s.value}
                  style={[
                    styles.chip,
                    status === s.value && {
                      backgroundColor: s.color,
                      borderColor: s.color,
                    },
                  ]}
                  onPress={() => setStatus(s.value)}
                >
                  <Text
                    style={[
                      styles.chipText,
                      status === s.value && styles.chipTextSelected,
                    ]}
                  >
                    {s.label}
                  </Text>
                </Pressable>
              ))}
            </View>

            <Pressable
              style={({ pressed }) => [
                styles.submitBtn,
                pressed && { opacity: 0.85 },
                submitting && { opacity: 0.6 },
              ]}
              onPress={handleSubmit}
              disabled={submitting}
            >
              {submitting ? (
                <ActivityIndicator color={AppColors.white} />
              ) : (
                <Text style={styles.submitText}>
                  {isEditing ? 'Update Room' : 'Add Room'}
                </Text>
              )}
            </Pressable>
          </ScrollView>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
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
    maxHeight: '90%',
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
    marginBottom: 20,
  },
  title: {
    fontSize: 22,
    fontWeight: '700',
    color: AppColors.black,
  },
  closeBtn: {
    fontSize: 22,
    color: AppColors.grey,
    fontWeight: '600',
  },
  label: {
    fontSize: 14,
    fontWeight: '600',
    color: AppColors.black,
    marginBottom: 6,
    marginTop: 14,
  },
  input: {
    borderWidth: 1.5,
    borderColor: AppColors.border,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 16,
    color: AppColors.black,
    backgroundColor: AppColors.lightGrey,
  },
  inputError: {
    borderColor: AppColors.danger,
  },
  errorText: {
    color: AppColors.danger,
    fontSize: 12,
    marginTop: 4,
    fontWeight: '500',
  },
  chipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  chip: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 10,
    borderWidth: 1.5,
    borderColor: AppColors.border,
    backgroundColor: AppColors.lightGrey,
  },
  chipSelected: {
    backgroundColor: AppColors.primary,
    borderColor: AppColors.primary,
  },
  chipText: {
    fontSize: 14,
    fontWeight: '600',
    color: AppColors.grey,
  },
  chipTextSelected: {
    color: AppColors.white,
  },
  submitBtn: {
    backgroundColor: AppColors.primary,
    paddingVertical: 16,
    borderRadius: 12,
    alignItems: 'center',
    marginTop: 28,
    marginBottom: 8,
  },
  submitText: {
    color: AppColors.white,
    fontSize: 16,
    fontWeight: '700',
  },
});
