import { Stack, useRouter, useSegments } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';
import 'react-native-reanimated';

import { AuthProvider, useAuth } from '@/hooks/use-auth';
import { LoadingOverlay } from '@/components/loading-overlay';
import {
  addNotificationResponseListener,
  configureNotificationHandler,
  requestNotificationPermissions,
} from '@/services/notifications';

const AUTHENTICATED_SEGMENTS = ['(tabs)', 'room-management', 'booking-confirmation'];

function AuthGate() {
  const { session, loading } = useAuth();
  const segments = useSegments();
  const router = useRouter();

  useEffect(() => {
    if (loading) return;

    const inProtectedRoute = AUTHENTICATED_SEGMENTS.includes(segments[0] as string);

    if (!session && inProtectedRoute) {
      router.replace('/login');
    } else if (session && !inProtectedRoute) {
      router.replace('/(tabs)');
    }
  }, [session, loading, segments, router]);

  useEffect(() => {
    let unsubscribe: (() => void) | null = null;
    let mounted = true;

    (async () => {
      await configureNotificationHandler();
      if (session) {
        await requestNotificationPermissions();
      }
      unsubscribe = await addNotificationResponseListener((bookingId) => {
        router.push({
          pathname: '/booking-confirmation',
          params: { bookingId },
        });
      });
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
    </Stack>
  );
}

export default function RootLayout() {
  return (
    <AuthProvider>
      <AuthGate />
      <StatusBar style="auto" />
    </AuthProvider>
  );
}
