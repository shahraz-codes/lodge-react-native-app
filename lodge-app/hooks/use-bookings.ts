import { useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from '@/lib/supabase';
import type { Booking } from '@/lib/types';
import { fetchBookings, fetchActiveBookings } from '@/services/bookings';
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

export function useBookings(activeOnly = false) {
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const inFlightRef = useRef(0);

  const load = useCallback(
    async (reason: string) => {
      const id = ++inFlightRef.current;
      const start = Date.now();
      logger.debug('useBookings', 'Load start', { reason, callId: id, activeOnly });
      try {
        setError(null);
        const data = await withTimeout(
          activeOnly ? fetchActiveBookings() : fetchBookings(),
          FETCH_TIMEOUT_MS,
          activeOnly ? 'fetchActiveBookings' : 'fetchBookings',
        );
        if (inFlightRef.current === id) {
          setBookings(data);
          logger.info('useBookings', 'Load ok', {
            reason,
            callId: id,
            count: data.length,
            durationMs: Date.now() - start,
          });
        } else {
          logger.debug('useBookings', 'Load discarded (stale)', {
            reason,
            callId: id,
          });
        }
      } catch (e: any) {
        if (inFlightRef.current === id) {
          setError(e.message);
        }
        logger.error('useBookings', 'Load failed', {
          reason,
          callId: id,
          durationMs: Date.now() - start,
          error: e?.message ?? String(e),
        });
      } finally {
        if (inFlightRef.current === id) {
          setLoading(false);
        }
      }
    },
    [activeOnly],
  );

  useEffect(() => {
    logger.info('useBookings', 'Mount', { activeOnly });
    load('mount');

    const channel = supabase
      .channel('bookings-realtime')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'bookings' },
        (payload) => {
          logger.debug('useBookings', 'Realtime change', {
            eventType: (payload as any)?.eventType,
          });
          load('realtime');
        }
      )
      .subscribe((status) => {
        logger.debug('useBookings', 'Realtime subscribe status', { status });
      });

    return () => {
      logger.info('useBookings', 'Unmount, removing channel');
      supabase.removeChannel(channel);
    };
  }, [load]);

  const refresh = useCallback(async () => {
    setLoading(true);
    await load('refresh');
  }, [load]);

  return { bookings, loading, error, refresh };
}
