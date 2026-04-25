export type UserRole = 'receptionist' | 'owner';

export type RoomStatus = 'available' | 'occupied' | 'maintenance';
export type RoomType = 'single' | 'double' | 'suite' | 'deluxe';
export type BookingStatus = 'booked' | 'checked_in' | 'checked_out' | 'cancelled';
export type BookingType = 'full_day' | 'half_day' | 'hourly';
export type PaymentStatus = 'pending' | 'partial' | 'paid';
export type PaymentMethod = 'cash' | 'upi' | 'card';

export interface Profile {
  id: string;
  name: string | null;
  role: UserRole | null;
}

export interface Room {
  id: string;
  room_number: string;
  type: RoomType;
  price: number;
  half_day_price: number | null;
  hourly_price: number | null;
  status: RoomStatus;
}

export interface Customer {
  id: string;
  name: string;
  phone: string;
  id_proof: string;
  id_proof_document_url?: string | null;
  created_at?: string;
}

export interface Booking {
  id: string;
  customer_id: string;
  room_id: string;
  check_in: string;
  check_out: string;
  booking_type: BookingType;
  hours: number | null;
  status: BookingStatus;
  total_amount: number;
  payment_status: PaymentStatus;
  payment_method: PaymentMethod | null;
  amount_paid: number;
  cancellation_reason: string | null;
  created_at?: string;
  customer?: Customer;
  room?: Room;
}
