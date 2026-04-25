import React from 'react';
import { View, Text, StyleSheet, Pressable } from 'react-native';
import { AppColors } from '@/constants/theme';
import type { Booking, Room } from '@/lib/types';

const HOURS = 24;
const HOUR_WIDTH = 48;
const ROOM_COL_WIDTH = 72;
const ROW_HEIGHT = 56;

interface Props {
  rooms: Room[];
  bookings: Booking[];
  dayStart: Date;
  dayEnd: Date;
  onBlockPress?: (booking: Booking) => void;
}

function getBlockColor(booking: Booking, dayEnd: Date): string {
  const checkOut = new Date(booking.check_out);
  const now = new Date();
  if (booking.status === 'checked_in' && checkOut.getTime() < now.getTime()) {
    return AppColors.danger;
  }
  if (booking.status === 'checked_in') return AppColors.success;
  if (booking.status === 'booked') return AppColors.info;
  if (booking.status === 'checked_out') return AppColors.grey;
  return AppColors.border;
  void dayEnd;
}

export function RoomTimeline({ rooms, bookings, dayStart, dayEnd, onBlockPress }: Props) {
  const dayStartMs = dayStart.getTime();
  const dayEndMs = dayEnd.getTime();
  const dayMs = dayEndMs - dayStartMs;

  const bookingsByRoom = React.useMemo(() => {
    const map = new Map<string, Booking[]>();
    bookings.forEach((b) => {
      const list = map.get(b.room_id) ?? [];
      list.push(b);
      map.set(b.room_id, list);
    });
    return map;
  }, [bookings]);

  return (
    <View style={styles.container}>
      <View style={styles.hourHeader}>
        <View style={[styles.roomHeader, { width: ROOM_COL_WIDTH }]}>
          <Text style={styles.headerText}>Room</Text>
        </View>
        <View style={styles.hoursRow}>
          {Array.from({ length: HOURS }).map((_, h) => (
            <View key={h} style={[styles.hourCell, { width: HOUR_WIDTH }]}>
              <Text style={styles.hourText}>{formatHour(h)}</Text>
            </View>
          ))}
        </View>
      </View>

      {rooms.map((room) => {
        const roomBookings = bookingsByRoom.get(room.id) ?? [];
        return (
          <View key={room.id} style={styles.row}>
            <View style={[styles.roomLabel, { width: ROOM_COL_WIDTH }]}>
              <Text style={styles.roomNumber}>#{room.room_number}</Text>
              <Text style={styles.roomType}>{room.type}</Text>
            </View>
            <View style={[styles.track, { width: HOURS * HOUR_WIDTH }]}>
              {Array.from({ length: HOURS }).map((_, h) => (
                <View
                  key={h}
                  style={[
                    styles.trackSlot,
                    { left: h * HOUR_WIDTH, width: HOUR_WIDTH },
                  ]}
                />
              ))}
              {roomBookings.map((booking) => {
                const checkInMs = new Date(booking.check_in).getTime();
                const checkOutMs = new Date(booking.check_out).getTime();

                const startMs = Math.max(checkInMs, dayStartMs);
                const endMs = Math.min(checkOutMs, dayEndMs);
                if (endMs <= startMs) return null;

                const leftPct = (startMs - dayStartMs) / dayMs;
                const widthPct = (endMs - startMs) / dayMs;
                const left = leftPct * (HOURS * HOUR_WIDTH);
                const width = Math.max(12, widthPct * (HOURS * HOUR_WIDTH));
                const bg = getBlockColor(booking, dayEnd);

                return (
                  <Pressable
                    key={booking.id}
                    style={[
                      styles.bookingBlock,
                      { left, width, backgroundColor: bg },
                    ]}
                    onPress={() => onBlockPress?.(booking)}
                  >
                    <Text numberOfLines={1} style={styles.bookingText}>
                      {booking.customer?.name ?? 'Guest'}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          </View>
        );
      })}
    </View>
  );
}

function formatHour(h: number): string {
  if (h === 0) return '12a';
  if (h === 12) return '12p';
  if (h < 12) return `${h}a`;
  return `${h - 12}p`;
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: AppColors.white,
  },
  hourHeader: {
    flexDirection: 'row',
    borderBottomWidth: 1,
    borderBottomColor: AppColors.border,
    backgroundColor: AppColors.lightGrey,
  },
  roomHeader: {
    padding: 10,
    borderRightWidth: 1,
    borderRightColor: AppColors.border,
    justifyContent: 'center',
  },
  headerText: {
    fontSize: 11,
    fontWeight: '700',
    color: AppColors.grey,
    textTransform: 'uppercase',
  },
  hoursRow: {
    flexDirection: 'row',
  },
  hourCell: {
    paddingVertical: 10,
    alignItems: 'center',
    borderRightWidth: 1,
    borderRightColor: AppColors.border,
  },
  hourText: {
    fontSize: 11,
    color: AppColors.grey,
    fontWeight: '600',
  },
  row: {
    flexDirection: 'row',
    height: ROW_HEIGHT,
    borderBottomWidth: 1,
    borderBottomColor: AppColors.border,
  },
  roomLabel: {
    padding: 10,
    justifyContent: 'center',
    borderRightWidth: 1,
    borderRightColor: AppColors.border,
    backgroundColor: AppColors.lightGrey,
  },
  roomNumber: {
    fontSize: 14,
    fontWeight: '700',
    color: AppColors.black,
  },
  roomType: {
    fontSize: 11,
    color: AppColors.grey,
    textTransform: 'capitalize',
    marginTop: 2,
  },
  track: {
    position: 'relative',
    height: ROW_HEIGHT,
  },
  trackSlot: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    borderRightWidth: 1,
    borderRightColor: AppColors.border,
  },
  bookingBlock: {
    position: 'absolute',
    top: 8,
    bottom: 8,
    borderRadius: 6,
    paddingHorizontal: 6,
    justifyContent: 'center',
    overflow: 'hidden',
  },
  bookingText: {
    color: AppColors.white,
    fontSize: 11,
    fontWeight: '700',
  },
});
