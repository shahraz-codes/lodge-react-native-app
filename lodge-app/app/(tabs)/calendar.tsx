import React, { useMemo, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
  RefreshControl,
  ActivityIndicator,
  Platform,
  Modal,
} from 'react-native';
import DateTimePicker, { DateTimePickerEvent } from '@react-native-community/datetimepicker';
import { SafeAreaView } from 'react-native-safe-area-context';
import { AppColors } from '@/constants/theme';
import { useRooms } from '@/hooks/use-rooms';
import { useCalendarBookings } from '@/hooks/use-calendar-bookings';
import { RoomTimeline } from '@/components/room-timeline';
import type { Booking } from '@/lib/types';

const DAY_MS = 24 * 60 * 60 * 1000;

function formatDate(d: Date): string {
  return d.toLocaleDateString('en-IN', {
    weekday: 'short',
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });
}

function isSameDay(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

function toISODate(d: Date): string {
  return d.toISOString().split('T')[0];
}

export default function CalendarScreen() {
  const [selectedDate, setSelectedDate] = useState<Date>(() => {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    return d;
  });
  const [showPicker, setShowPicker] = useState(false);
  const [selectedBooking, setSelectedBooking] = useState<Booking | null>(null);

  const { rooms, loading: roomsLoading } = useRooms();
  const { bookings, loading: bookingsLoading, refresh, dayStart, dayEnd } =
    useCalendarBookings(selectedDate);

  const loading = roomsLoading || bookingsLoading;
  const isToday = isSameDay(selectedDate, new Date());

  const sortedRooms = useMemo(
    () => [...rooms].sort((a, b) => a.room_number.localeCompare(b.room_number)),
    [rooms],
  );

  const stats = useMemo(() => {
    const active = bookings.filter(
      (b) => b.status === 'booked' || b.status === 'checked_in',
    );
    const occupiedRoomIds = new Set(active.map((b) => b.room_id));
    return {
      bookings: active.length,
      occupied: occupiedRoomIds.size,
      available: rooms.length - occupiedRoomIds.size,
    };
  }, [bookings, rooms]);

  const shiftDate = (days: number) => {
    const next = new Date(selectedDate.getTime() + days * DAY_MS);
    next.setHours(0, 0, 0, 0);
    setSelectedDate(next);
  };

  const handleDateChange = (_: DateTimePickerEvent, date?: Date) => {
    setShowPicker(false);
    if (!date) return;
    const next = new Date(date);
    next.setHours(0, 0, 0, 0);
    setSelectedDate(next);
  };

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.header}>
        <Text style={styles.title}>Calendar</Text>
      </View>

      <View style={styles.dateNav}>
        <Pressable style={styles.navBtn} onPress={() => shiftDate(-1)} hitSlop={8}>
          <Text style={styles.navBtnText}>‹</Text>
        </Pressable>

        {Platform.OS === 'web' ? (
          React.createElement('input', {
            type: 'date',
            value: toISODate(selectedDate),
            onChange: (e: any) => {
              const picked = new Date(e.target.value + 'T00:00:00');
              if (!isNaN(picked.getTime())) setSelectedDate(picked);
            },
            style: {
              flex: 1,
              padding: 12,
              fontSize: 15,
              borderRadius: 10,
              border: `1px solid ${AppColors.border}`,
              backgroundColor: AppColors.white,
              color: AppColors.black,
              textAlign: 'center',
            },
          })
        ) : (
          <Pressable style={styles.dateBtn} onPress={() => setShowPicker(true)}>
            <Text style={styles.dateBtnText}>{formatDate(selectedDate)}</Text>
            {isToday && <Text style={styles.todayLabel}>Today</Text>}
          </Pressable>
        )}

        <Pressable style={styles.navBtn} onPress={() => shiftDate(1)} hitSlop={8}>
          <Text style={styles.navBtnText}>›</Text>
        </Pressable>
      </View>

      {!isToday && (
        <Pressable
          style={styles.todayBtn}
          onPress={() => {
            const d = new Date();
            d.setHours(0, 0, 0, 0);
            setSelectedDate(d);
          }}
        >
          <Text style={styles.todayBtnText}>Jump to Today</Text>
        </Pressable>
      )}

      <View style={styles.stats}>
        <StatBox label="Rooms" value={stats.available + stats.occupied} />
        <StatBox label="Occupied" value={stats.occupied} color={AppColors.roomOccupied} />
        <StatBox label="Available" value={stats.available} color={AppColors.roomAvailable} />
        <StatBox label="Bookings" value={stats.bookings} color={AppColors.primary} />
      </View>

      <Text style={styles.legendTitle}>Legend</Text>
      <View style={styles.legend}>
        <LegendDot color={AppColors.info} label="Booked" />
        <LegendDot color={AppColors.success} label="Checked In" />
        <LegendDot color={AppColors.grey} label="Checked Out" />
        <LegendDot color={AppColors.danger} label="Overdue" />
      </View>

      <ScrollView
        style={styles.timelineScroll}
        refreshControl={
          <RefreshControl refreshing={loading} onRefresh={refresh} colors={[AppColors.primary]} />
        }
      >
        {loading && rooms.length === 0 ? (
          <View style={styles.loadingBox}>
            <ActivityIndicator color={AppColors.primary} />
          </View>
        ) : (
          <ScrollView horizontal showsHorizontalScrollIndicator>
            <RoomTimeline
              rooms={sortedRooms}
              bookings={bookings}
              dayStart={dayStart}
              dayEnd={dayEnd}
              onBlockPress={setSelectedBooking}
            />
          </ScrollView>
        )}
      </ScrollView>

      {Platform.OS !== 'web' && showPicker && (
        <DateTimePicker
          value={selectedDate}
          mode="date"
          onChange={handleDateChange}
        />
      )}

      <Modal
        visible={selectedBooking !== null}
        transparent
        animationType="fade"
        onRequestClose={() => setSelectedBooking(null)}
      >
        <Pressable style={styles.overlay} onPress={() => setSelectedBooking(null)}>
          <Pressable style={styles.modalCard} onPress={() => {}}>
            {selectedBooking && (
              <>
                <Text style={styles.modalTitle}>
                  {selectedBooking.customer?.name ?? 'Guest'}
                </Text>
                <Text style={styles.modalSubtitle}>
                  Room #{selectedBooking.room?.room_number ?? '—'}
                </Text>
                <View style={styles.modalRow}>
                  <Text style={styles.modalLabel}>Check-in</Text>
                  <Text style={styles.modalValue}>
                    {new Date(selectedBooking.check_in).toLocaleString('en-IN', {
                      day: '2-digit',
                      month: 'short',
                      hour: '2-digit',
                      minute: '2-digit',
                      hour12: true,
                    })}
                  </Text>
                </View>
                <View style={styles.modalRow}>
                  <Text style={styles.modalLabel}>Check-out</Text>
                  <Text style={styles.modalValue}>
                    {new Date(selectedBooking.check_out).toLocaleString('en-IN', {
                      day: '2-digit',
                      month: 'short',
                      hour: '2-digit',
                      minute: '2-digit',
                      hour12: true,
                    })}
                  </Text>
                </View>
                <View style={styles.modalRow}>
                  <Text style={styles.modalLabel}>Status</Text>
                  <Text style={styles.modalValue}>
                    {selectedBooking.status.replace('_', ' ')}
                  </Text>
                </View>
                <View style={styles.modalRow}>
                  <Text style={styles.modalLabel}>Amount</Text>
                  <Text style={[styles.modalValue, { color: AppColors.primary }]}>
                    ₹{selectedBooking.total_amount}
                  </Text>
                </View>
                <Pressable
                  style={styles.modalClose}
                  onPress={() => setSelectedBooking(null)}
                >
                  <Text style={styles.modalCloseText}>Close</Text>
                </Pressable>
              </>
            )}
          </Pressable>
        </Pressable>
      </Modal>
    </SafeAreaView>
  );
}

