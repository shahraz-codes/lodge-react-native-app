import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Modal,
  Pressable,
  TextInput,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
} from 'react-native';
import { AppColors } from '@/constants/theme';
import type { Booking } from '@/lib/types';

interface Props {
  visible: boolean;
  booking: Booking | null;
  onClose: () => void;
  onConfirm: (booking: Booking, reason: string) => Promise<void> | void;
}

export function CancelBookingModal({ visible, booking, onClose, onConfirm }: Props) {
  const [reason, setReason] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (visible) {
      setReason('');
      setError(null);
      setSubmitting(false);
    }
  }, [visible]);

  const handleConfirm = async () => {
    if (!booking) return;
    const trimmed = reason.trim();
    if (trimmed.length < 5) {
      setError('Please enter a reason (minimum 5 characters).');
      return;
    }
    setError(null);
    setSubmitting(true);
    try {
      await onConfirm(booking, trimmed);
      onClose();
    } catch (e: any) {
      setError(e?.message ?? 'Failed to cancel booking.');
    } finally {
      setSubmitting(false);
    }
  };

  const customerName = booking?.customer?.name ?? 'Unknown';
  const roomNumber = booking?.room?.room_number ?? '—';

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
            <Text style={styles.title}>Cancel Booking</Text>
            <Pressable onPress={onClose} hitSlop={12}>
              <Text style={styles.closeBtn}>✕</Text>
            </Pressable>
          </View>

          <Text style={styles.context}>
            Cancelling booking for <Text style={styles.contextBold}>{customerName}</Text> in{' '}
            <Text style={styles.contextBold}>Room #{roomNumber}</Text>.
          </Text>

          <Text style={styles.label}>Cancellation Reason</Text>
          <TextInput
            style={[styles.input, error && styles.inputError]}
            value={reason}
            onChangeText={setReason}
            placeholder="e.g. Customer requested refund"
            placeholderTextColor={AppColors.grey}
            multiline
            numberOfLines={3}
          />
          {error && <Text style={styles.errorText}>{error}</Text>}

          <View style={styles.actions}>
            <Pressable
              style={({ pressed }) => [
                styles.actionBtn,
                styles.backBtn,
                pressed && { opacity: 0.8 },
              ]}
              onPress={onClose}
              disabled={submitting}
            >
              <Text style={styles.backBtnText}>Go Back</Text>
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
                <Text style={styles.confirmBtnText}>Confirm Cancellation</Text>
              )}
            </Pressable>
          </View>
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
  context: {
    fontSize: 14,
    color: AppColors.grey,
    marginBottom: 16,
    lineHeight: 20,
  },
  contextBold: {
    fontWeight: '700',
    color: AppColors.black,
  },
  label: {
    fontSize: 14,
    fontWeight: '600',
    color: AppColors.black,
    marginBottom: 8,
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
    minHeight: 80,
    textAlignVertical: 'top',
  },
  inputError: {
    borderColor: AppColors.danger,
  },
  errorText: {
    color: AppColors.danger,
    fontSize: 12,
    marginTop: 6,
    fontWeight: '500',
  },
  actions: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 24,
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
    backgroundColor: AppColors.danger,
  },
  confirmBtnText: {
    fontSize: 15,
    fontWeight: '700',
    color: AppColors.white,
  },
});
