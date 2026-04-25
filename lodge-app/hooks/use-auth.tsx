import React, { createContext, useContext, useEffect, useState, useCallback, useRef } from 'react';
import { Session } from '@supabase/supabase-js';
import { supabase } from '@/lib/supabase';
import type { Profile, UserRole } from '@/lib/types';
import { fetchProfile, signIn as authSignIn, signOut as authSignOut } from '@/services/auth';
import { logger } from '@/services/logger';

interface AuthState {
  session: Session | null;
  profile: Profile | null;
  loading: boolean;
  profileError: string | null;
  role: UserRole | null;
  isReceptionist: boolean;
  isOwner: boolean;
}

interface AuthContextValue extends AuthState {
  signIn: (email: string, password: string) => Promise<void>;
  signOut: () => Promise<void>;
  refreshProfile: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

const SESSION_INIT_TIMEOUT_MS = 12000;

function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error(`${label} timed out after ${ms}ms`));
    }, ms);
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (err) => {
        clearTimeout(timer);
        reject(err);
      },
    );
  });
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);
  const [profileError, setProfileError] = useState<string | null>(null);
  const sessionLoadedRef = useRef(false);

  const loadProfile = useCallback(async (userId: string) => {
    const start = Date.now();
    logger.info('Auth', 'Loading profile', { userId });
    try {
      const prof = await withTimeout(
        fetchProfile(userId),
        10000,
        'fetchProfile',
      );
      setProfile(prof);
      setProfileError(null);
      logger.info('Auth', 'Profile loaded', {
        userId,
        durationMs: Date.now() - start,
        role: prof?.role ?? null,
        hasName: !!prof?.name,
      });
    } catch (e: any) {
      const message = e?.message ?? String(e);
      setProfile(null);
      setProfileError(message);
      logger.error('Auth', 'Profile load failed', {
        userId,
        durationMs: Date.now() - start,
        error: message,
      });
    }
  }, []);

  useEffect(() => {
    let mounted = true;
    const initStart = Date.now();
    logger.info('Auth', 'Initializing auth provider');

    // Safety timeout: never let the app stay stuck on the global loading
    // overlay because a storage/network call hung. The user can still log in
    // manually after the timeout fires.
    const safetyTimer = setTimeout(() => {
      if (!sessionLoadedRef.current && mounted) {
        logger.warn('Auth', 'Init safety timeout fired, releasing loading state', {
          afterMs: Date.now() - initStart,
        });
        setLoading(false);
      }
    }, SESSION_INIT_TIMEOUT_MS);

    withTimeout(
      supabase.auth.getSession(),
      SESSION_INIT_TIMEOUT_MS,
      'supabase.auth.getSession',
    )
      .then(async ({ data: { session: s } }) => {
        if (!mounted) return;
        sessionLoadedRef.current = true;
        logger.info('Auth', 'Initial session resolved', {
          hasSession: !!s,
          userId: s?.user?.id ?? null,
          durationMs: Date.now() - initStart,
        });
        setSession(s);
        if (s?.user) {
          await loadProfile(s.user.id);
        }
      })
      .catch((e: any) => {
        if (!mounted) return;
        sessionLoadedRef.current = true;
        logger.error('Auth', 'Initial session failed', {
          error: e?.message ?? String(e),
          durationMs: Date.now() - initStart,
        });
      })
      .finally(() => {
        if (!mounted) return;
        clearTimeout(safetyTimer);
        setLoading(false);
      });

    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (event, s) => {
        if (!mounted) return;
        logger.info('Auth', 'Auth state changed', {
          event,
          hasSession: !!s,
          userId: s?.user?.id ?? null,
        });
        setSession(s);
        if (s?.user) {
          await loadProfile(s.user.id);
        } else {
          setProfile(null);
          setProfileError(null);
        }
      }
    );

    return () => {
      mounted = false;
      clearTimeout(safetyTimer);
      subscription.unsubscribe();
    };
  }, [loadProfile]);

  const signIn = useCallback(async (email: string, password: string) => {
    setLoading(true);
    logger.info('Auth', 'Sign-in attempt', { email });
    const start = Date.now();
    try {
      await authSignIn(email, password);
      logger.info('Auth', 'Sign-in success', { email, durationMs: Date.now() - start });
    } catch (e: any) {
      logger.warn('Auth', 'Sign-in failed', {
        email,
        durationMs: Date.now() - start,
        error: e?.message ?? String(e),
      });
      throw e;
    } finally {
      setLoading(false);
    }
  }, []);

  const signOut = useCallback(async () => {
    logger.info('Auth', 'Sign-out requested');
    try {
      await authSignOut();
      logger.info('Auth', 'Sign-out complete');
    } catch (e: any) {
      logger.warn('Auth', 'Sign-out failed', { error: e?.message ?? String(e) });
    } finally {
      setProfile(null);
      setProfileError(null);
      setSession(null);
    }
  }, []);

  const refreshProfile = useCallback(async () => {
    if (session?.user) {
      logger.info('Auth', 'Refreshing profile', { userId: session.user.id });
      await loadProfile(session.user.id);
    }
  }, [session, loadProfile]);

  const role = profile?.role ?? null;
  // Strict role checks: only treat the user as a given role when their profile
  // has loaded and the role is explicit. Previously `isOwner` defaulted to
  // true whenever the profile was missing/null, which let receptionists see
  // owner-only controls (e.g. add/delete room) before the profile finished
  // loading or when the profile fetch failed.
  const isReceptionist = role === 'receptionist';
  const isOwner = role === 'owner';

  const value: AuthContextValue = {
    session,
    profile,
    loading,
    profileError,
    role,
    isReceptionist,
    isOwner,
    signIn,
    signOut,
    refreshProfile,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return ctx;
}
