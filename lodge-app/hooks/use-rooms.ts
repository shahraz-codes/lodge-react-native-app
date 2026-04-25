import { useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from '@/lib/supabase';
import type { Room } from '@/lib/types';
import {
  fetchRooms,
  fetchAvailableRooms,
  fetchAvailableRoomsForSlot,
} from '@/services/rooms';

let channelCounter = 0;

export function useRooms() {
  const [rooms, setRooms] = useState<Room[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const channelId = useRef(`rooms-realtime-${++channelCounter}`);

  const load = useCallback(async () => {
    try {
      setError(null);
      const data = await fetchRooms();
      setRooms(data);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();

    const channel = supabase
      .channel(channelId.current)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'rooms' },
        () => {
          load();
        }
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'bookings' },
        () => {
          load();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [load]);

  const refresh = useCallback(async () => {
    setLoading(true);
    await load();
  }, [load]);

  const stats = {
    total: rooms.length,
    available: rooms.filter((r) => r.status === 'available').length,
    occupied: rooms.filter((r) => r.status === 'occupied').length,
    cleaning: rooms.filter((r) => r.status === 'cleaning').length,
  };

  return { rooms, loading, error, refresh, stats };
}

export function useAvailableRooms() {
  const [rooms, setRooms] = useState<Room[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setError(null);
      const data = await fetchAvailableRooms();
      setRooms(data);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const refresh = useCallback(async () => {
    setLoading(true);
    await load();
  }, [load]);

  return { rooms, loading, error, refresh };
}

/**
 * Conflict-aware room picker data hook.
 * Re-fetches (debounced) whenever the check-in or check-out timestamp changes.
 */
export function useAvailableRoomsForSlot(checkIn: Date, checkOut: Date) {
  const [rooms, setRooms] = useState<Room[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const checkInIso = checkIn.toISOString();
  const checkOutIso = checkOut.toISOString();

  const load = useCallback(async () => {
    try {
      setError(null);
      const data = await fetchAvailableRoomsForSlot(checkInIso, checkOutIso);
      setRooms(data);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, [checkInIso, checkOutIso]);

  useEffect(() => {
    setLoading(true);
    const timer = setTimeout(() => {
      load();
    }, 200);
    return () => clearTimeout(timer);
  }, [load]);

  const refresh = useCallback(async () => {
    setLoading(true);
    await load();
  }, [load]);

  return { rooms, loading, error, refresh };
}
