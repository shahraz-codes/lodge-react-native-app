import { Stack, useRouter, useSegments } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useRef } from 'react';
import 'react-native-reanimated';

import { AuthProvider, useAuth } from '@/hooks/use-auth';
import { LoadingOverlay } from '@/components/loading-overlay';
import {
  addNotificationResponseListener,
  configureNotificationHandler,
  requestNotificationPermissions,
} from '@/services/notifications';
import { logger } from '@/services/logger';

logger.init();

const AUTHENTICATED_SEGMENTS = [
  '(tabs)',
  'room-management',
  'booking-confirmation',
  'booking-details',
  'user-management',
];

function AuthGate() {
  const { session, loading, profile, role } = useAuth();
  const segments = useSegments();
  const router = useRouter();
  const lastDecisionRef = useRef<string | null>(null);

  useEffect(() => {
    if (loading) {
      logger.debug('AuthGate', 'Awaiting auth init', { segments });
      return;
    }

    const inProtectedRoute = AUTHENTICATED_SEGMENTS.includes(segments[0] as string);
    const decision = !session && inProtectedRoute
      ? 'redirect→login'
      : session && !inProtectedRoute
        ? 'redirect→tabs'
        : 'stay';

    if (lastDecisionRef.current !== `${decision}|${segments.join('/')}`) {
      lastDecisionRef.current = `${decision}|${segments.join('/')}`;
      logger.info('AuthGate', 'Routing decision', {
        decision,
        hasSession: !!session,
        hasProfile: !!profile,
        role,
        segments,
      });
    }

    if (!session && inProtectedRoute) {
      router.replace('/login');
    } else if (session && !inProtectedRoute) {
      router.replace('/(tabs)');
    }
  }, [session, loading, segments, router, profile, role]);

  useEffect(() => {
    let unsubscribe: (() => void) | null = null;
    let mounted = true;

    (async () => {
      try {
        await configureNotificationHandler();
      } catch (e: any) {
        logger.warn('Notifications', 'configureNotificationHandler failed', {
          error: e?.message ?? String(e),
        });
      }
      if (session) {
        try {
          const granted = await requestNotificationPermissions();
          logger.info('Notifications', 'Permissions request', { granted });
        } catch (e: any) {
          logger.warn('Notifications', 'requestPermissions failed', {
            error: e?.message ?? String(e),
          });
        }
      }
      try {
        unsubscribe = await addNotificationResponseListener((bookingId) => {
          logger.info('Notifications', 'Response received', { bookingId });
          router.push({
            pathname: '/booking-confirmation',
            params: { bookingId },
          });
        });
      } catch (e: any) {
        logger.warn('Notifications', 'addResponseListener failed', {
          error: e?.message ?? String(e),
        });
      }
      if (!mounted && unsubscribe) {
        unsubscribe();
        unsubscribe = null;
      }
    })();

    return () => {
      mounted = false;
      if (unsubscribe) unsubscribe();
    };
  }, [session, router]);

  if (loading) {
    return <LoadingOverlay message="Loading..." />;
  }

  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="login" />
      <Stack.Screen name="(tabs)" />
      <Stack.Screen name="room-management" />
      <Stack.Screen name="booking-confirmation" />
      <Stack.Screen name="booking-details" />
      <Stack.Screen name="user-management" />
    </Stack>
  );
}

export default function RootLayout() {
  useEffect(() => {
    logger.info('RootLayout', 'Mounted');
    return () => {
      logger.info('RootLayout', 'Unmounting (flush)');
      logger.flushSync();
    };
  }, []);

  return (
    <AuthProvider>
      <AuthGate />
      <StatusBar style="auto" />
    </AuthProvider>
  );
}
