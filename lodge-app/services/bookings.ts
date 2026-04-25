import { supabase } from '@/lib/supabase';
import type {
  Booking,
  BookingStatus,
  BookingType,
  PaymentMethod,
  PaymentStatus,
} from '@/lib/types';
import { insertCustomer, updateCustomerDocumentUrl } from './customers';
import { updateRoomStatus } from './rooms';
import { uploadIdProofDocument, type IdProofFile } from './storage';
import {
  scheduleCheckoutReminder,
  cancelCheckoutReminder,
} from './notifications';
import { logger } from './logger';

const ACTIVE_STATUSES: BookingStatus[] = ['booked', 'checked_in'];

export async function fetchBookings(): Promise<Booking[]> {
  const { data, error } = await supabase
    .from('bookings')
    .select('*, customer:customers(*), room:rooms(*)')
    .order('created_at', { ascending: false });
  if (error) throw error;
  return data as Booking[];
}

export async function fetchActiveBookings(): Promise<Booking[]> {
  const { data, error } = await supabase
    .from('bookings')
    .select('*, customer:customers(*), room:rooms(*)')
    .in('status', ACTIVE_STATUSES)
    .order('check_in', { ascending: true });
  if (error) throw error;
  return data as Booking[];
}

export async function fetchBookingById(bookingId: string): Promise<Booking> {
  const { data, error } = await supabase
    .from('bookings')
    .select('*, customer:customers(*), room:rooms(*)')
    .eq('id', bookingId)
    .single();
  if (error) throw error;
  return data as Booking;
}

export async function checkRoomAvailability(
  roomId: string,
  checkIn: string,
  checkOut: string,
  excludeBookingId?: string
): Promise<boolean> {
  let query = supabase
    .from('bookings')
    .select('id')
    .eq('room_id', roomId)
    .in('status', ACTIVE_STATUSES)
    .lt('check_in', checkOut)
    .gt('check_out', checkIn);

  if (excludeBookingId) {
    query = query.neq('id', excludeBookingId);
  }

  const { data, error } = await query;
  if (error) throw error;
  return (data?.length ?? 0) === 0;
}

export function computeBookingAmount(params: {
  bookingType: BookingType;
  checkIn: Date;
  checkOut: Date;
  hours?: number | null;
  roomPrice: number;
  halfDayPrice: number | null;
  hourlyPrice: number | null;
}): number {
  const { bookingType, checkIn, checkOut, hours, roomPrice, halfDayPrice, hourlyPrice } = params;

  if (bookingType === 'full_day') {
    const diffMs = checkOut.getTime() - checkIn.getTime();
    const days = Math.max(1, Math.ceil(diffMs / (1000 * 60 * 60 * 24)));
    return days * roomPrice;
  }

  if (bookingType === 'half_day') {
    return halfDayPrice ?? Math.round(roomPrice * 0.6);
  }

  const h = Math.max(1, hours ?? 1);
  const rate = hourlyPrice ?? Math.round(roomPrice / 24);
  return h * rate;
}

interface CreateBookingInput {
  customerName: string;
  customerPhone: string;
  customerIdProof: string;
  roomId: string;
  roomPrice: number;
  halfDayPrice: number | null;
  hourlyPrice: number | null;
  bookingType: BookingType;
  checkIn: Date;
  checkOut: Date;
  hours?: number | null;
  paymentStatus: PaymentStatus;
  paymentMethod: PaymentMethod | null;
  amountPaid: number;
  idProofDocument?: IdProofFile | null;
}

