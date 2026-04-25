import React from 'react';
import { View, Text, StyleSheet, Pressable } from 'react-native';
import { AppColors } from '@/constants/theme';
import type { Room, RoomStatus } from '@/lib/types';

const STATUS_CONFIG: Record<RoomStatus, { color: string; label: string }> = {
  available: { color: AppColors.roomAvailable, label: 'Available' },
  occupied: { color: AppColors.roomOccupied, label: 'Occupied' },
  maintenance: { color: AppColors.roomMaintenance, label: 'Maintenance' },
};

interface Props {
  room: Room;
  onPress?: (room: Room) => void;
}

export function RoomCard({ room, onPress }: Props) {
  const config = STATUS_CONFIG[room.status];
  const halfDay = room.half_day_price ?? Math.round(room.price * 0.6);
  const hourly = room.hourly_price ?? Math.round(room.price / 24);

  return (
    <Pressable
      style={({ pressed }) => [
        styles.card,
        { borderLeftColor: config.color },
        pressed && styles.pressed,
      ]}
      onPress={() => onPress?.(room)}
    >
      <View style={styles.header}>
        <Text style={styles.roomNumber}>#{room.room_number}</Text>
        <View style={[styles.badge, { backgroundColor: config.color }]}>
          <Text style={styles.badgeText}>{config.label}</Text>
        </View>
      </View>
      <Text style={styles.type}>{room.type.charAt(0).toUpperCase() + room.type.slice(1)}</Text>
      <Text style={styles.price}>₹{room.price}/night</Text>
      <Text style={styles.priceSub}>₹{halfDay}/12hrs · ₹{hourly}/hr</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: AppColors.white,
    borderRadius: 12,
    padding: 16,
    borderLeftWidth: 4,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.08,
    shadowRadius: 4,
    elevation: 2,
  },
  pressed: {
    opacity: 0.7,
    transform: [{ scale: 0.98 }],
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 10,
    marginBottom: 10,
  },
  roomNumber: {
    fontSize: 18,
    fontWeight: '700',
    color: AppColors.black,
    flexShrink: 1,
    marginRight: 6,
  },
  badge: {
    paddingHorizontal: 9,
    paddingVertical: 4,
    borderRadius: 12,
    flexShrink: 0,
  },
  badgeText: {
    color: AppColors.white,
    fontSize: 10,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.3,
  },
  type: {
    fontSize: 14,
    color: AppColors.grey,
    marginBottom: 4,
  },
  price: {
    fontSize: 15,
    fontWeight: '600',
    color: AppColors.primary,
  },
  priceSub: {
    fontSize: 11,
    color: AppColors.grey,
    marginTop: 2,
    fontWeight: '500',
  },
});
