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
  // Track which userId is currently loaded and which is in-flight so we can
  // dedupe reloads triggered by overlapping auth events (TOKEN_REFRESHED,
  // SIGNED_IN, etc.). Using refs avoids stale-closure issues inside the
  // onAuthStateChange callback.
  const loadedUserIdRef = useRef<string | null>(null);
  const inFlightUserIdRef = useRef<string | null>(null);

  const loadProfile = useCallback(async (userId: string, opts?: { force?: boolean }) => {
    if (!opts?.force) {
      if (inFlightUserIdRef.current === userId) return;
      if (loadedUserIdRef.current === userId) return;
    }
    inFlightUserIdRef.current = userId;
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
      loadedUserIdRef.current = userId;
      logger.info('Auth', 'Profile loaded', {
        userId,
        durationMs: Date.now() - start,
        role: prof?.role ?? null,
        hasName: !!prof?.name,
      });
    } catch (e: any) {
      const message = e?.message ?? String(e);
      // Do NOT clear an already-loaded profile on a later failure. A timeout
      // on a refresh shouldn't strip the user's role/name out from under the
      // UI when we already have a good copy. The Retry button can force a
      // fresh fetch via refreshProfile().
      setProfileError(message);
      logger.error('Auth', 'Profile load failed', {
        userId,
        durationMs: Date.now() - start,
        error: message,
        keptCachedProfile: loadedUserIdRef.current === userId,
      });
    } finally {
      if (inFlightUserIdRef.current === userId) {
        inFlightUserIdRef.current = null;
      }
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
      .then(({ data: { session: s } }) => {
        if (!mounted) return;
        sessionLoadedRef.current = true;
        logger.info('Auth', 'Initial session resolved', {
          hasSession: !!s,
          userId: s?.user?.id ?? null,
          durationMs: Date.now() - initStart,
        });
        setSession(s);
        if (s?.user) {
          // Defer so we don't run a Supabase query while the auth lock is
          // still held by getSession(). See onAuthStateChange below.
          const uid = s.user.id;
          setTimeout(() => {
            if (mounted) loadProfile(uid);
          }, 0);
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
      (event, s) => {
        if (!mounted) return;
        logger.info('Auth', 'Auth state changed', {
          event,
          hasSession: !!s,
          userId: s?.user?.id ?? null,
        });
        setSession(s);

        if (!s?.user) {
          loadedUserIdRef.current = null;
          inFlightUserIdRef.current = null;
          setProfile(null);
          setProfileError(null);
          return;
        }

        // TOKEN_REFRESHED keeps the same user; the existing profile is still
        // valid. Skipping the refetch avoids the Supabase auth-lock deadlock
        // that times out at 10s and would otherwise wipe the cached profile.
        if (event === 'TOKEN_REFRESHED' && loadedUserIdRef.current === s.user.id) {
          return;
        }

        // CRITICAL: never await a Supabase query inside this callback.
        // supabase-js holds an internal auth lock while this listener runs;
        // any .from(...) call from here will wait for that lock and hang
        // (the symptom we were seeing as "fetchProfile timed out after
        // 10000ms" on TOKEN_REFRESHED / SIGNED_IN). Defer to a microtask so
        // the lock is released first.
        const uid = s.user.id;
        setTimeout(() => {
          if (!mounted) return;
          loadProfile(uid);
        }, 0);
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
      loadedUserIdRef.current = null;
      inFlightUserIdRef.current = null;
      setProfile(null);
      setProfileError(null);
      setSession(null);
    }
  }, []);

  const refreshProfile = useCallback(async () => {
    if (session?.user) {
      logger.info('Auth', 'Refreshing profile', { userId: session.user.id });
      await loadProfile(session.user.id, { force: true });
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