export async function createBooking(input: CreateBookingInput): Promise<Booking> {
  const checkInStr = input.checkIn.toISOString();
  const checkOutStr = input.checkOut.toISOString();

  let isAvailable: boolean;
  try {
    isAvailable = await checkRoomAvailability(input.roomId, checkInStr, checkOutStr);
  } catch (err: any) {
    throw new Error(`Failed checking room availability: ${err.message}`);
  }
  if (!isAvailable) {
    throw new Error('Room is not available for the selected time window.');
  }

  const totalAmount = computeBookingAmount({
    bookingType: input.bookingType,
    checkIn: input.checkIn,
    checkOut: input.checkOut,
    hours: input.hours,
    roomPrice: input.roomPrice,
    halfDayPrice: input.halfDayPrice,
    hourlyPrice: input.hourlyPrice,
  });

  let customer;
  try {
    customer = await insertCustomer({
      name: input.customerName,
      phone: input.customerPhone,
      id_proof: input.customerIdProof,
    });
  } catch (err: any) {
    throw new Error(`Failed inserting customer: ${err.message}`);
  }

  if (input.idProofDocument) {
    try {
      const documentUrl = await uploadIdProofDocument(customer.id, input.idProofDocument);
      await updateCustomerDocumentUrl(customer.id, documentUrl);
    } catch (err: any) {
      throw new Error(`Failed uploading ID proof: ${err.message}`);
    }
  }

  const { data: booking, error } = await supabase
    .from('bookings')
    .insert({
      customer_id: customer.id,
      room_id: input.roomId,
      check_in: checkInStr,
      check_out: checkOutStr,
      booking_type: input.bookingType,
      hours: input.bookingType === 'hourly' ? input.hours ?? null : null,
      status: 'booked' as BookingStatus,
      total_amount: totalAmount,
      payment_status: input.paymentStatus,
      payment_method: input.paymentMethod,
      amount_paid: input.amountPaid,
    })
    .select('*, customer:customers(*), room:rooms(*)')
    .single();

  if (error) throw new Error(`Failed inserting booking: ${error.message}`);

  try {
    await updateRoomStatus(input.roomId, 'occupied');
  } catch (err: any) {
    throw new Error(`Failed updating room status: ${err.message}`);
  }

  return booking as Booking;
}

export async function checkInBooking(bookingId: string): Promise<Booking> {
  const start = Date.now();
  logger.info('bookings', 'checkIn → start', { bookingId });
  const { data, error } = await supabase
    .from('bookings')
    .update({ status: 'checked_in' as BookingStatus })
    .eq('id', bookingId)
    .select('*, customer:customers(*), room:rooms(*)')
    .single();
  if (error) {
    logger.error('bookings', 'checkIn → fail', {
      bookingId,
      durationMs: Date.now() - start,
      error: error.message,
    });
    throw error;
  }

  const booking = data as Booking;
  try {
    await scheduleCheckoutReminder(booking);
  } catch (e: any) {
    logger.warn('bookings', 'checkIn: scheduleReminder failed', {
      bookingId,
      error: e?.message ?? String(e),
    });
  }

  logger.info('bookings', 'checkIn → ok', {
    bookingId,
    durationMs: Date.now() - start,
  });
  return booking;
}

export async function checkOutBooking(bookingId: string, roomId: string): Promise<Booking> {
  const start = Date.now();
  logger.info('bookings', 'checkOut → start', { bookingId, roomId });
  const { data, error } = await supabase
    .from('bookings')
    .update({ status: 'checked_out' as BookingStatus })
    .eq('id', bookingId)
    .select('*, customer:customers(*), room:rooms(*)')
    .single();
  if (error) {
    logger.error('bookings', 'checkOut → fail', {
      bookingId,
      roomId,
      durationMs: Date.now() - start,
      error: error.message,
    });
    throw error;
  }

  try {
    await updateRoomStatus(roomId, 'available');
  } catch (e: any) {
    logger.warn('bookings', 'checkOut: updateRoomStatus failed', {
      bookingId,
      roomId,
      error: e?.message ?? String(e),
    });
  }

  try {
    await cancelCheckoutReminder(bookingId);
  } catch (e: any) {
    logger.warn('bookings', 'checkOut: cancelReminder failed', {
      bookingId,
      error: e?.message ?? String(e),
    });
  }

  logger.info('bookings', 'checkOut → ok', {
    bookingId,
    roomId,
    durationMs: Date.now() - start,
  });
  return data as Booking;
}

export async function cancelBooking(
  bookingId: string,
  roomId: string,
  reason: string
): Promise<Booking> {
  const start = Date.now();
  logger.info('bookings', 'cancel → start', { bookingId, roomId });
  const { data, error } = await supabase
    .from('bookings')
    .update({
      status: 'cancelled' as BookingStatus,
      cancellation_reason: reason,
    })
    .eq('id', bookingId)
    .select('*, customer:customers(*), room:rooms(*)')
    .single();
  if (error) {
    logger.error('bookings', 'cancel → fail', {
      bookingId,
      durationMs: Date.now() - start,
      error: error.message,
    });
    throw error;
  }

  try {
    await updateRoomStatus(roomId, 'available');
  } catch (e: any) {
    logger.warn('bookings', 'cancel: updateRoomStatus failed', {
      bookingId,
      roomId,
      error: e?.message ?? String(e),
    });
  }

  try {
    await cancelCheckoutReminder(bookingId);
  } catch (e: any) {
    logger.warn('bookings', 'cancel: cancelReminder failed', {
      bookingId,
      error: e?.message ?? String(e),
    });
  }

  logger.info('bookings', 'cancel → ok', {
    bookingId,
    durationMs: Date.now() - start,
  });
  return data as Booking;
}

