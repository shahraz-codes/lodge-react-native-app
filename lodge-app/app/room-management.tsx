import React, { useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  RefreshControl,
  Pressable,
  Alert,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { AppColors } from '@/constants/theme';
import { useAuth } from '@/hooks/use-auth';
import { useRooms } from '@/hooks/use-rooms';
import { addRoom, updateRoom, deleteRoom } from '@/services/rooms';
import { RoomForm } from '@/components/room-form';
import { LoadingOverlay } from '@/components/loading-overlay';
import type { Room, RoomType, RoomStatus } from '@/lib/types';

const STATUS_CONFIG: Record<RoomStatus, { color: string; label: string }> = {
  available: { color: AppColors.roomAvailable, label: 'Available' },
  occupied: { color: AppColors.roomOccupied, label: 'Occupied' },
  cleaning: { color: AppColors.roomCleaning, label: 'Cleaning' },
};

export default function RoomManagementScreen() {
  const router = useRouter();
  const { isOwner } = useAuth();
  const { rooms, loading, refresh } = useRooms();

  const [formVisible, setFormVisible] = useState(false);
  const [editingRoom, setEditingRoom] = useState<Room | null>(null);
  const [deleting, setDeleting] = useState<string | null>(null);

  const openAddForm = useCallback(() => {
    setEditingRoom(null);
    setFormVisible(true);
  }, []);

  const openEditForm = useCallback((room: Room) => {
    setEditingRoom(room);
    setFormVisible(true);
  }, []);

  const closeForm = useCallback(() => {
    setFormVisible(false);
    setEditingRoom(null);
  }, []);

  const handleSubmit = useCallback(
    async (data: {
      room_number: string;
      type: RoomType;
      price: number;
      half_day_price: number | null;
      hourly_price: number | null;
      status: RoomStatus;
    }) => {
      try {
        if (editingRoom) {
          await updateRoom(editingRoom.id, data);
          Alert.alert('Success', 'Room updated successfully');
        } else {
          await addRoom(data);
          Alert.alert('Success', 'Room added successfully');
        }
        closeForm();
        refresh();
      } catch (e: any) {
        Alert.alert('Error', e.message ?? 'Something went wrong');
      }
    },
    [editingRoom, closeForm, refresh]
  );

  const handleDelete = useCallback(
    (room: Room) => {
      Alert.alert(
        'Delete Room',
        `Are you sure you want to delete room #${room.room_number}?`,
        [
          { text: 'Cancel', style: 'cancel' },
          {
            text: 'Delete',
            style: 'destructive',
            onPress: async () => {
              setDeleting(room.id);
              try {
                await deleteRoom(room.id);
                refresh();
              } catch (e: any) {
                Alert.alert('Error', e.message ?? 'Failed to delete room');
              } finally {
                setDeleting(null);
              }
            },
          },
        ]
      );
    },
    [refresh]
  );

  const renderRoom = ({ item }: { item: Room }) => {
    const config = STATUS_CONFIG[item.status];
    const isItemDeleting = deleting === item.id;
    const halfDay = item.half_day_price ?? Math.round(item.price * 0.6);
    const hourly = item.hourly_price ?? Math.round(item.price / 24);

    return (
      <View style={[styles.card, { borderLeftColor: config.color }]}>
        <View style={styles.cardTop}>
          <View style={styles.cardInfo}>
            <Text style={styles.roomNumber}>#{item.room_number}</Text>
            <View style={[styles.badge, { backgroundColor: config.color }]}>
              <Text style={styles.badgeText}>{config.label}</Text>
            </View>
          </View>
          <View style={styles.cardDetails}>
            <Text style={styles.type}>
              {item.type.charAt(0).toUpperCase() + item.type.slice(1)}
            </Text>
            <Text style={styles.price}>₹{item.price}/night</Text>
          </View>
          <Text style={styles.priceSub}>₹{halfDay}/12hrs · ₹{hourly}/hr</Text>
        </View>

        <View style={styles.cardActions}>
          <Pressable
            style={({ pressed }) => [
              styles.actionBtn,
              styles.editBtn,
              pressed && { opacity: 0.7 },
            ]}
            onPress={() => openEditForm(item)}
          >
            <Text style={styles.editBtnText}>Edit</Text>
          </Pressable>

          {isOwner && (
            <Pressable
              style={({ pressed }) => [
                styles.actionBtn,
                styles.deleteBtn,
                pressed && { opacity: 0.7 },
                isItemDeleting && { opacity: 0.5 },
              ]}
              onPress={() => handleDelete(item)}
              disabled={isItemDeleting}
            >
              {isItemDeleting ? (
                <ActivityIndicator size="small" color={AppColors.white} />
              ) : (
                <Text style={styles.deleteBtnText}>Delete</Text>
              )}
            </Pressable>
          )}
        </View>
      </View>
    );
  };

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      {/* Header */}
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} hitSlop={12}>
          <Text style={styles.backArrow}>←</Text>
        </Pressable>
        <Text style={styles.headerTitle}>Room Management</Text>
        <View style={{ width: 32 }} />
      </View>

      {/* Add Room Button */}
      <View style={styles.addRow}>
        <Text style={styles.countText}>{rooms.length} room(s)</Text>
        {isOwner && (
          <Pressable
            style={({ pressed }) => [
              styles.addBtn,
              pressed && { opacity: 0.85 },
            ]}
            onPress={openAddForm}
          >
            <Text style={styles.addBtnText}>+ Add Room</Text>
          </Pressable>
        )}
      </View>

      {/* Room List */}
      <FlatList
        data={rooms}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.list}
        refreshControl={
          <RefreshControl
            refreshing={loading}
            onRefresh={refresh}
            colors={[AppColors.primary]}
          />
        }
        renderItem={renderRoom}
        ListEmptyComponent={
          !loading ? (
            <View style={styles.empty}>
              <Text style={styles.emptyIcon}>🏨</Text>
              <Text style={styles.emptyText}>No rooms yet</Text>
              <Text style={styles.emptySubtext}>
                Tap "Add Room" to create your first room
              </Text>
            </View>
          ) : null
        }
      />

      {/* Form Modal */}
      <RoomForm
        visible={formVisible}
        room={editingRoom}
        onClose={closeForm}
        onSubmit={handleSubmit}
      />

      <LoadingOverlay visible={loading && rooms.length === 0} />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: AppColors.lightGrey,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 16,
    backgroundColor: AppColors.white,
    borderBottomWidth: 1,
    borderBottomColor: AppColors.border,
  },
  backArrow: {
    fontSize: 24,
    color: AppColors.primary,
    fontWeight: '700',
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: AppColors.black,
  },
  addRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 14,
  },
  countText: {
    fontSize: 14,
    fontWeight: '500',
    color: AppColors.grey,
  },
  addBtn: {
    backgroundColor: AppColors.primary,
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 10,
  },
  addBtnText: {
    color: AppColors.white,
    fontSize: 15,
    fontWeight: '700',
  },
  list: {
    paddingHorizontal: 16,
    paddingBottom: 24,
  },
  card: {
    backgroundColor: AppColors.white,
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    borderLeftWidth: 4,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.08,
    shadowRadius: 4,
    elevation: 2,
  },
  cardTop: {
    marginBottom: 12,
  },
  cardInfo: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  roomNumber: {
    fontSize: 20,
    fontWeight: '700',
    color: AppColors.black,
  },
  badge: {
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 12,
  },
  badgeText: {
    color: AppColors.white,
    fontSize: 11,
    fontWeight: '700',
    textTransform: 'uppercase',
  },
  cardDetails: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  type: {
    fontSize: 14,
    color: AppColors.grey,
  },
  price: {
    fontSize: 16,
    fontWeight: '600',
    color: AppColors.primary,
  },
  priceSub: {
    fontSize: 12,
    color: AppColors.grey,
    marginTop: 6,
    fontWeight: '500',
  },
  cardActions: {
    flexDirection: 'row',
    gap: 10,
    borderTopWidth: 1,
    borderTopColor: AppColors.border,
    paddingTop: 12,
  },
  actionBtn: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 8,
    alignItems: 'center',
  },
  editBtn: {
    backgroundColor: AppColors.primaryLight,
  },
  editBtnText: {
    color: AppColors.white,
    fontSize: 14,
    fontWeight: '600',
  },
  deleteBtn: {
    backgroundColor: AppColors.danger,
  },
  deleteBtnText: {
    color: AppColors.white,
    fontSize: 14,
    fontWeight: '600',
  },
  empty: {
    alignItems: 'center',
    paddingVertical: 80,
  },
  emptyIcon: {
    fontSize: 48,
    marginBottom: 12,
  },
  emptyText: {
    fontSize: 18,
    fontWeight: '600',
    color: AppColors.black,
    marginBottom: 6,
  },
  emptySubtext: {
    fontSize: 14,
    color: AppColors.grey,
    textAlign: 'center',
  },
});
