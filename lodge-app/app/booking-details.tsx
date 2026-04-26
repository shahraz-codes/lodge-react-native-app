import React, { useCallback, useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
  ActivityIndicator,
  Modal,
  Image,
  Linking,
  Platform,
  Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import * as WebBrowser from 'expo-web-browser';
import { AppColors } from '@/constants/theme';
import { fetchBookingById } from '@/services/bookings';
import { getIdProofSignedUrl, type IdProofResolved } from '@/services/storage';
import type {
  Booking,
  BookingType,
  PaymentStatus,
  BookingStatus,
} from '@/lib/types';

const TYPE_LABELS: Record<BookingType, string> = {
  full_day: 'Full Day',
  half_day: '12 Hours',
  hourly: 'Hourly',
};

const PAYMENT_LABELS: Record<PaymentStatus, { label: string; color: string }> = {
  pending: { label: 'Pending', color: AppColors.warning },
  partial: { label: 'Partial', color: AppColors.info },
  paid: { label: 'Paid', color: AppColors.success },
};

const STATUS_LABELS: Record<BookingStatus, { label: string; color: string }> = {
  booked: { label: 'Booked', color: AppColors.info },
  checked_in: { label: 'Checked In', color: AppColors.success },
  checked_out: { label: 'Checked Out', color: AppColors.grey },
  cancelled: { label: 'Cancelled', color: AppColors.danger },
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

export default function BookingDetailsScreen() {
  const { bookingId } = useLocalSearchParams<{ bookingId: string }>();
  const router = useRouter();

  const [booking, setBooking] = useState<Booking | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [docResolved, setDocResolved] = useState<IdProofResolved | null>(null);
  const [docLoading, setDocLoading] = useState(false);
  const [docError, setDocError] = useState<string | null>(null);
  const [viewerVisible, setViewerVisible] = useState(false);

  const load = useCallback(async () => {
    if (!bookingId) {
      setError('No booking ID provided.');
      setLoading(false);
      return;
    }
    try {
      const b = await fetchBookingById(bookingId);
      setBooking(b);
    } catch (e: any) {
      setError(e?.message ?? 'Failed to load booking.');
    } finally {
      setLoading(false);
    }
  }, [bookingId]);

  useEffect(() => {
    load();
  }, [load]);

  const idProofPath = booking?.customer?.id_proof_document_url ?? null;

  useEffect(() => {
    if (!idProofPath) {
      setDocResolved(null);
      return;
    }
    let cancelled = false;
    setDocLoading(true);
    setDocError(null);
    getIdProofSignedUrl(idProofPath)
      .then((resolved) => {
        if (!cancelled) setDocResolved(resolved);
      })
      .catch((e: any) => {
        if (!cancelled) {
          setDocError(e?.message ?? 'Could not load ID proof document.');
        }
      })
      .finally(() => {
        if (!cancelled) setDocLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [idProofPath]);

  const openExternally = useCallback(async () => {
    if (!docResolved?.url) return;
    try {
      if (Platform.OS === 'web') {
        if (typeof window !== 'undefined') {
          window.open(docResolved.url, '_blank');
        }
        return;
      }
      // PDFs and other non-image documents open best in the in-app browser.
      await WebBrowser.openBrowserAsync(docResolved.url);
    } catch {
      try {
        await Linking.openURL(docResolved.url);
      } catch (e: any) {
        Alert.alert('Could not open document', e?.message ?? 'Try again later.');
      }
    }
  }, [docResolved]);

  if (loading) {
    return (
      <SafeAreaView style={styles.container} edges={['top']}>
        <Header onBack={() => router.back()} title="Booking Details" />
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
        <Header onBack={() => router.back()} title="Booking Details" />
        <View style={styles.loadingContainer}>
          <Text style={styles.errorText}>{error ?? 'Booking not found.'}</Text>
          <Pressable style={styles.primaryBtn} onPress={() => router.back()}>
            <Text style={styles.primaryBtnText}>Go Back</Text>
          </Pressable>
        </View>
      </SafeAreaView>
    );
  }

  const withTime = booking.booking_type !== 'full_day';
  const balanceDue = Math.max(0, (booking.total_amount ?? 0) - (booking.amount_paid ?? 0));
  const statusInfo = STATUS_LABELS[booking.status] ?? STATUS_LABELS.booked;
  const paymentInfo = PAYMENT_LABELS[booking.payment_status] ?? PAYMENT_LABELS.pending;

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <Header onBack={() => router.back()} title="Booking Details" />

      <ScrollView contentContainerStyle={styles.scrollContent}>
        <View style={styles.summaryCard}>
          <Text style={styles.referenceLabel}>Reference</Text>
          <Text style={styles.referenceValue}>
            #{booking.id.slice(0, 8).toUpperCase()}
          </Text>
          <View style={styles.badgeRow}>
            <View style={[styles.statusBadge, { backgroundColor: statusInfo.color }]}>
              <Text style={styles.statusBadgeText}>{statusInfo.label}</Text>
            </View>
            <View style={[styles.statusBadge, { backgroundColor: paymentInfo.color }]}>
              <Text style={styles.statusBadgeText}>Payment · {paymentInfo.label}</Text>
            </View>
          </View>
        </View>

        <View style={styles.card}>
          <Text style={styles.sectionTitle}>Customer</Text>
          <Row label="Name" value={booking.customer?.name ?? '—'} />
          <Row label="Phone" value={booking.customer?.phone ?? '—'} />
          <Row label="ID Proof" value={booking.customer?.id_proof ?? '—'} />
        </View>

        <View style={styles.card}>
          <Text style={styles.sectionTitle}>ID Proof Document</Text>
          {!idProofPath ? (
            <Text style={styles.muted}>
              No soft copy was uploaded for this booking.
            </Text>
          ) : docLoading ? (
            <View style={styles.docLoadingRow}>
              <ActivityIndicator color={AppColors.primary} />
              <Text style={styles.muted}>Preparing document…</Text>
            </View>
          ) : docError ? (
            <View>
              <Text style={[styles.muted, { color: AppColors.danger }]}>{docError}</Text>
              <Pressable
                style={[styles.secondaryBtn, { marginTop: 10 }]}
                onPress={() => {
                  setDocError(null);
                  setDocLoading(true);
                  getIdProofSignedUrl(idProofPath)
                    .then((r) => setDocResolved(r))
                    .catch((e: any) => setDocError(e?.message ?? 'Try again later.'))
                    .finally(() => setDocLoading(false));
                }}
              >
                <Text style={styles.secondaryBtnText}>Retry</Text>
              </Pressable>
            </View>
          ) : docResolved ? (
            <View>
              <Pressable
                style={({ pressed }) => [
                  styles.docPreview,
                  pressed && { opacity: 0.85 },
                ]}
                onPress={() =>
                  docResolved.isPdf ? openExternally() : setViewerVisible(true)
                }
              >
                {docResolved.isPdf ? (
                  <View style={styles.docPdf}>
                    <Text style={styles.docPdfBadge}>PDF</Text>
                    <Text style={styles.docPdfHint}>Tap to open in browser</Text>
                  </View>
                ) : (
                  <Image
                    source={{ uri: docResolved.url }}
                    style={styles.docThumb}
                    resizeMode="cover"
                  />
                )}
                <View style={styles.docMeta}>
                  <Text style={styles.docMetaTitle}>
                    {docResolved.isPdf ? 'PDF document' : 'Image attachment'}
                  </Text>
                  <Text style={styles.docMetaHint}>
                    {docResolved.isPdf
                      ? 'Open the PDF to inspect the original copy'
                      : 'Tap to view full screen'}
                  </Text>
                </View>
              </Pressable>

              <View style={styles.docActions}>
                {!docResolved.isPdf && (
                  <Pressable
                    style={({ pressed }) => [
                      styles.primaryBtn,
                      { flex: 1 },
                      pressed && { opacity: 0.85 },
                    ]}
                    onPress={() => setViewerVisible(true)}
                  >
                    <Text style={styles.primaryBtnText}>View Full Screen</Text>
                  </Pressable>
                )}
                <Pressable
                  style={({ pressed }) => [
                    styles.secondaryBtn,
                    { flex: 1 },
                    pressed && { opacity: 0.85 },
                  ]}
                  onPress={openExternally}
                >
                  <Text style={styles.secondaryBtnText}>Open in Browser</Text>
                </Pressable>
              </View>
            </View>
          ) : null}
        </View>

        <View style={styles.card}>
          <Text style={styles.sectionTitle}>Stay Details</Text>
          <Row
            label="Room"
            value={`#${booking.room?.room_number ?? '—'}${
              booking.room?.type ? ` · ${booking.room.type}` : ''
            }`}
          />
          <Row label="Booking Type" value={TYPE_LABELS[booking.booking_type]} />
          <Row label="Check-in" value={formatDateTime(booking.check_in, withTime)} />
          <Row label="Check-out" value={formatDateTime(booking.check_out, withTime)} />
          <Row label="Duration" value={getDuration(booking)} />
        </View>

        <View style={styles.card}>
          <Text style={styles.sectionTitle}>Pricing & Payment</Text>
          <Row label="Total Amount" value={`₹${booking.total_amount}`} emphasis />
          <Row label="Amount Paid" value={`₹${booking.amount_paid ?? 0}`} />
          {balanceDue > 0 && (
            <Row label="Balance Due" value={`₹${balanceDue}`} danger />
          )}
          {booking.payment_method && (
            <Row label="Method" value={booking.payment_method.toUpperCase()} />
          )}
        </View>

        {booking.status === 'cancelled' && booking.cancellation_reason && (
          <View style={[styles.card, styles.cancelCard]}>
            <Text style={[styles.sectionTitle, { color: AppColors.danger }]}>
              Cancellation Reason
            </Text>
            <Text style={styles.cancelText}>{booking.cancellation_reason}</Text>
          </View>
        )}
      </ScrollView>

      <Modal
        visible={viewerVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setViewerVisible(false)}
      >
        <View style={styles.viewerRoot}>
          <View style={styles.viewerHeader}>
            <Pressable
              style={({ pressed }) => [
                styles.viewerHeaderBtn,
                pressed && { opacity: 0.85 },
              ]}
              onPress={() => setViewerVisible(false)}
              hitSlop={12}
            >
              <Text style={styles.viewerHeaderBtnText}>Close</Text>
            </Pressable>
            <Text style={styles.viewerTitle} numberOfLines={1}>
              ID Proof
            </Text>
            <Pressable
              style={({ pressed }) => [
                styles.viewerHeaderBtn,
                pressed && { opacity: 0.85 },
              ]}
              onPress={openExternally}
              hitSlop={12}
            >
              <Text style={styles.viewerHeaderBtnText}>Open</Text>
            </Pressable>
          </View>
          <View style={styles.viewerImageWrap}>
            {docResolved?.url && !docResolved.isPdf ? (
              <Image
                source={{ uri: docResolved.url }}
                style={styles.viewerImage}
                resizeMode="contain"
              />
            ) : (
              <Text style={styles.viewerEmpty}>
                Cannot preview this file inline. Tap "Open" to view it.
              </Text>
            )}
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

function Header({ onBack, title }: { onBack: () => void; title: string }) {
  return (
    <View style={styles.header}>
      <Pressable onPress={onBack} hitSlop={12}>
        <Text style={styles.backArrow}>←</Text>
      </Pressable>
      <Text style={styles.headerTitle}>{title}</Text>
      <View style={{ width: 32 }} />
    </View>
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
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 16,
    backgroundColor: AppColors.white,
    borderBottomWidth: 1,
    borderBottomColor: AppColors.border,
  },
  backArrow: {
    fontSize: 24,
    color: AppColors.primary,
    fontWeight: '700',
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: AppColors.black,
  },
  scrollContent: {
    padding: 16,
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
  summaryCard: {
    backgroundColor: AppColors.white,
    borderRadius: 16,
    padding: 18,
    borderWidth: 1,
    borderColor: AppColors.border,
    marginBottom: 12,
  },
  referenceLabel: {
    fontSize: 11,
    color: AppColors.grey,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  referenceValue: {
    fontSize: 22,
    fontWeight: '800',
    color: AppColors.primary,
    marginTop: 4,
    letterSpacing: 0.5,
  },
  badgeRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 12,
  },
  statusBadge: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 8,
  },
  statusBadgeText: {
    color: AppColors.white,
    fontSize: 11,
    fontWeight: '800',
    textTransform: 'uppercase',
    letterSpacing: 0.4,
  },
  card: {
    backgroundColor: AppColors.white,
    borderRadius: 16,
    padding: 18,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: AppColors.border,
  },
  cancelCard: {
    backgroundColor: '#fef2f2',
    borderColor: '#fecaca',
  },
  cancelText: {
    fontSize: 14,
    color: AppColors.black,
    lineHeight: 20,
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
    paddingVertical: 6,
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
  muted: {
    fontSize: 13,
    color: AppColors.grey,
    fontWeight: '500',
  },
  docLoadingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  docPreview: {
    flexDirection: 'row',
    gap: 12,
    padding: 10,
    borderRadius: 12,
    backgroundColor: AppColors.lightGrey,
    borderWidth: 1,
    borderColor: AppColors.border,
    alignItems: 'center',
  },
  docThumb: {
    width: 80,
    height: 80,
    borderRadius: 10,
    backgroundColor: AppColors.border,
  },
  docPdf: {
    width: 80,
    height: 80,
    borderRadius: 10,
    backgroundColor: '#fee2e2',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
  },
  docPdfBadge: {
    fontSize: 16,
    fontWeight: '900',
    color: '#dc2626',
    letterSpacing: 0.5,
  },
  docPdfHint: {
    fontSize: 9,
    color: '#9b1c1c',
    fontWeight: '600',
    textAlign: 'center',
    paddingHorizontal: 6,
  },
  docMeta: {
    flex: 1,
  },
  docMetaTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: AppColors.black,
  },
  docMetaHint: {
    fontSize: 12,
    color: AppColors.grey,
    marginTop: 4,
  },
  docActions: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 12,
  },
  primaryBtn: {
    backgroundColor: AppColors.primary,
    paddingVertical: 12,
    borderRadius: 10,
    alignItems: 'center',
  },
  primaryBtnText: {
    color: AppColors.white,
    fontSize: 14,
    fontWeight: '700',
  },
  secondaryBtn: {
    backgroundColor: AppColors.white,
    paddingVertical: 12,
    borderRadius: 10,
    alignItems: 'center',
    borderWidth: 1.5,
    borderColor: AppColors.primary,
  },
  secondaryBtnText: {
    color: AppColors.primary,
    fontSize: 14,
    fontWeight: '700',
  },
  viewerRoot: {
    flex: 1,
    backgroundColor: '#000000',
  },
  viewerHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 14,
    paddingTop: Platform.OS === 'ios' ? 50 : 14,
    backgroundColor: 'rgba(0,0,0,0.6)',
  },
  viewerHeaderBtn: {
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  viewerHeaderBtnText: {
    color: AppColors.white,
    fontSize: 16,
    fontWeight: '700',
  },
  viewerTitle: {
    flex: 1,
    color: AppColors.white,
    fontSize: 16,
    fontWeight: '700',
    textAlign: 'center',
  },
  viewerImageWrap: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 12,
  },
  viewerImage: {
    width: '100%',
    height: '100%',
  },
  viewerEmpty: {
    color: AppColors.white,
    fontSize: 14,
    textAlign: 'center',
    paddingHorizontal: 24,
  },
});
