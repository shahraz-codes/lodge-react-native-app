import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import type { Booking } from '@/lib/types';

/**
 * Returns bookings that overlap with the given day (local day boundaries).
 * Subscribes to realtime changes so the timeline stays in sync.
 */
export function useCalendarBookings(date: Date) {
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const dayStart = new Date(date);
  dayStart.setHours(0, 0, 0, 0);
  const dayEnd = new Date(dayStart);
  dayEnd.setDate(dayEnd.getDate() + 1);

  const dayStartIso = dayStart.toISOString();
  const dayEndIso = dayEnd.toISOString();

  const load = useCallback(async () => {
    try {
      setError(null);
      const { data, error: err } = await supabase
        .from('bookings')
        .select('*, customer:customers(*), room:rooms(*)')
        .in('status', ['booked', 'checked_in', 'checked_out'])
        .lt('check_in', dayEndIso)
        .gt('check_out', dayStartIso)
        .order('check_in', { ascending: true });
      if (err) throw err;
      setBookings((data as Booking[]) ?? []);
    } catch (e: any) {
      setError(e?.message ?? 'Failed to load calendar bookings');
    } finally {
      setLoading(false);
    }
  }, [dayStartIso, dayEndIso]);

  useEffect(() => {
    setLoading(true);
    load();

    const channel = supabase
      .channel(`calendar-bookings-${dayStartIso}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'bookings' },
        () => {
          load();
        },
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [load, dayStartIso]);

  const refresh = useCallback(async () => {
    setLoading(true);
    await load();
  }, [load]);

  return { bookings, loading, error, refresh, dayStart, dayEnd };
}
