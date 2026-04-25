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
  const { data, error } = await supabase
    .from('bookings')
    .update({ status: 'checked_in' as BookingStatus })
    .eq('id', bookingId)
    .select('*, customer:customers(*), room:rooms(*)')
    .single();
  if (error) throw error;

  const booking = data as Booking;
  try {
    await scheduleCheckoutReminder(booking);
  } catch {
    // Notifications are best-effort; don't block check-in.
  }

  return booking;
}

export async function checkOutBooking(bookingId: string, roomId: string): Promise<Booking> {
  const { data, error } = await supabase
    .from('bookings')
    .update({ status: 'checked_out' as BookingStatus })
    .eq('id', bookingId)
    .select('*, customer:customers(*), room:rooms(*)')
    .single();
  if (error) throw error;

  await updateRoomStatus(roomId, 'available');

  try {
    await cancelCheckoutReminder(bookingId);
  } catch {
    // Best-effort.
  }

  return data as Booking;
}

export async function cancelBooking(
  bookingId: string,
  roomId: string,
  reason: string
): Promise<Booking> {
  const { data, error } = await supabase
    .from('bookings')
    .update({
      status: 'cancelled' as BookingStatus,
      cancellation_reason: reason,
    })
    .eq('id', bookingId)
    .select('*, customer:customers(*), room:rooms(*)')
    .single();
  if (error) throw error;

  try {
    await updateRoomStatus(roomId, 'available');
  } catch {
    // Room may already be in another state; don't fail the cancellation.
  }

  try {
    await cancelCheckoutReminder(bookingId);
  } catch {
    // Best-effort.
  }

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

  const isAvailable = await checkRoomAvailability(
    roomId,
    currentCheckOut,
    newCheckOutStr,
    bookingId
  );
  if (!isAvailable) {
    throw new Error('Room is not available for the requested extension window.');
  }

  const { data: existing, error: fetchErr } = await supabase
    .from('bookings')
    .select('total_amount, booking_type')
    .eq('id', bookingId)
    .single();
  if (fetchErr) throw fetchErr;

  const existingTotal = Number(existing?.total_amount ?? 0);

  const update: Record<string, unknown> = {
    check_out: newCheckOutStr,
    total_amount: existingTotal + additionalAmount,
  };
  if (newBookingType) {
    update.booking_type = newBookingType;
  }

  const { data, error } = await supabase
    .from('bookings')
    .update(update)
    .eq('id', bookingId)
    .select('*, customer:customers(*), room:rooms(*)')
    .single();
  if (error) throw error;

  const booking = data as Booking;
  try {
    await cancelCheckoutReminder(bookingId);
    if (booking.status === 'checked_in') {
      await scheduleCheckoutReminder(booking);
    }
  } catch {
    // Best-effort.
  }

  return booking;
}
