import React, { useState, useMemo, useEffect } from 'react';
import {
  View,
  Text,
  TextInput,
  Pressable,
  StyleSheet,
  Alert,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
  Modal,
  FlatList,
  Image,
} from 'react-native';
import DateTimePicker, { DateTimePickerEvent } from '@react-native-community/datetimepicker';
import * as ImagePicker from 'expo-image-picker';
import * as DocumentPicker from 'expo-document-picker';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { AppColors } from '@/constants/theme';
import { useAvailableRoomsForSlot } from '@/hooks/use-rooms';
import { computeBookingAmount, createBooking } from '@/services/bookings';
import { LoadingOverlay } from '@/components/loading-overlay';
import type {
  BookingType,
  PaymentMethod,
  PaymentStatus,
  Room,
} from '@/lib/types';
import type { IdProofFile } from '@/services/storage';

const ID_PROOF_TYPES = ['Aadhaar', 'Passport', 'Driving Licence', 'Voter ID'] as const;
const MAX_FILE_SIZE = 5 * 1024 * 1024;
const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;

const BOOKING_TYPES: { value: BookingType; label: string }[] = [
  { value: 'full_day', label: 'Full Day' },
  { value: 'half_day', label: '12 Hours' },
  { value: 'hourly', label: 'Hourly' },
];

const PAYMENT_STATUSES: { value: PaymentStatus; label: string; color: string }[] = [
  { value: 'pending', label: 'Pending', color: AppColors.warning },
  { value: 'partial', label: 'Partial', color: AppColors.info },
  { value: 'paid', label: 'Paid', color: AppColors.success },
];

const PAYMENT_METHODS: { value: PaymentMethod; label: string }[] = [
  { value: 'cash', label: 'Cash' },
  { value: 'upi', label: 'UPI' },
  { value: 'card', label: 'Card' },
];

function startOfToday(): Date {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}

function nextNoon(): Date {
  const d = new Date();
  d.setHours(12, 0, 0, 0);
  if (d.getTime() < Date.now()) d.setDate(d.getDate() + 1);
  return d;
}

function formatDate(d: Date): string {
  return d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
}

function formatTime(d: Date): string {
  return d.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true });
}

function formatDateTime(d: Date): string {
  return `${formatDate(d)}, ${formatTime(d)}`;
}

function toISODate(d: Date): string {
  return d.toISOString().split('T')[0];
}

