import { supabase } from '@/lib/supabase';
import type { Room, RoomStatus, RoomType } from '@/lib/types';

export async function fetchRooms(): Promise<Room[]> {
  const { data, error } = await supabase
    .from('rooms')
    .select('*')
    .order('room_number', { ascending: true });
  if (error) throw error;
  return data as Room[];
}

export async function fetchAvailableRooms(): Promise<Room[]> {
  const { data, error } = await supabase
    .from('rooms')
    .select('*')
    .eq('status', 'available')
    .order('room_number', { ascending: true });
  if (error) throw error;
  return data as Room[];
}

/**
 * Returns rooms that are bookable for the given time window.
 * A room is bookable if it is NOT under maintenance (`cleaning`) and has
 * no overlapping active booking for [checkIn, checkOut).
 *
 * Rooms whose `status` is `occupied` may still be bookable for a future
 * window, so we do not filter by status (except `cleaning`).
 */
export async function fetchAvailableRoomsForSlot(
  checkIn: string,
  checkOut: string
): Promise<Room[]> {
  const [roomsRes, conflictsRes] = await Promise.all([
    supabase
      .from('rooms')
      .select('*')
      .neq('status', 'cleaning')
      .order('room_number', { ascending: true }),
    supabase
      .from('bookings')
      .select('room_id')
      .in('status', ['booked', 'checked_in'])
      .lt('check_in', checkOut)
      .gt('check_out', checkIn),
  ]);

  if (roomsRes.error) throw roomsRes.error;
  if (conflictsRes.error) throw conflictsRes.error;

  const conflictIds = new Set((conflictsRes.data ?? []).map((c) => c.room_id as string));
  return ((roomsRes.data as Room[]) ?? []).filter((r) => !conflictIds.has(r.id));
}

export async function updateRoomStatus(
  roomId: string,
  status: RoomStatus
): Promise<Room> {
  const { data, error } = await supabase
    .from('rooms')
    .update({ status })
    .eq('id', roomId)
    .select()
    .single();
  if (error) throw error;
  return data as Room;
}

export interface RoomInput {
  room_number: string;
  type: RoomType;
  price: number;
  half_day_price: number | null;
  hourly_price: number | null;
  status: RoomStatus;
}

export async function addRoom(input: RoomInput): Promise<Room> {
  const { data: existing } = await supabase
    .from('rooms')
    .select('id')
    .eq('room_number', input.room_number)
    .maybeSingle();

  if (existing) {
    throw new Error(`Room number "${input.room_number}" already exists`);
  }

  const { data, error } = await supabase
    .from('rooms')
    .insert(input)
    .select()
    .single();
  if (error) throw error;
  return data as Room;
}

export async function updateRoom(
  roomId: string,
  input: Partial<RoomInput>
): Promise<Room> {
  if (input.room_number) {
    const { data: existing } = await supabase
      .from('rooms')
      .select('id')
      .eq('room_number', input.room_number)
      .neq('id', roomId)
      .maybeSingle();

    if (existing) {
      throw new Error(`Room number "${input.room_number}" already exists`);
    }
  }

  const { data, error } = await supabase
    .from('rooms')
    .update(input)
    .eq('id', roomId)
    .select()
    .single();
  if (error) throw error;
  return data as Room;
}

export async function deleteRoom(roomId: string): Promise<void> {
  const { error } = await supabase.from('rooms').delete().eq('id', roomId);
  if (error) throw error;
}