export async function updateBookingPayment(
  bookingId: string,
  paymentStatus: PaymentStatus,
  paymentMethod: PaymentMethod | null,
  amountPaid: number
): Promise<Booking> {
  const { data, error } = await supabase
    .from('bookings')
    .update({
      payment_status: paymentStatus,
      payment_method: paymentMethod,
      amount_paid: amountPaid,
    })
    .eq('id', bookingId)
    .select('*, customer:customers(*), room:rooms(*)')
    .single();
  if (error) throw error;
  return data as Booking;
}

export async function extendBooking(
  bookingId: string,
  roomId: string,
  currentCheckOut: string,
  newCheckOut: Date,
  additionalAmount: number,
  newBookingType?: BookingType
): Promise<Booking> {
  const newCheckOutStr = newCheckOut.toISOString();
  const overallStart = Date.now();
  logger.info('bookings', 'extend → start', {
    bookingId,
    roomId,
    currentCheckOut,
    newCheckOut: newCheckOutStr,
    additionalAmount,
    newBookingType,
  });

  let isAvailable: boolean;
  const availStart = Date.now();
  try {
    isAvailable = await checkRoomAvailability(
      roomId,
      currentCheckOut,
      newCheckOutStr,
      bookingId
    );
    logger.debug('bookings', 'extend: availability checked', {
      bookingId,
      isAvailable,
      durationMs: Date.now() - availStart,
    });
  } catch (e: any) {
    logger.error('bookings', 'extend: availability check failed', {
      bookingId,
      durationMs: Date.now() - availStart,
      error: e?.message ?? String(e),
    });
    throw e;
  }

  if (!isAvailable) {
    logger.warn('bookings', 'extend: room not available', { bookingId, roomId });
    throw new Error('Room is not available for the requested extension window.');
  }

  const fetchStart = Date.now();
  const { data: existing, error: fetchErr } = await supabase
    .from('bookings')
    .select('total_amount, booking_type')
    .eq('id', bookingId)
    .single();
  if (fetchErr) {
    logger.error('bookings', 'extend: existing fetch failed', {
      bookingId,
      durationMs: Date.now() - fetchStart,
      error: fetchErr.message,
    });
    throw fetchErr;
  }
  logger.debug('bookings', 'extend: existing fetched', {
    bookingId,
    durationMs: Date.now() - fetchStart,
    existingTotal: existing?.total_amount,
  });

  const existingTotal = Number(existing?.total_amount ?? 0);

  const update: Record<string, unknown> = {
    check_out: newCheckOutStr,
    total_amount: existingTotal + additionalAmount,
  };
  if (newBookingType) {
    update.booking_type = newBookingType;
  }

  const updStart = Date.now();
  const { data, error } = await supabase
    .from('bookings')
    .update(update)
    .eq('id', bookingId)
    .select('*, customer:customers(*), room:rooms(*)')
    .single();
  if (error) {
    logger.error('bookings', 'extend: update failed', {
      bookingId,
      durationMs: Date.now() - updStart,
      error: error.message,
    });
    throw error;
  }
  logger.debug('bookings', 'extend: update ok', {
    bookingId,
    durationMs: Date.now() - updStart,
  });

  const booking = data as Booking;
  try {
    await cancelCheckoutReminder(bookingId);
    if (booking.status === 'checked_in') {
      await scheduleCheckoutReminder(booking);
    }
  } catch (e: any) {
    logger.warn('bookings', 'extend: reminder reschedule failed', {
      bookingId,
      error: e?.message ?? String(e),
    });
  }

  logger.info('bookings', 'extend → ok', {
    bookingId,
    totalDurationMs: Date.now() - overallStart,
    newTotal: existingTotal + additionalAmount,
  });
  return booking;
}
