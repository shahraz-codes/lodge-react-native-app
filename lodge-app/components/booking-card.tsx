import React from 'react';
import { View, Text, StyleSheet, Pressable, Alert, Platform } from 'react-native';
import { AppColors } from '@/constants/theme';
import type { Booking, BookingType, PaymentStatus } from '@/lib/types';

interface Props {
  booking: Booking;
  onCheckIn?: (booking: Booking) => void;
  onCheckOut?: (booking: Booking) => void;
  onCancel?: (booking: Booking) => void;
  onExtend?: (booking: Booking) => void;
}

const STATUS_LABELS: Record<string, { bg: string; text: string }> = {
  booked: { bg: AppColors.info, text: 'Booked' },
  checked_in: { bg: AppColors.success, text: 'Checked In' },
  checked_out: { bg: AppColors.grey, text: 'Checked Out' },
  cancelled: { bg: AppColors.danger, text: 'Cancelled' },
};

const TYPE_LABELS: Record<BookingType, string> = {
  full_day: 'Full Day',
  half_day: '12 Hours',
  hourly: 'Hourly',
};

const PAYMENT_LABELS: Record<PaymentStatus, { bg: string; text: string }> = {
  pending: { bg: AppColors.warning, text: 'Pending' },
  partial: { bg: AppColors.info, text: 'Partial' },
  paid: { bg: AppColors.success, text: 'Paid' },
};

function formatDateTime(dateStr: string, withTime: boolean): string {
  if (!dateStr) return '—';
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return '—';
  if (!withTime) {
    return d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
  }
  return d.toLocaleString('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: true,
  });
}

