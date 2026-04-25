import { Platform } from 'react-native';
import type { Booking } from '@/lib/types';

/**
 * Notification service for checkout reminders.
 *
 * Uses `expo-notifications` when available at runtime. Imports are dynamic so
 * the app still works even if the native module has not been rebuilt yet and
 * so that web builds do not crash on unsupported APIs.
 */

type NotificationsModule = typeof import('expo-notifications');

let notificationsModulePromise: Promise<NotificationsModule | null> | null = null;

async function getNotificationsModule(): Promise<NotificationsModule | null> {
  if (Platform.OS === 'web') return null;
  if (!notificationsModulePromise) {
    notificationsModulePromise = import('expo-notifications')
      .then((mod) => mod as NotificationsModule)
      .catch(() => null);
  }
  return notificationsModulePromise;
}

const SCHEDULED_KEY_PREFIX = 'checkout_reminder';

function reminderKey(bookingId: string, variant: 'pre' | 'due'): string {
  return `${SCHEDULED_KEY_PREFIX}_${variant}_${bookingId}`;
}

export async function requestNotificationPermissions(): Promise<boolean> {
  const Notifications = await getNotificationsModule();
  if (!Notifications) return false;

  try {
    const { status: existing } = await Notifications.getPermissionsAsync();
    if (existing === 'granted') return true;
    const { status } = await Notifications.requestPermissionsAsync();
    return status === 'granted';
  } catch {
    return false;
  }
}

export async function configureNotificationHandler(): Promise<void> {
  const Notifications = await getNotificationsModule();
  if (!Notifications) return;

  try {
    Notifications.setNotificationHandler({
      handleNotification: async () => ({
        shouldShowAlert: true,
        shouldShowBanner: true,
        shouldShowList: true,
        shouldPlaySound: true,
        shouldSetBadge: false,
      }),
    });
  } catch {
    // Older SDKs may not support all options; ignore.
  }
}

export async function scheduleCheckoutReminder(booking: Booking): Promise<void> {
  const Notifications = await getNotificationsModule();
  if (!Notifications) return;

  const checkOut = new Date(booking.check_out);
  if (isNaN(checkOut.getTime())) return;

  const now = Date.now();
  const reminderTime = new Date(checkOut.getTime() - 30 * 60 * 1000);
  const roomNumber = booking.room?.room_number ?? '—';
  const customerName = booking.customer?.name ?? 'Guest';

  await cancelCheckoutReminder(booking.id);

  try {
    if (reminderTime.getTime() > now) {
      await Notifications.scheduleNotificationAsync({
        identifier: reminderKey(booking.id, 'pre'),
        content: {
          title: 'Checkout Reminder',
          body: `${customerName} in Room #${roomNumber} — checkout in 30 minutes.`,
          data: { bookingId: booking.id, type: 'checkout_reminder' },
        },
        trigger: { date: reminderTime } as any,
      });
    }

    if (checkOut.getTime() > now) {
      await Notifications.scheduleNotificationAsync({
        identifier: reminderKey(booking.id, 'due'),
        content: {
          title: 'Checkout Due Now',
          body: `${customerName} in Room #${roomNumber} — checkout time reached.`,
          data: { bookingId: booking.id, type: 'checkout_due' },
        },
        trigger: { date: checkOut } as any,
      });
    }
  } catch {
    // Best-effort scheduling; failures should not break booking flow.
  }
}

export async function cancelCheckoutReminder(bookingId: string): Promise<void> {
  const Notifications = await getNotificationsModule();
  if (!Notifications) return;

  try {
    await Notifications.cancelScheduledNotificationAsync(reminderKey(bookingId, 'pre'));
  } catch {
    // Identifier may not exist; ignore.
  }
  try {
    await Notifications.cancelScheduledNotificationAsync(reminderKey(bookingId, 'due'));
  } catch {
    // Identifier may not exist; ignore.
  }
}

export async function addNotificationResponseListener(
  handler: (bookingId: string) => void
): Promise<(() => void) | null> {
  const Notifications = await getNotificationsModule();
  if (!Notifications) return null;

  try {
    const subscription = Notifications.addNotificationResponseReceivedListener((response) => {
      const data = response.notification.request.content.data as { bookingId?: string } | undefined;
      if (data?.bookingId) handler(data.bookingId);
    });
    return () => subscription.remove();
  } catch {
    return null;
  }
}
