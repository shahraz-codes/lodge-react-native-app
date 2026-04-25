import 'react-native-url-polyfill/auto';
import { Platform } from 'react-native';
import { createClient } from '@supabase/supabase-js';
import * as SecureStore from 'expo-secure-store';
import { logger } from '@/services/logger';

const SLOW_STORAGE_MS = 1500;

async function timedStorageOp<T>(op: string, key: string, fn: () => Promise<T>): Promise<T> {
  const start = Date.now();
  try {
    const result = await fn();
    const dur = Date.now() - start;
    if (dur > SLOW_STORAGE_MS) {
      logger.warn('Supabase.storage', `${op} slow`, { key, durationMs: dur });
    } else {
      logger.debug('Supabase.storage', `${op} ok`, { key, durationMs: dur });
    }
    return result;
  } catch (e: any) {
    logger.error('Supabase.storage', `${op} failed`, {
      key,
      durationMs: Date.now() - start,
      error: e?.message ?? String(e),
    });
    throw e;
  }
}

const NativeStoreAdapter = {
  getItem: (key: string) => timedStorageOp('getItem', key, () => SecureStore.getItemAsync(key)),
  setItem: (key: string, value: string) =>
    timedStorageOp('setItem', key, () => SecureStore.setItemAsync(key, value)),
  removeItem: (key: string) =>
    timedStorageOp('removeItem', key, () => SecureStore.deleteItemAsync(key)),
};

const WebStoreAdapter = {
  getItem: (key: string) => {
    if (typeof window === 'undefined') return null;
    return window.localStorage.getItem(key);
  },
  setItem: (key: string, value: string) => {
    if (typeof window !== 'undefined') {
      window.localStorage.setItem(key, value);
    }
  },
  removeItem: (key: string) => {
    if (typeof window !== 'undefined') {
      window.localStorage.removeItem(key);
    }
  },
};

const storage = Platform.OS === 'web' ? WebStoreAdapter : NativeStoreAdapter;

const SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL!;
const SUPABASE_ANON_KEY = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY!;

if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
  logger.error('Supabase', 'Missing env vars', {
    hasUrl: !!SUPABASE_URL,
    hasKey: !!SUPABASE_ANON_KEY,
  });
}

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    storage,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
  },
});

logger.info('Supabase', 'Client created', {
  url: SUPABASE_URL ? `${SUPABASE_URL.slice(0, 24)}…` : null,
  platform: Platform.OS,
});