export function BookingCard({ booking, onCheckIn, onCheckOut, onCancel, onExtend }: Props) {
  const status = STATUS_LABELS[booking.status] ?? STATUS_LABELS.booked;
  const customerName = booking.customer?.name ?? 'Unknown';
  const roomNumber = booking.room?.room_number ?? '—';
  const withTime = booking.booking_type !== 'full_day';
  const typeLabel =
    booking.booking_type === 'hourly' && booking.hours
      ? `${booking.hours}h`
      : TYPE_LABELS[booking.booking_type] ?? 'Full Day';

  const paymentInfo = PAYMENT_LABELS[booking.payment_status] ?? PAYMENT_LABELS.pending;
  const balanceDue = Math.max(0, (booking.total_amount ?? 0) - (booking.amount_paid ?? 0));

  const handleCheckIn = () => {
    if (Platform.OS === 'web') {
      if (confirm(`Check in ${customerName} to Room #${roomNumber}?`)) {
        onCheckIn?.(booking);
      }
      return;
    }
    Alert.alert('Check In', `Check in ${customerName} to Room #${roomNumber}?`, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Check In', onPress: () => onCheckIn?.(booking) },
    ]);
  };

  const handleCheckOut = () => {
    if (Platform.OS === 'web') {
      if (confirm(`Check out ${customerName} from Room #${roomNumber}?`)) {
        onCheckOut?.(booking);
      }
      return;
    }
    Alert.alert('Check Out', `Check out ${customerName} from Room #${roomNumber}?`, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Check Out', style: 'destructive', onPress: () => onCheckOut?.(booking) },
    ]);
  };

  const isActionable = booking.status === 'booked' || booking.status === 'checked_in';

  return (
    <View style={styles.card}>
      <View style={styles.header}>
        <View style={{ flex: 1 }}>
          <Text style={styles.customer}>{customerName}</Text>
          <View style={styles.subHeaderRow}>
            <Text style={styles.room}>Room #{roomNumber}</Text>
            <View style={styles.typeBadge}>
              <Text style={styles.typeBadgeText}>{typeLabel}</Text>
            </View>
          </View>
        </View>
        <View style={[styles.badge, { backgroundColor: status.bg }]}>
          <Text style={styles.badgeText}>{status.text}</Text>
        </View>
      </View>

      <View style={styles.dates}>
        <View style={styles.dateBlock}>
          <Text style={styles.dateLabel}>Check-in</Text>
          <Text style={styles.dateValue}>{formatDateTime(booking.check_in, withTime)}</Text>
        </View>
        <View style={styles.dateBlock}>
          <Text style={styles.dateLabel}>Check-out</Text>
          <Text style={styles.dateValue}>{formatDateTime(booking.check_out, withTime)}</Text>
        </View>
        <View style={styles.dateBlock}>
          <Text style={styles.dateLabel}>Amount</Text>
          <Text style={[styles.dateValue, { color: AppColors.primary }]}>
            ₹{booking.total_amount}
          </Text>
        </View>
      </View>

      <View style={styles.paymentRow}>
        <View style={[styles.paymentBadge, { backgroundColor: paymentInfo.bg }]}>
          <Text style={styles.paymentBadgeText}>{paymentInfo.text}</Text>
        </View>
        <Text style={styles.paymentDetail}>
          ₹{booking.amount_paid ?? 0} / ₹{booking.total_amount}
          {booking.payment_method ? ` · ${booking.payment_method.toUpperCase()}` : ''}
        </Text>
        {booking.payment_status === 'partial' && balanceDue > 0 && (
          <Text style={styles.balanceText}>Balance: ₹{balanceDue}</Text>
        )}
      </View>

      {booking.status === 'cancelled' && booking.cancellation_reason && (
        <View style={styles.cancelReasonBox}>
          <Text style={styles.cancelReasonLabel}>Cancellation Reason</Text>
          <Text style={styles.cancelReasonText}>{booking.cancellation_reason}</Text>
        </View>
      )}

      {isActionable && (
        <View style={styles.actions}>
          {booking.status === 'booked' && (
            <>
              <Pressable style={[styles.btn, styles.btnCheckIn]} onPress={handleCheckIn}>
                <Text style={styles.btnText}>Check In</Text>
              </Pressable>
              {onCancel && (
                <Pressable
                  style={[styles.btn, styles.btnCancel]}
                  onPress={() => onCancel(booking)}
                >
                  <Text style={styles.btnText}>Cancel</Text>
                </Pressable>
              )}
            </>
          )}
          {booking.status === 'checked_in' && (
            <>
              {onExtend && (
                <Pressable
                  style={[styles.btn, styles.btnExtend]}
                  onPress={() => onExtend(booking)}
                >
                  <Text style={styles.btnText}>Extend</Text>
                </Pressable>
              )}
              <Pressable style={[styles.btn, styles.btnCheckOut]} onPress={handleCheckOut}>
                <Text style={styles.btnText}>Check Out</Text>
              </Pressable>
            </>
          )}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: AppColors.white,
    borderRadius: 12,
    padding: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.08,
    shadowRadius: 4,
    elevation: 2,
    marginBottom: 12,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 12,
  },
  customer: {
    fontSize: 17,
    fontWeight: '700',
    color: AppColors.black,
  },
  subHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 4,
  },
  room: {
    fontSize: 14,
    color: AppColors.grey,
  },
  typeBadge: {
    backgroundColor: AppColors.lightGrey,
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 6,
  },
  typeBadgeText: {
    fontSize: 10,
    fontWeight: '700',
    color: AppColors.grey,
    textTransform: 'uppercase',
    letterSpacing: 0.3,
  },
  badge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
  },
  badgeText: {
    color: AppColors.white,
    fontSize: 11,
    fontWeight: '700',
    textTransform: 'uppercase',
  },
  dates: {
    flexDirection: 'row',
    gap: 12,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: AppColors.border,
  },
  dateBlock: {
    flex: 1,
  },
  dateLabel: {
    fontSize: 11,
    color: AppColors.grey,
    textTransform: 'uppercase',
    fontWeight: '600',
    marginBottom: 4,
  },
  dateValue: {
    fontSize: 13,
    fontWeight: '600',
    color: AppColors.black,
  },
  paymentRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 12,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: AppColors.border,
  },
  paymentBadge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
  },
  paymentBadgeText: {
    color: AppColors.white,
    fontSize: 10,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.3,
  },
  paymentDetail: {
    fontSize: 12,
    color: AppColors.grey,
    fontWeight: '600',
  },
  balanceText: {
    marginLeft: 'auto',
    fontSize: 12,
    color: AppColors.danger,
    fontWeight: '700',
  },
  cancelReasonBox: {
    marginTop: 12,
    padding: 12,
    borderRadius: 10,
    backgroundColor: '#fef2f2',
    borderWidth: 1,
    borderColor: '#fecaca',
  },
  cancelReasonLabel: {
    fontSize: 11,
    color: AppColors.danger,
    fontWeight: '700',
    textTransform: 'uppercase',
    marginBottom: 4,
  },
  cancelReasonText: {
    fontSize: 13,
    color: AppColors.black,
    fontWeight: '500',
  },
  actions: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 16,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: AppColors.border,
  },
  btn: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 10,
    alignItems: 'center',
  },
  btnCheckIn: {
    backgroundColor: AppColors.success,
  },
  btnCheckOut: {
    backgroundColor: AppColors.danger,
  },
  btnCancel: {
    backgroundColor: AppColors.grey,
  },
  btnExtend: {
    backgroundColor: AppColors.primaryLight,
  },
  btnText: {
    color: AppColors.white,
    fontWeight: '700',
    fontSize: 14,
  },
});
