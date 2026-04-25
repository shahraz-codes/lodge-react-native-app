import { useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from '@/lib/supabase';
import type { Room } from '@/lib/types';
import {
  fetchRooms,
  fetchAvailableRooms,
  fetchAvailableRoomsForSlot,
} from '@/services/rooms';
import { logger } from '@/services/logger';

let channelCounter = 0;

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

export function useRooms() {
  const [rooms, setRooms] = useState<Room[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const channelId = useRef(`rooms-realtime-${++channelCounter}`);
  const inFlightRef = useRef(0);

  const load = useCallback(async (reason: string) => {
    const id = ++inFlightRef.current;
    const start = Date.now();
    logger.debug('useRooms', 'Load start', { reason, callId: id });
    try {
      setError(null);
      const data = await withTimeout(fetchRooms(), FETCH_TIMEOUT_MS, 'fetchRooms');
      if (inFlightRef.current === id) {
        setRooms(data);
        logger.info('useRooms', 'Load ok', {
          reason,
          callId: id,
          count: data.length,
          durationMs: Date.now() - start,
        });
      } else {
        logger.debug('useRooms', 'Load discarded (stale)', { reason, callId: id });
      }
    } catch (e: any) {
      const msg = e?.message ?? String(e);
      if (inFlightRef.current === id) {
        setError(msg);
      }
      logger.error('useRooms', 'Load failed', {
        reason,
        callId: id,
        durationMs: Date.now() - start,
        error: msg,
      });
    } finally {
      if (inFlightRef.current === id) {
        setLoading(false);
      }
    }
  }, []);

  useEffect(() => {
    logger.info('useRooms', 'Mount', { channelId: channelId.current });
    load('mount');

    const channel = supabase
      .channel(channelId.current)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'rooms' },
        (payload) => {
          logger.debug('useRooms', 'Realtime: rooms changed', {
            eventType: (payload as any)?.eventType,
          });
          load('realtime-rooms');
        }
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'bookings' },
        (payload) => {
          logger.debug('useRooms', 'Realtime: bookings changed', {
            eventType: (payload as any)?.eventType,
          });
          load('realtime-bookings');
        }
      )
      .subscribe((status) => {
        logger.debug('useRooms', 'Realtime subscribe status', {
          status,
          channelId: channelId.current,
        });
      });

    return () => {
      logger.info('useRooms', 'Unmount, removing channel', { channelId: channelId.current });
      supabase.removeChannel(channel);
    };
  }, [load]);

  const refresh = useCallback(async () => {
    setLoading(true);
    await load('refresh');
  }, [load]);

  const stats = {
    total: rooms.length,
    available: rooms.filter((r) => r.status === 'available').length,
    occupied: rooms.filter((r) => r.status === 'occupied').length,
    maintenance: rooms.filter((r) => r.status === 'maintenance').length,
  };

  return { rooms, loading, error, refresh, stats };
}

export function useAvailableRooms() {
  const [rooms, setRooms] = useState<Room[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    const start = Date.now();
    try {
      setError(null);
      const data = await withTimeout(
        fetchAvailableRooms(),
        FETCH_TIMEOUT_MS,
        'fetchAvailableRooms',
      );
      setRooms(data);
      logger.info('useAvailableRooms', 'Load ok', {
        count: data.length,
        durationMs: Date.now() - start,
      });
    } catch (e: any) {
      setError(e.message);
      logger.error('useAvailableRooms', 'Load failed', {
        error: e?.message ?? String(e),
        durationMs: Date.now() - start,
      });
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
  const inFlightRef = useRef(0);

  const checkInIso = checkIn.toISOString();
  const checkOutIso = checkOut.toISOString();

  const load = useCallback(async () => {
    const id = ++inFlightRef.current;
    const start = Date.now();
    logger.debug('useAvailableRoomsForSlot', 'Load start', {
      callId: id,
      checkIn: checkInIso,
      checkOut: checkOutIso,
    });
    try {
      setError(null);
      const data = await withTimeout(
        fetchAvailableRoomsForSlot(checkInIso, checkOutIso),
        FETCH_TIMEOUT_MS,
        'fetchAvailableRoomsForSlot',
      );
      if (inFlightRef.current === id) {
        setRooms(data);
        logger.info('useAvailableRoomsForSlot', 'Load ok', {
          callId: id,
          count: data.length,
          durationMs: Date.now() - start,
        });
      }
    } catch (e: any) {
      if (inFlightRef.current === id) {
        setError(e.message);
      }
      logger.error('useAvailableRoomsForSlot', 'Load failed', {
        callId: id,
        durationMs: Date.now() - start,
        error: e?.message ?? String(e),
      });
    } finally {
      if (inFlightRef.current === id) {
        setLoading(false);
      }
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