function StatBox({ label, value, color }: { label: string; value: number; color?: string }) {
  return (
    <View style={styles.statBox}>
      <Text style={[styles.statValue, color && { color }]}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

function LegendDot({ color, label }: { color: string; label: string }) {
  return (
    <View style={styles.legendItem}>
      <View style={[styles.legendDot, { backgroundColor: color }]} />
      <Text style={styles.legendLabel}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: AppColors.lightGrey,
  },
  header: {
    paddingHorizontal: 20,
    paddingVertical: 16,
    backgroundColor: AppColors.white,
    borderBottomWidth: 1,
    borderBottomColor: AppColors.border,
  },
  title: {
    fontSize: 24,
    fontWeight: '700',
    color: AppColors.black,
  },
  dateNav: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 4,
  },
  navBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: AppColors.white,
    borderWidth: 1,
    borderColor: AppColors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  navBtnText: {
    fontSize: 22,
    fontWeight: '700',
    color: AppColors.primary,
  },
  dateBtn: {
    flex: 1,
    height: 40,
    borderRadius: 10,
    backgroundColor: AppColors.white,
    borderWidth: 1,
    borderColor: AppColors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dateBtnText: {
    fontSize: 15,
    fontWeight: '600',
    color: AppColors.black,
  },
  todayLabel: {
    fontSize: 10,
    color: AppColors.primary,
    fontWeight: '700',
    textTransform: 'uppercase',
    marginTop: 2,
  },
  todayBtn: {
    alignSelf: 'center',
    paddingHorizontal: 16,
    paddingVertical: 6,
    marginTop: 8,
  },
  todayBtnText: {
    fontSize: 13,
    color: AppColors.primary,
    fontWeight: '700',
  },
  stats: {
    flexDirection: 'row',
    gap: 8,
    paddingHorizontal: 16,
    paddingTop: 12,
  },
  statBox: {
    flex: 1,
    backgroundColor: AppColors.white,
    borderRadius: 12,
    padding: 12,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: AppColors.border,
  },
  statValue: {
    fontSize: 20,
    fontWeight: '800',
    color: AppColors.black,
  },
  statLabel: {
    fontSize: 11,
    color: AppColors.grey,
    fontWeight: '600',
    marginTop: 2,
    textTransform: 'uppercase',
  },
  legendTitle: {
    fontSize: 11,
    fontWeight: '700',
    color: AppColors.grey,
    marginTop: 16,
    marginBottom: 8,
    marginHorizontal: 16,
    textTransform: 'uppercase',
  },
  legend: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
    paddingHorizontal: 16,
    marginBottom: 8,
  },
  legendItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  legendDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  legendLabel: {
    fontSize: 12,
    color: AppColors.grey,
    fontWeight: '600',
  },
  timelineScroll: {
    flex: 1,
    marginTop: 8,
    borderTopWidth: 1,
    borderTopColor: AppColors.border,
  },
  loadingBox: {
    padding: 48,
    alignItems: 'center',
  },
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  modalCard: {
    backgroundColor: AppColors.white,
    borderRadius: 16,
    padding: 20,
    width: '100%',
    maxWidth: 400,
    gap: 6,
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: '800',
    color: AppColors.black,
  },
  modalSubtitle: {
    fontSize: 14,
    color: AppColors.grey,
    fontWeight: '600',
    marginBottom: 10,
  },
  modalRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 6,
  },
  modalLabel: {
    fontSize: 13,
    color: AppColors.grey,
  },
  modalValue: {
    fontSize: 13,
    fontWeight: '600',
    color: AppColors.black,
    textTransform: 'capitalize',
  },
  modalClose: {
    marginTop: 12,
    alignSelf: 'center',
    paddingHorizontal: 24,
    paddingVertical: 10,
    borderRadius: 10,
    backgroundColor: AppColors.primary,
  },
  modalCloseText: {
    fontSize: 14,
    fontWeight: '700',
    color: AppColors.white,
  },
});
