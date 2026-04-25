import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { AppColors } from '@/constants/theme';
import { fetchBookingById } from '@/services/bookings';
import type { Booking, BookingType, PaymentStatus } from '@/lib/types';

const TYPE_LABELS: Record<BookingType, string> = {
  full_day: 'Full Day',
  half_day: '12 Hours',
  hourly: 'Hourly',
};

const PAYMENT_LABELS: Record<PaymentStatus, string> = {
  pending: 'Pending',
  partial: 'Partial',
  paid: 'Paid',
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

function getDuration(booking: Booking): string {
  if (booking.booking_type === 'hourly' && booking.hours) {
    return `${booking.hours} hour${booking.hours > 1 ? 's' : ''}`;
  }
  if (booking.booking_type === 'half_day') return '12 hours';
  const checkIn = new Date(booking.check_in);
  const checkOut = new Date(booking.check_out);
  if (isNaN(checkIn.getTime()) || isNaN(checkOut.getTime())) return '—';
  const days = Math.max(
    1,
    Math.ceil((checkOut.getTime() - checkIn.getTime()) / (1000 * 60 * 60 * 24)),
  );
  return `${days} night${days > 1 ? 's' : ''}`;
}

function getRateText(booking: Booking): string {
  const room = booking.room;
  if (!room) return '';
  if (booking.booking_type === 'full_day') return `₹${room.price}/night`;
  if (booking.booking_type === 'half_day') {
    return `₹${room.half_day_price ?? Math.round(room.price * 0.6)}/12hrs`;
  }
  return `₹${room.hourly_price ?? Math.round(room.price / 24)}/hr`;
}

export default function BookingConfirmationScreen() {
  const { bookingId } = useLocalSearchParams<{ bookingId: string }>();
  const router = useRouter();
  const [booking, setBooking] = useState<Booking | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!bookingId) {
      setError('No booking ID provided.');
      setLoading(false);
      return;
    }
    fetchBookingById(bookingId)
      .then((b) => setBooking(b))
      .catch((e: any) => setError(e?.message ?? 'Failed to load booking.'))
      .finally(() => setLoading(false));
  }, [bookingId]);

  if (loading) {
    return (
      <SafeAreaView style={styles.container} edges={['top']}>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={AppColors.primary} />
          <Text style={styles.loadingText}>Loading booking...</Text>
        </View>
      </SafeAreaView>
    );
  }

  if (error || !booking) {
    return (
      <SafeAreaView style={styles.container} edges={['top']}>
        <View style={styles.loadingContainer}>
          <Text style={styles.errorText}>{error ?? 'Booking not found.'}</Text>
          <Pressable
            style={styles.primaryBtn}
            onPress={() => router.replace('/(tabs)/bookings')}
          >
            <Text style={styles.primaryBtnText}>Back to Bookings</Text>
          </Pressable>
        </View>
      </SafeAreaView>
    );
  }

  const withTime = booking.booking_type !== 'full_day';
  const balanceDue = Math.max(0, (booking.total_amount ?? 0) - (booking.amount_paid ?? 0));

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <ScrollView contentContainerStyle={styles.scrollContent}>
        <View style={styles.successHeader}>
          <View style={styles.successIcon}>
            <Text style={styles.successIconText}>✓</Text>
          </View>
          <Text style={styles.successTitle}>Booking Confirmed</Text>
          <Text style={styles.successSubtitle}>
            Reference: #{booking.id.slice(0, 8).toUpperCase()}
          </Text>
        </View>

        <View style={styles.card}>
          <Text style={styles.sectionTitle}>Customer</Text>
          <Row label="Name" value={booking.customer?.name ?? '—'} />
          <Row label="Phone" value={booking.customer?.phone ?? '—'} />
          <Row label="ID Proof" value={booking.customer?.id_proof ?? '—'} />
        </View>

        <View style={styles.card}>
          <Text style={styles.sectionTitle}>Stay Details</Text>
          <Row label="Room" value={`#${booking.room?.room_number ?? '—'} · ${booking.room?.type ?? ''}`} />
          <Row label="Booking Type" value={TYPE_LABELS[booking.booking_type]} />
          <Row label="Check-in" value={formatDateTime(booking.check_in, withTime)} />
          <Row label="Check-out" value={formatDateTime(booking.check_out, withTime)} />
          <Row label="Duration" value={getDuration(booking)} />
        </View>

        <View style={styles.card}>
          <Text style={styles.sectionTitle}>Pricing</Text>
          <Row label="Rate" value={getRateText(booking)} />
          <Row label="Total Amount" value={`₹${booking.total_amount}`} emphasis />
        </View>

        <View style={styles.card}>
          <Text style={styles.sectionTitle}>Payment</Text>
          <Row label="Status" value={PAYMENT_LABELS[booking.payment_status]} />
          {booking.payment_method && (
            <Row label="Method" value={booking.payment_method.toUpperCase()} />
          )}
          <Row label="Amount Paid" value={`₹${booking.amount_paid ?? 0}`} />
          {balanceDue > 0 && (
            <Row label="Balance Due" value={`₹${balanceDue}`} danger />
          )}
        </View>

        <View style={styles.actions}>
          <Pressable
            style={({ pressed }) => [
              styles.secondaryBtn,
              pressed && { opacity: 0.85 },
            ]}
            onPress={() => router.replace('/(tabs)/add-booking')}
          >
            <Text style={styles.secondaryBtnText}>Create Another Booking</Text>
          </Pressable>
          <Pressable
            style={({ pressed }) => [styles.primaryBtn, pressed && { opacity: 0.85 }]}
            onPress={() => router.replace('/(tabs)/bookings')}
          >
            <Text style={styles.primaryBtnText}>Back to Bookings</Text>
          </Pressable>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

