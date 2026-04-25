import { useCallback, useEffect, useRef, useState } from 'react';
import { supabase } from '@/lib/supabase';
import type { Booking } from '@/lib/types';
import { logger } from '@/services/logger';

const FETCH_TIMEOUT_MS = 15000;

function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error(`${label} timed out after ${ms}ms`));
    }, ms);
    promise.then(
      (v) => {
        clearTimeout(timer);
        resolve(v);
      },
      (e) => {
        clearTimeout(timer);
        reject(e);
      },
    );
  });
}

/**
 * Returns bookings that overlap with the given day (local day boundaries).
 * Subscribes to realtime changes so the timeline stays in sync.
 */
export function useCalendarBookings(date: Date) {
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const inFlightRef = useRef(0);

  const dayStart = new Date(date);
  dayStart.setHours(0, 0, 0, 0);
  const dayEnd = new Date(dayStart);
  dayEnd.setDate(dayEnd.getDate() + 1);

  const dayStartIso = dayStart.toISOString();
  const dayEndIso = dayEnd.toISOString();

  const load = useCallback(
    async (reason: string) => {
      const id = ++inFlightRef.current;
      const start = Date.now();
      logger.debug('useCalendarBookings', 'Load start', {
        reason,
        callId: id,
        dayStart: dayStartIso,
      });
      try {
        setError(null);
        const { data, error: err } = await withTimeout(
          supabase
            .from('bookings')
            .select('*, customer:customers(*), room:rooms(*)')
            .in('status', ['booked', 'checked_in', 'checked_out'])
            .lt('check_in', dayEndIso)
            .gt('check_out', dayStartIso)
            .order('check_in', { ascending: true }),
          FETCH_TIMEOUT_MS,
          'calendarBookings.fetch',
        );
        if (err) throw err;
        if (inFlightRef.current === id) {
          setBookings((data as Booking[]) ?? []);
          logger.info('useCalendarBookings', 'Load ok', {
            reason,
            callId: id,
            count: (data as Booking[] | null)?.length ?? 0,
            durationMs: Date.now() - start,
            dayStart: dayStartIso,
          });
        } else {
          logger.debug('useCalendarBookings', 'Load discarded (stale)', {
            reason,
            callId: id,
          });
        }
      } catch (e: any) {
        if (inFlightRef.current === id) {
          setError(e?.message ?? 'Failed to load calendar bookings');
        }
        logger.error('useCalendarBookings', 'Load failed', {
          reason,
          callId: id,
          dayStart: dayStartIso,
          durationMs: Date.now() - start,
          error: e?.message ?? String(e),
        });
      } finally {
        if (inFlightRef.current === id) {
          setLoading(false);
        }
      }
    },
    [dayStartIso, dayEndIso],
  );

  useEffect(() => {
    setLoading(true);
    logger.info('useCalendarBookings', 'Date changed', { dayStart: dayStartIso });
    load('date-change');

    const channelName = `calendar-bookings-${dayStartIso}`;
    const channel = supabase
      .channel(channelName)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'bookings' },
        (payload) => {
          logger.debug('useCalendarBookings', 'Realtime change', {
            eventType: (payload as any)?.eventType,
            dayStart: dayStartIso,
          });
          load('realtime');
        },
      )
      .subscribe((status) => {
        logger.debug('useCalendarBookings', 'Realtime subscribe status', {
          status,
          channelName,
        });
      });

    return () => {
      logger.debug('useCalendarBookings', 'Removing channel', { channelName });
      supabase.removeChannel(channel);
    };
  }, [load, dayStartIso]);

  const refresh = useCallback(async () => {
    setLoading(true);
    await load('refresh');
  }, [load]);

  return { bookings, loading, error, refresh, dayStart, dayEnd };
}