function toISODateTimeLocal(d: Date): string {
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  const hh = String(d.getHours()).padStart(2, '0');
  const mi = String(d.getMinutes()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}T${hh}:${mi}`;
}

export default function AddBookingScreen() {
  const router = useRouter();

  const [bookingType, setBookingType] = useState<BookingType>('full_day');

  const [customerName, setCustomerName] = useState('');
  const [phone, setPhone] = useState('');
  const [idProofType, setIdProofType] = useState('');
  const [idProofNumber, setIdProofNumber] = useState('');
  const [idProofDocument, setIdProofDocument] = useState<IdProofFile | null>(null);
  const [showIdProofPicker, setShowIdProofPicker] = useState(false);

  const [selectedRoom, setSelectedRoom] = useState<Room | null>(null);
  const [showRoomPicker, setShowRoomPicker] = useState(false);

  const [checkIn, setCheckIn] = useState<Date>(() => {
    const d = startOfToday();
    d.setHours(12, 0, 0, 0);
    return d;
  });
  const [checkOut, setCheckOut] = useState<Date>(() => {
    const d = startOfToday();
    d.setDate(d.getDate() + 1);
    d.setHours(11, 0, 0, 0);
    return d;
  });
  const [hours, setHours] = useState('3');

  const [showCheckInDate, setShowCheckInDate] = useState(false);
  const [showCheckInTime, setShowCheckInTime] = useState(false);
  const [showCheckOutDate, setShowCheckOutDate] = useState(false);

  const [paymentStatus, setPaymentStatus] = useState<PaymentStatus>('pending');
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod | null>(null);
  const [amountPaid, setAmountPaid] = useState('');

  const [submitting, setSubmitting] = useState(false);

  const showAlert = (title: string, message: string) => {
    if (Platform.OS === 'web') {
      alert(`${title}: ${message}`);
    } else {
      Alert.alert(title, message);
    }
  };

  const effectiveCheckOut = useMemo<Date>(() => {
    if (bookingType === 'full_day') return checkOut;
    if (bookingType === 'half_day') return new Date(checkIn.getTime() + 12 * HOUR_MS);
    const h = Math.max(1, parseInt(hours, 10) || 0);
    return new Date(checkIn.getTime() + h * HOUR_MS);
  }, [bookingType, checkIn, checkOut, hours]);

  const { rooms, loading: roomsLoading, refresh: refreshRooms } = useAvailableRoomsForSlot(
    checkIn,
    effectiveCheckOut,
  );

  useEffect(() => {
    if (!selectedRoom) return;
    if (!rooms.some((r) => r.id === selectedRoom.id)) {
      setSelectedRoom(null);
      showAlert(
        'Room no longer available',
        `Room #${selectedRoom.room_number} is no longer available for the selected time. Please choose another.`,
      );
    }
  }, [rooms, selectedRoom]);

  const totalDays = useMemo(() => {
    const diff = checkOut.getTime() - checkIn.getTime();
    return Math.max(1, Math.ceil(diff / DAY_MS));
  }, [checkIn, checkOut]);

  const totalAmount = useMemo(() => {
    if (!selectedRoom) return 0;
    return computeBookingAmount({
      bookingType,
      checkIn,
      checkOut: effectiveCheckOut,
      hours: parseInt(hours, 10) || 0,
      roomPrice: selectedRoom.price,
      halfDayPrice: selectedRoom.half_day_price,
      hourlyPrice: selectedRoom.hourly_price,
    });
  }, [selectedRoom, bookingType, checkIn, effectiveCheckOut, hours]);

  const rateText = useMemo(() => {
    if (!selectedRoom) return '';
    if (bookingType === 'full_day') return `₹${selectedRoom.price}/night`;
    if (bookingType === 'half_day') {
      const rate = selectedRoom.half_day_price ?? Math.round(selectedRoom.price * 0.6);
      return `₹${rate}/12hrs`;
    }
    const rate = selectedRoom.hourly_price ?? Math.round(selectedRoom.price / 24);
    return `₹${rate}/hr`;
  }, [selectedRoom, bookingType]);

  const durationText = useMemo(() => {
    if (bookingType === 'full_day') return `${totalDays} night${totalDays > 1 ? 's' : ''}`;
    if (bookingType === 'half_day') return '12 hours';
    const h = Math.max(1, parseInt(hours, 10) || 0);
    return `${h} hour${h > 1 ? 's' : ''}`;
  }, [bookingType, totalDays, hours]);

  const handleBookingTypeChange = (next: BookingType) => {
    setBookingType(next);
    const now = Date.now();
    if (next === 'full_day') {
      const ci = startOfToday();
      ci.setHours(12, 0, 0, 0);
      const co = new Date(ci.getTime());
      co.setDate(co.getDate() + 1);
      co.setHours(11, 0, 0, 0);
      setCheckIn(ci);
      setCheckOut(co);
    } else {
      const ci = checkIn.getTime() < now ? new Date(now + 5 * 60 * 1000) : checkIn;
      setCheckIn(new Date(ci));
    }
  };

  const handleCheckInDateChange = (_: DateTimePickerEvent, date?: Date) => {
    setShowCheckInDate(false);
    if (!date) return;
    const next = new Date(checkIn);
    next.setFullYear(date.getFullYear(), date.getMonth(), date.getDate());
    setCheckIn(next);
    if (bookingType === 'full_day' && next >= checkOut) {
      const co = new Date(next);
      co.setDate(co.getDate() + 1);
      setCheckOut(co);
    }
  };

  const handleCheckInTimeChange = (_: DateTimePickerEvent, date?: Date) => {
    setShowCheckInTime(false);
    if (!date) return;
    const next = new Date(checkIn);
    next.setHours(date.getHours(), date.getMinutes(), 0, 0);
    setCheckIn(next);
  };

  const handleCheckOutDateChange = (_: DateTimePickerEvent, date?: Date) => {
    setShowCheckOutDate(false);
    if (!date) return;
    if (date <= checkIn) {
      showAlert('Invalid Date', 'Check-out must be after check-in.');
      return;
    }
    setCheckOut(date);
  };

  const handleTakePhoto = async () => {
    const permission = await ImagePicker.requestCameraPermissionsAsync();
    if (!permission.granted) {
      showAlert('Permission Required', 'Camera access is needed to take a photo.');
      return;
    }
    const result = await ImagePicker.launchCameraAsync({
      mediaTypes: ['images'],
      quality: 0.7,
    });
    if (!result.canceled && result.assets[0]) {
      const asset = result.assets[0];
      if (asset.fileSize && asset.fileSize > MAX_FILE_SIZE) {
        showAlert('File Too Large', 'Please select a file under 5 MB.');
        return;
      }
      setIdProofDocument({
        uri: asset.uri,
        mimeType: asset.mimeType || 'image/jpeg',
        fileName: asset.fileName || `photo_${Date.now()}.jpg`,
      });
    }
  };

  const handlePickImage = async () => {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      quality: 0.7,
    });
    if (!result.canceled && result.assets[0]) {
      const asset = result.assets[0];
      if (asset.fileSize && asset.fileSize > MAX_FILE_SIZE) {
        showAlert('File Too Large', 'Please select a file under 5 MB.');
        return;
      }
      setIdProofDocument({
        uri: asset.uri,
        mimeType: asset.mimeType || 'image/jpeg',
        fileName: asset.fileName || `image_${Date.now()}.jpg`,
      });
    }
  };

  const handlePickPDF = async () => {
    const result = await DocumentPicker.getDocumentAsync({
      type: 'application/pdf',
      copyToCacheDirectory: true,
    });
    if (!result.canceled && result.assets[0]) {
      const asset = result.assets[0];
      if (asset.size && asset.size > MAX_FILE_SIZE) {
        showAlert('File Too Large', 'Please select a file under 5 MB.');
        return;
      }
      setIdProofDocument({
        uri: asset.uri,
        mimeType: asset.mimeType || 'application/pdf',
        fileName: asset.name || `document_${Date.now()}.pdf`,
      });
    }
  };

  const resetForm = () => {
    setCustomerName('');
    setPhone('');
    setIdProofType('');
    setIdProofNumber('');
    setIdProofDocument(null);
    setSelectedRoom(null);
    setBookingType('full_day');
    const ci = startOfToday();
    ci.setHours(12, 0, 0, 0);
    const co = new Date(ci.getTime());
    co.setDate(co.getDate() + 1);
    co.setHours(11, 0, 0, 0);
    setCheckIn(ci);
    setCheckOut(co);
    setHours('3');
    setPaymentStatus('pending');
    setPaymentMethod(null);
    setAmountPaid('');
  };

  const validate = (): boolean => {
    if (!customerName.trim()) {
      showAlert('Validation', 'Please enter the customer name.');
      return false;
    }
    if (!phone.trim() || phone.trim().length < 10) {
      showAlert('Validation', 'Please enter a valid phone number.');
      return false;
    }
    if (!idProofType) {
      showAlert('Validation', 'Please select an ID proof type.');
      return false;
    }
    if (!idProofNumber.trim()) {
      showAlert('Validation', 'Please enter the ID proof number.');
      return false;
    }
    if (!selectedRoom) {
      showAlert('Validation', 'Please select a room.');
      return false;
    }

    if (bookingType === 'full_day') {
      if (checkOut <= checkIn) {
        showAlert('Validation', 'Check-out date must be after check-in date.');
        return false;
      }
    } else if (bookingType === 'hourly') {
      const h = parseInt(hours, 10);
      if (!h || h < 1) {
        showAlert('Validation', 'Please enter a valid number of hours (minimum 1).');
        return false;
      }
    }

    if (paymentStatus !== 'pending' && !paymentMethod) {
      showAlert('Validation', 'Please select a payment method.');
      return false;
    }
    if (paymentStatus === 'partial') {
      const paid = parseFloat(amountPaid);
      if (!paid || paid <= 0 || paid >= totalAmount) {
        showAlert(
          'Validation',
          'For partial payment, amount paid must be greater than 0 and less than total.',
        );
        return false;
      }
    }
    return true;
  };

  const resolveAmountPaid = (): number => {
    if (paymentStatus === 'paid') return totalAmount;
    if (paymentStatus === 'partial') return parseFloat(amountPaid) || 0;
    return 0;
  };

  const handleSubmit = async () => {
    if (!validate()) return;

    setSubmitting(true);
    try {
      const booking = await createBooking({
        customerName: customerName.trim(),
        customerPhone: phone.trim(),
        customerIdProof: `${idProofType}: ${idProofNumber.trim()}`,
        roomId: selectedRoom!.id,
        roomPrice: selectedRoom!.price,
        halfDayPrice: selectedRoom!.half_day_price,
        hourlyPrice: selectedRoom!.hourly_price,
        bookingType,
        checkIn,
        checkOut: effectiveCheckOut,
        hours: bookingType === 'hourly' ? parseInt(hours, 10) : null,
        paymentStatus,
        paymentMethod: paymentStatus === 'pending' ? null : paymentMethod,
        amountPaid: resolveAmountPaid(),
        idProofDocument,
      });
      resetForm();
      refreshRooms();
      router.push({ pathname: '/booking-confirmation', params: { bookingId: booking.id } });
    } catch (err: any) {
      showAlert('Booking Failed', err.message || 'Unable to create booking.');
    } finally {
      setSubmitting(false);
    }
  };

  const renderDatePickerWeb = (
    value: Date,
    onPick: (d: Date) => void,
    min?: Date,
  ) =>
    React.createElement('input', {
      type: 'date',
      value: toISODate(value),
      min: min ? toISODate(min) : undefined,
      onChange: (e: any) => {
        const picked = new Date(e.target.value + 'T00:00:00');
        if (!isNaN(picked.getTime())) onPick(picked);
      },
      style: webInputStyle,
    });

  const renderDateTimePickerWeb = (
    value: Date,
    onPick: (d: Date) => void,
    min?: Date,
  ) =>
    React.createElement('input', {
      type: 'datetime-local',
      value: toISODateTimeLocal(value),
      min: min ? toISODateTimeLocal(min) : undefined,
      onChange: (e: any) => {
        const picked = new Date(e.target.value);
        if (!isNaN(picked.getTime())) onPick(picked);
      },
      style: webInputStyle,
    });

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.header}>
        <Text style={styles.title}>New Booking</Text>
      </View>

      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView contentContainerStyle={styles.form} keyboardShouldPersistTaps="handled">
          <Text style={styles.sectionTitle}>Customer Details</Text>

          <View style={styles.inputGroup}>
            <Text style={styles.label}>Full Name</Text>
            <TextInput
              style={styles.input}
              placeholder="Enter customer name"
              placeholderTextColor={AppColors.grey}
              value={customerName}
              onChangeText={setCustomerName}
            />
          </View>

          <View style={styles.inputGroup}>
            <Text style={styles.label}>Phone Number</Text>
            <TextInput
              style={styles.input}
              placeholder="Enter phone number"
              placeholderTextColor={AppColors.grey}
              value={phone}
              onChangeText={setPhone}
              keyboardType="phone-pad"
            />
          </View>

          <View style={styles.inputGroup}>
            <Text style={styles.label}>ID Proof Type</Text>
            <Pressable style={styles.selector} onPress={() => setShowIdProofPicker(true)}>
              <Text style={idProofType ? styles.selectorValue : styles.selectorPlaceholder}>
                {idProofType || 'Select ID proof type'}
              </Text>
            </Pressable>
          </View>

          <View style={styles.inputGroup}>
            <Text style={styles.label}>ID Proof Number</Text>
            <TextInput
              style={styles.input}
              placeholder={idProofType ? `Enter ${idProofType} number` : 'Enter ID number'}
              placeholderTextColor={AppColors.grey}
              value={idProofNumber}
              onChangeText={setIdProofNumber}
            />
          </View>

          <View style={styles.inputGroup}>
            <Text style={styles.label}>Upload ID Proof Copy (Optional)</Text>
            {idProofDocument ? (
              <View style={styles.docPreview}>
                {idProofDocument.mimeType.startsWith('image/') ? (
                  <Image source={{ uri: idProofDocument.uri }} style={styles.docThumbnail} />
                ) : (
                  <View style={styles.pdfBadge}>
                    <Text style={styles.pdfBadgeText}>PDF</Text>
                  </View>
                )}
                <Text style={styles.docFileName} numberOfLines={1}>
                  {idProofDocument.fileName}
                </Text>
                <Pressable
                  style={styles.docRemoveBtn}
                  onPress={() => setIdProofDocument(null)}
                >
                  <Text style={styles.docRemoveText}>✕</Text>
                </Pressable>
              </View>
            ) : (
              <View style={styles.docActions}>
                {Platform.OS !== 'web' && (
                  <Pressable style={styles.docActionBtn} onPress={handleTakePhoto}>
                    <Text style={styles.docActionIcon}>📷</Text>
                    <Text style={styles.docActionLabel}>Camera</Text>
                  </Pressable>
                )}
                <Pressable style={styles.docActionBtn} onPress={handlePickImage}>
                  <Text style={styles.docActionIcon}>🖼️</Text>
                  <Text style={styles.docActionLabel}>Gallery</Text>
                </Pressable>
                <Pressable style={styles.docActionBtn} onPress={handlePickPDF}>
                  <Text style={styles.docActionIcon}>📄</Text>
                  <Text style={styles.docActionLabel}>PDF</Text>
                </Pressable>
              </View>
            )}
          </View>

          <Text style={[styles.sectionTitle, { marginTop: 12 }]}>Booking Type</Text>
          <View style={styles.chipRowWrap}>
            {BOOKING_TYPES.map((bt) => (
              <Pressable
                key={bt.value}
                style={[styles.typeChip, bookingType === bt.value && styles.typeChipActive]}
                onPress={() => handleBookingTypeChange(bt.value)}
              >
                <Text
                  style={[
                    styles.typeChipText,
                    bookingType === bt.value && styles.typeChipTextActive,
                  ]}
                >
                  {bt.label}
                </Text>
              </Pressable>
            ))}
          </View>

          <Text style={[styles.sectionTitle, { marginTop: 16 }]}>
            {bookingType === 'full_day' ? 'Dates' : 'Check-in Date & Time'}
          </Text>

          {bookingType === 'full_day' ? (
            <View style={styles.dateRow}>
              <View style={[styles.inputGroup, { flex: 1 }]}>
                <Text style={styles.label}>Check-in</Text>
                {Platform.OS === 'web' ? (
                  renderDatePickerWeb(checkIn, (d) => {
                    const next = new Date(checkIn);
                    next.setFullYear(d.getFullYear(), d.getMonth(), d.getDate());
                    setCheckIn(next);
                    if (next >= checkOut) {
                      const co = new Date(next);
                      co.setDate(co.getDate() + 1);
                      setCheckOut(co);
                    }
                  }, startOfToday())
                ) : (
                  <Pressable style={styles.selector} onPress={() => setShowCheckInDate(true)}>
                    <Text style={styles.selectorValue}>{formatDate(checkIn)}</Text>
                  </Pressable>
                )}
              </View>
              <View style={[styles.inputGroup, { flex: 1 }]}>
                <Text style={styles.label}>Check-out</Text>
                {Platform.OS === 'web' ? (
                  renderDatePickerWeb(checkOut, (d) => {
                    if (d <= checkIn) {
                      showAlert('Invalid Date', 'Check-out must be after check-in.');
                      return;
                    }
                    setCheckOut(d);
                  }, new Date(checkIn.getTime() + DAY_MS))
                ) : (
                  <Pressable style={styles.selector} onPress={() => setShowCheckOutDate(true)}>
                    <Text style={styles.selectorValue}>{formatDate(checkOut)}</Text>
                  </Pressable>
                )}
              </View>
            </View>
          ) : (
            <View>
              <View style={styles.inputGroup}>
                {Platform.OS === 'web' ? (
                  renderDateTimePickerWeb(checkIn, setCheckIn, new Date())
                ) : (
                  <View style={styles.dateRow}>
                    <Pressable
                      style={[styles.selector, { flex: 1 }]}
                      onPress={() => setShowCheckInDate(true)}
                    >
                      <Text style={styles.selectorLabel}>Date</Text>
                      <Text style={styles.selectorValue}>{formatDate(checkIn)}</Text>
                    </Pressable>
                    <Pressable
                      style={[styles.selector, { flex: 1 }]}
                      onPress={() => setShowCheckInTime(true)}
                    >
                      <Text style={styles.selectorLabel}>Time</Text>
                      <Text style={styles.selectorValue}>{formatTime(checkIn)}</Text>
                    </Pressable>
                  </View>
                )}
              </View>

              {bookingType === 'hourly' && (
                <View style={styles.inputGroup}>
                  <Text style={styles.label}>Hours (minimum 1)</Text>
                  <TextInput
                    style={styles.input}
                    placeholder="e.g. 3"
                    placeholderTextColor={AppColors.grey}
                    value={hours}
                    onChangeText={setHours}
                    keyboardType="numeric"
                  />
                </View>
              )}

              <View style={styles.autoCheckoutBox}>
                <Text style={styles.autoCheckoutLabel}>Check-out (auto)</Text>
                <Text style={styles.autoCheckoutValue}>{formatDateTime(effectiveCheckOut)}</Text>
              </View>
            </View>
          )}

          <Text style={[styles.sectionTitle, { marginTop: 12 }]}>Room</Text>
          <View style={styles.inputGroup}>
            <Pressable style={styles.selector} onPress={() => setShowRoomPicker(true)}>
              <Text style={selectedRoom ? styles.selectorValue : styles.selectorPlaceholder}>
                {selectedRoom
                  ? `Room #${selectedRoom.room_number} · ${selectedRoom.type} · ${rateText}`
                  : 'Tap to select a room'}
              </Text>
            </Pressable>
            <Text style={styles.helperText}>
              Showing rooms available {formatDateTime(checkIn)} → {formatDateTime(effectiveCheckOut)}
            </Text>
          </View>

          {selectedRoom && (
            <View style={styles.summary}>
              <View style={styles.summaryRow}>
                <Text style={styles.summaryLabel}>Duration</Text>
                <Text style={styles.summaryValue}>{durationText}</Text>
              </View>
              <View style={styles.summaryRow}>
                <Text style={styles.summaryLabel}>Rate</Text>
                <Text style={styles.summaryValue}>{rateText}</Text>
              </View>
              <View style={[styles.summaryRow, styles.summaryTotal]}>
                <Text style={styles.totalLabel}>Total Amount</Text>
                <Text style={styles.totalValue}>₹{totalAmount}</Text>
              </View>
            </View>
          )}

          <Text style={[styles.sectionTitle, { marginTop: 12 }]}>Payment</Text>
          <View style={styles.inputGroup}>
            <Text style={styles.label}>Status</Text>
            <View style={styles.chipRowWrap}>
              {PAYMENT_STATUSES.map((ps) => (
                <Pressable
                  key={ps.value}
                  style={[
                    styles.typeChip,
                    paymentStatus === ps.value && { backgroundColor: ps.color, borderColor: ps.color },
                  ]}
                  onPress={() => {
                    setPaymentStatus(ps.value);
                    if (ps.value === 'pending') {
                      setPaymentMethod(null);
                      setAmountPaid('');
                    } else if (ps.value === 'paid') {
                      setAmountPaid(String(totalAmount));
                    }
                  }}
                >
                  <Text
                    style={[
                      styles.typeChipText,
                      paymentStatus === ps.value && styles.typeChipTextActive,
                    ]}
                  >
                    {ps.label}
                  </Text>
                </Pressable>
              ))}
            </View>
          </View>

          {paymentStatus !== 'pending' && (
            <>
              <View style={styles.inputGroup}>
                <Text style={styles.label}>Method</Text>
                <View style={styles.chipRowWrap}>
                  {PAYMENT_METHODS.map((pm) => (
                    <Pressable
                      key={pm.value}
                      style={[
                        styles.typeChip,
                        paymentMethod === pm.value && styles.typeChipActive,
                      ]}
                      onPress={() => setPaymentMethod(pm.value)}
                    >
                      <Text
                        style={[
                          styles.typeChipText,
                          paymentMethod === pm.value && styles.typeChipTextActive,
                        ]}
                      >
                        {pm.label}
                      </Text>
                    </Pressable>
                  ))}
                </View>
              </View>
              {paymentStatus === 'partial' && (
                <View style={styles.inputGroup}>
                  <Text style={styles.label}>Amount Paid (₹)</Text>
                  <TextInput
                    style={styles.input}
                    placeholder="e.g. 500"
                    placeholderTextColor={AppColors.grey}
                    value={amountPaid}
                    onChangeText={setAmountPaid}
                    keyboardType="numeric"
                  />
                  <Text style={styles.helperText}>
                    Balance due: ₹{Math.max(0, totalAmount - (parseFloat(amountPaid) || 0))}
                  </Text>
                </View>
              )}
            </>
          )}

          <Pressable
            style={({ pressed }) => [styles.submitBtn, pressed && styles.submitBtnPressed]}
            onPress={handleSubmit}
            disabled={submitting}
          >
            <Text style={styles.submitBtnText}>Create Booking</Text>
          </Pressable>
        </ScrollView>
      </KeyboardAvoidingView>

      {Platform.OS !== 'web' && showCheckInDate && (
        <DateTimePicker
          value={checkIn}
          mode="date"
          minimumDate={startOfToday()}
          onChange={handleCheckInDateChange}
        />
      )}
      {Platform.OS !== 'web' && showCheckInTime && (
        <DateTimePicker
          value={checkIn}
          mode="time"
          onChange={handleCheckInTimeChange}
        />
      )}
      {Platform.OS !== 'web' && showCheckOutDate && (
        <DateTimePicker
          value={checkOut}
          mode="date"
          minimumDate={new Date(checkIn.getTime() + DAY_MS)}
          onChange={handleCheckOutDateChange}
        />
      )}

      <Modal visible={showRoomPicker} animationType="slide" transparent>
        <Pressable style={styles.modalOverlay} onPress={() => setShowRoomPicker(false)}>
          <Pressable style={styles.modalContent} onPress={() => {}}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Select Room</Text>
              <Pressable onPress={() => setShowRoomPicker(false)}>
                <Text style={styles.modalClose}>Done</Text>
              </Pressable>
            </View>
            {roomsLoading ? (
              <Text style={styles.modalEmpty}>Loading rooms...</Text>
            ) : rooms.length === 0 ? (
              <Text style={styles.modalEmpty}>No rooms available for the selected time</Text>
            ) : (
              <FlatList
                data={rooms}
                keyExtractor={(item) => item.id}
                renderItem={({ item }) => {
                  const hd = item.half_day_price ?? Math.round(item.price * 0.6);
                  const hr = item.hourly_price ?? Math.round(item.price / 24);
                  return (
                    <Pressable
                      style={[
                        styles.roomOption,
                        selectedRoom?.id === item.id && styles.roomOptionSelected,
                      ]}
                      onPress={() => {
                        setSelectedRoom(item);
                        setShowRoomPicker(false);
                      }}
                    >
                      <View style={{ flex: 1 }}>
                        <Text style={styles.roomOptionNumber}>Room #{item.room_number}</Text>
                        <Text style={styles.roomOptionDetail}>
                          {item.type.charAt(0).toUpperCase() + item.type.slice(1)} · ₹{item.price}/night
                        </Text>
                        <Text style={styles.roomOptionSubDetail}>
                          ₹{hd}/12hrs · ₹{hr}/hr
                        </Text>
                      </View>
                      {selectedRoom?.id === item.id && <Text style={styles.checkmark}>✓</Text>}
                    </Pressable>
                  );
                }}
              />
            )}
          </Pressable>
        </Pressable>
      </Modal>

      <Modal visible={showIdProofPicker} animationType="slide" transparent>
        <Pressable style={styles.modalOverlay} onPress={() => setShowIdProofPicker(false)}>
          <Pressable style={styles.modalContent} onPress={() => {}}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Select ID Proof Type</Text>
              <Pressable onPress={() => setShowIdProofPicker(false)}>
                <Text style={styles.modalClose}>Done</Text>
              </Pressable>
            </View>
            {ID_PROOF_TYPES.map((type) => (
              <Pressable
                key={type}
                style={[
                  styles.roomOption,
                  idProofType === type && styles.roomOptionSelected,
                ]}
                onPress={() => {
                  setIdProofType(type);
                  setShowIdProofPicker(false);
                }}
              >
                <Text style={styles.roomOptionNumber}>{type}</Text>
                {idProofType === type && <Text style={styles.checkmark}>✓</Text>}
              </Pressable>
            ))}
          </Pressable>
        </Pressable>
      </Modal>

      <LoadingOverlay visible={submitting} message="Creating booking..." />
    </SafeAreaView>
  );
}