function Row({
  label,
  value,
  emphasis,
  danger,
}: {
  label: string;
  value: string;
  emphasis?: boolean;
  danger?: boolean;
}) {
  return (
    <View style={styles.row}>
      <Text style={styles.rowLabel}>{label}</Text>
      <Text
        style={[
          styles.rowValue,
          emphasis && styles.rowValueEmphasis,
          danger && { color: AppColors.danger },
        ]}
      >
        {value}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: AppColors.lightGrey,
  },
  scrollContent: {
    padding: 20,
    paddingBottom: 40,
  },
  loadingContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
    gap: 16,
  },
  loadingText: {
    fontSize: 15,
    color: AppColors.grey,
    fontWeight: '500',
  },
  errorText: {
    fontSize: 16,
    color: AppColors.danger,
    fontWeight: '600',
    textAlign: 'center',
  },
  successHeader: {
    alignItems: 'center',
    paddingVertical: 24,
    marginBottom: 16,
  },
  successIcon: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: AppColors.success,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
    shadowColor: AppColors.success,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 6,
  },
  successIconText: {
    fontSize: 36,
    fontWeight: '800',
    color: AppColors.white,
  },
  successTitle: {
    fontSize: 24,
    fontWeight: '800',
    color: AppColors.black,
    marginBottom: 4,
  },
  successSubtitle: {
    fontSize: 13,
    color: AppColors.grey,
    fontWeight: '600',
    letterSpacing: 0.5,
  },
  card: {
    backgroundColor: AppColors.white,
    borderRadius: 16,
    padding: 20,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: AppColors.border,
  },
  sectionTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: AppColors.primary,
    marginBottom: 12,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    paddingVertical: 8,
    gap: 12,
  },
  rowLabel: {
    fontSize: 14,
    color: AppColors.grey,
    fontWeight: '500',
    flex: 1,
  },
  rowValue: {
    fontSize: 14,
    color: AppColors.black,
    fontWeight: '600',
    textAlign: 'right',
    flex: 1,
  },
  rowValueEmphasis: {
    fontSize: 18,
    fontWeight: '800',
    color: AppColors.primary,
  },
  actions: {
    marginTop: 16,
    gap: 10,
  },
  primaryBtn: {
    backgroundColor: AppColors.primary,
    paddingVertical: 16,
    borderRadius: 12,
    alignItems: 'center',
  },
  primaryBtnText: {
    fontSize: 16,
    fontWeight: '700',
    color: AppColors.white,
  },
  secondaryBtn: {
    backgroundColor: AppColors.white,
    paddingVertical: 16,
    borderRadius: 12,
    alignItems: 'center',
    borderWidth: 1.5,
    borderColor: AppColors.primary,
  },
  secondaryBtnText: {
    fontSize: 16,
    fontWeight: '700',
    color: AppColors.primary,
  },
});