const webInputStyle = {
  padding: 14,
  fontSize: 16,
  borderRadius: 12,
  border: `1px solid ${AppColors.border}`,
  backgroundColor: AppColors.white,
  color: AppColors.black,
  width: '100%',
  boxSizing: 'border-box' as const,
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: AppColors.lightGrey,
  },
  header: {
    paddingHorizontal: 20,
    paddingVertical: 16,
    backgroundColor: AppColors.white,
    borderBottomWidth: 1,
    borderBottomColor: AppColors.border,
  },
  title: {
    fontSize: 24,
    fontWeight: '700',
    color: AppColors.black,
  },
  nextNoonRef: { paddingTop: 0 },
  form: {
    padding: 20,
    paddingBottom: 40,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: AppColors.primary,
    marginBottom: 16,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  inputGroup: {
    marginBottom: 16,
  },
  label: {
    fontSize: 14,
    fontWeight: '600',
    color: AppColors.black,
    marginBottom: 8,
  },
  input: {
    backgroundColor: AppColors.white,
    borderRadius: 12,
    padding: 14,
    fontSize: 16,
    color: AppColors.black,
    borderWidth: 1,
    borderColor: AppColors.border,
  },
  selector: {
    backgroundColor: AppColors.white,
    borderRadius: 12,
    padding: 14,
    borderWidth: 1,
    borderColor: AppColors.border,
  },
  selectorLabel: {
    fontSize: 11,
    color: AppColors.grey,
    marginBottom: 4,
    textTransform: 'uppercase',
    fontWeight: '600',
  },
  selectorValue: {
    fontSize: 16,
    color: AppColors.black,
  },
  selectorPlaceholder: {
    fontSize: 16,
    color: AppColors.grey,
  },
  helperText: {
    fontSize: 12,
    color: AppColors.grey,
    marginTop: 6,
    fontWeight: '500',
  },
  dateRow: {
    flexDirection: 'row',
    gap: 12,
  },
  chipRowWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  typeChip: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 10,
    borderWidth: 1.5,
    borderColor: AppColors.border,
    backgroundColor: AppColors.white,
  },
  typeChipActive: {
    backgroundColor: AppColors.primary,
    borderColor: AppColors.primary,
  },
  typeChipText: {
    fontSize: 14,
    fontWeight: '600',
    color: AppColors.grey,
  },
  typeChipTextActive: {
    color: AppColors.white,
  },
  autoCheckoutBox: {
    backgroundColor: AppColors.lightGrey,
    borderRadius: 12,
    padding: 14,
    borderWidth: 1,
    borderColor: AppColors.border,
    borderStyle: 'dashed',
    marginBottom: 16,
  },
  autoCheckoutLabel: {
    fontSize: 11,
    color: AppColors.grey,
    textTransform: 'uppercase',
    fontWeight: '600',
    marginBottom: 4,
  },
  autoCheckoutValue: {
    fontSize: 16,
    fontWeight: '700',
    color: AppColors.black,
  },
  summary: {
    backgroundColor: AppColors.white,
    borderRadius: 12,
    padding: 16,
    marginTop: 8,
    marginBottom: 24,
    borderWidth: 1,
    borderColor: AppColors.border,
  },
  summaryRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 8,
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
    paddingTop: 12,
  },
  totalLabel: {
    fontSize: 16,
    fontWeight: '700',
    color: AppColors.black,
  },
  totalValue: {
    fontSize: 20,
    fontWeight: '800',
    color: AppColors.primary,
  },
  submitBtn: {
    backgroundColor: AppColors.primary,
    borderRadius: 12,
    padding: 16,
    alignItems: 'center',
    marginTop: 16,
  },
  submitBtnPressed: {
    opacity: 0.85,
    transform: [{ scale: 0.98 }],
  },
  submitBtnText: {
    color: AppColors.white,
    fontSize: 17,
    fontWeight: '700',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.4)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    backgroundColor: AppColors.white,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    maxHeight: '60%',
    paddingBottom: 30,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 20,
    borderBottomWidth: 1,
    borderBottomColor: AppColors.border,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: AppColors.black,
  },
  modalClose: {
    fontSize: 16,
    fontWeight: '600',
    color: AppColors.primary,
  },
  modalEmpty: {
    textAlign: 'center',
    padding: 40,
    fontSize: 15,
    color: AppColors.grey,
  },
  roomOption: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 16,
    paddingHorizontal: 20,
    borderBottomWidth: 1,
    borderBottomColor: AppColors.border,
  },
  roomOptionSelected: {
    backgroundColor: '#eef2ff',
  },
  roomOptionNumber: {
    fontSize: 16,
    fontWeight: '600',
    color: AppColors.black,
  },
  roomOptionDetail: {
    fontSize: 13,
    color: AppColors.grey,
    marginTop: 2,
  },
  roomOptionSubDetail: {
    fontSize: 11,
    color: AppColors.grey,
    marginTop: 2,
    fontWeight: '500',
  },
  checkmark: {
    fontSize: 20,
    fontWeight: '700',
    color: AppColors.primary,
  },
  docActions: {
    flexDirection: 'row',
    gap: 12,
  },
  docActionBtn: {
    flex: 1,
    backgroundColor: AppColors.white,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: AppColors.border,
    borderStyle: 'dashed',
    paddingVertical: 16,
    alignItems: 'center',
    gap: 6,
  },
  docActionIcon: {
    fontSize: 24,
  },
  docActionLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: AppColors.grey,
  },
  docPreview: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: AppColors.white,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: AppColors.border,
    padding: 12,
    gap: 12,
  },
  docThumbnail: {
    width: 48,
    height: 48,
    borderRadius: 8,
    backgroundColor: AppColors.lightGrey,
  },
  pdfBadge: {
    width: 48,
    height: 48,
    borderRadius: 8,
    backgroundColor: '#fee2e2',
    alignItems: 'center',
    justifyContent: 'center',
  },
  pdfBadgeText: {
    fontSize: 14,
    fontWeight: '800',
    color: '#dc2626',
  },
  docFileName: {
    flex: 1,
    fontSize: 14,
    color: AppColors.black,
  },
  docRemoveBtn: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: AppColors.lightGrey,
    alignItems: 'center',
    justifyContent: 'center',
  },
  docRemoveText: {
    fontSize: 14,
    fontWeight: '700',
    color: AppColors.grey,
  },
});

// Suppress unused function warning — kept for future reference.
void nextNoon;
