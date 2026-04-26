import React, { useState, useMemo, useRef, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  RefreshControl,
  Pressable,
  useWindowDimensions,
  Modal,
  Animated,
  TextInput,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { AppColors } from '@/constants/theme';
import { useAuth } from '@/hooks/use-auth';
import { useRooms } from '@/hooks/use-rooms';
import { RoomCard } from '@/components/room-card';
import { StatCard } from '@/components/stat-card';
import { LoadingOverlay } from '@/components/loading-overlay';
import { FilterDrawer, FilterOption } from '@/components/filter-drawer';
import type { RoomType, RoomStatus } from '@/lib/types';

type RoomTypeFilter = RoomType | 'all';
type RoomStatusFilter = RoomStatus | 'all';

const ROOM_TYPES: FilterOption<RoomTypeFilter>[] = [
  { key: 'all', label: 'All Types' },
  { key: 'single', label: 'Single' },
  { key: 'double', label: 'Double' },
  { key: 'suite', label: 'Suite' },
  { key: 'deluxe', label: 'Deluxe' },
];

const ROOM_STATUSES: FilterOption<RoomStatusFilter>[] = [
  { key: 'all', label: 'All Status' },
  { key: 'available', label: 'Available', color: AppColors.roomAvailable },
  { key: 'occupied', label: 'Occupied', color: AppColors.roomOccupied },
  { key: 'maintenance', label: 'Maintenance', color: AppColors.roomMaintenance },
];

function HeaderMenu({ showManageRooms, onManageRooms, onProfile, onLogout }: {
  showManageRooms: boolean;
  onManageRooms: () => void;
  onProfile: () => void;
  onLogout: () => void;
}) {
  const [visible, setVisible] = useState(false);
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const scaleAnim = useRef(new Animated.Value(0.9)).current;

  useEffect(() => {
    if (visible) {
      Animated.parallel([
        Animated.timing(fadeAnim, { toValue: 1, duration: 150, useNativeDriver: true }),
        Animated.spring(scaleAnim, { toValue: 1, friction: 8, useNativeDriver: true }),
      ]).start();
    } else {
      fadeAnim.setValue(0);
      scaleAnim.setValue(0.9);
    }
  }, [visible, fadeAnim, scaleAnim]);

  const handleAction = (action: () => void) => {
    setVisible(false);
    setTimeout(action, 100);
  };

  return (
    <View>
      <Pressable
        style={styles.menuTrigger}
        onPress={() => setVisible(true)}
        hitSlop={8}
      >
        <View style={styles.dotRow}>
          <View style={styles.dot} />
          <View style={styles.dot} />
          <View style={styles.dot} />
        </View>
      </Pressable>

      <Modal
        visible={visible}
        transparent
        animationType="none"
        onRequestClose={() => setVisible(false)}
      >
        <Pressable style={styles.menuOverlay} onPress={() => setVisible(false)}>
          <Animated.View
            style={[
              styles.menuDropdown,
              { opacity: fadeAnim, transform: [{ scale: scaleAnim }] },
            ]}
          >
            {showManageRooms && (
              <Pressable
                style={styles.menuItem}
                onPress={() => handleAction(onManageRooms)}
              >
                <Text style={styles.menuIcon}>🏨</Text>
                <Text style={styles.menuItemText}>Manage Rooms</Text>
              </Pressable>
            )}
            <Pressable
              style={styles.menuItem}
              onPress={() => handleAction(onProfile)}
            >
              <Text style={styles.menuIcon}>👤</Text>
              <Text style={styles.menuItemText}>Profile & Logs</Text>
            </Pressable>
            <Pressable
              style={[styles.menuItem, styles.menuItemLast]}
              onPress={() => handleAction(onLogout)}
            >
              <Text style={styles.menuIcon}>🚪</Text>
              <Text style={[styles.menuItemText, { color: AppColors.danger }]}>Logout</Text>
            </Pressable>
          </Animated.View>
        </Pressable>
      </Modal>
    </View>
  );
}

export default function DashboardScreen() {
  const { profile, session, signOut, isOwner } = useAuth();
  const { rooms, loading, refresh, stats } = useRooms();
  const { width } = useWindowDimensions();
  const router = useRouter();

  const [searchQuery, setSearchQuery] = useState('');
  const [typeFilter, setTypeFilter] = useState<RoomTypeFilter>('all');
  const [statusFilter, setStatusFilter] = useState<RoomStatusFilter>('all');
  const [typeDrawerOpen, setTypeDrawerOpen] = useState(false);
  const [statusDrawerOpen, setStatusDrawerOpen] = useState(false);

  const numColumns = width > 600 ? 3 : 2;

  const selectedTypeOption = ROOM_TYPES.find((t) => t.key === typeFilter) ?? ROOM_TYPES[0];
  const selectedStatusOption =
    ROOM_STATUSES.find((s) => s.key === statusFilter) ?? ROOM_STATUSES[0];

  const filteredRooms = useMemo(() => {
    return rooms.filter(room => {
      const matchesSearch = searchQuery === '' ||
        room.room_number.toLowerCase().includes(searchQuery.toLowerCase());
      const matchesType = typeFilter === 'all' || room.type === typeFilter;
      const matchesStatus = statusFilter === 'all' || room.status === statusFilter;
      return matchesSearch && matchesType && matchesStatus;
    });
  }, [rooms, searchQuery, typeFilter, statusFilter]);

  const hasActiveFilters = searchQuery !== '' || typeFilter !== 'all' || statusFilter !== 'all';

  const clearFilters = () => {
    setSearchQuery('');
    setTypeFilter('all');
    setStatusFilter('all');
  };

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          <Text style={styles.greeting}>
            Welcome, {profile?.name || session?.user?.email?.split('@')[0] || 'User'}
          </Text>
          <Text style={styles.subtitle}>Dashboard</Text>
        </View>
        <HeaderMenu
          showManageRooms={isOwner}
          onManageRooms={() => router.push('/room-management')}
          onProfile={() => router.push('/profile')}
          onLogout={signOut}
        />
      </View>

      <FlatList
        data={filteredRooms}
        keyExtractor={(item) => item.id}
        numColumns={numColumns}
        key={numColumns}
        contentContainerStyle={styles.list}
        columnWrapperStyle={styles.row}
        refreshControl={
          <RefreshControl refreshing={loading} onRefresh={refresh} colors={[AppColors.primary]} />
        }
        ListHeaderComponent={
          <View>
            <View style={styles.statsRow}>
              <StatCard label="Total" value={stats.total} color={AppColors.primary} />
              <StatCard label="Available" value={stats.available} color={AppColors.roomAvailable} />
              <StatCard label="Occupied" value={stats.occupied} color={AppColors.roomOccupied} />
              <StatCard label="Maintenance" value={stats.maintenance} color={AppColors.roomMaintenance} />
            </View>

            <View style={styles.searchContainer}>
              <Text style={styles.searchIcon}>🔍</Text>
              <TextInput
                style={styles.searchInput}
                placeholder="Search by room number..."
                placeholderTextColor={AppColors.grey}
                value={searchQuery}
                onChangeText={setSearchQuery}
                returnKeyType="search"
              />
              {searchQuery !== '' && (
                <Pressable onPress={() => setSearchQuery('')} style={styles.searchClear} hitSlop={8}>
                  <Text style={styles.searchClearText}>✕</Text>
                </Pressable>
              )}
            </View>

            <View style={styles.filterButtonsRow}>
              <Pressable
                style={[
                  styles.filterButton,
                  typeFilter !== 'all' && styles.filterButtonActive,
                ]}
                onPress={() => setTypeDrawerOpen(true)}
              >
                <Text style={styles.filterButtonLabel}>Type</Text>
                <View style={styles.filterButtonValueRow}>
                  <Text
                    style={[
                      styles.filterButtonValue,
                      typeFilter !== 'all' && styles.filterButtonValueActive,
                    ]}
                    numberOfLines={1}
                  >
                    {selectedTypeOption.label}
                  </Text>
                  <Text style={styles.filterButtonChevron}>▾</Text>
                </View>
              </Pressable>

              <Pressable
                style={[
                  styles.filterButton,
                  statusFilter !== 'all' && styles.filterButtonActive,
                ]}
                onPress={() => setStatusDrawerOpen(true)}
              >
                <Text style={styles.filterButtonLabel}>Status</Text>
                <View style={styles.filterButtonValueRow}>
                  {selectedStatusOption.color && (
                    <View
                      style={[
                        styles.filterButtonDot,
                        { backgroundColor: selectedStatusOption.color },
                      ]}
                    />
                  )}
                  <Text
                    style={[
                      styles.filterButtonValue,
                      statusFilter !== 'all' && styles.filterButtonValueActive,
                    ]}
                    numberOfLines={1}
                  >
                    {selectedStatusOption.label}
                  </Text>
                  <Text style={styles.filterButtonChevron}>▾</Text>
                </View>
              </Pressable>
            </View>

            {hasActiveFilters && (
              <View style={styles.filterInfo}>
                <Text style={styles.filterInfoText}>
                  {filteredRooms.length} room{filteredRooms.length !== 1 ? 's' : ''} found
                </Text>
                <Pressable onPress={clearFilters} hitSlop={8}>
                  <Text style={styles.clearFiltersText}>Clear filters</Text>
                </Pressable>
              </View>
            )}
          </View>
        }
        renderItem={({ item }) => (
          <View style={{ flex: 1, maxWidth: `${100 / numColumns}%`, padding: 6 }}>
            <RoomCard room={item} />
          </View>
        )}
        ListEmptyComponent={
          !loading ? (
            <View style={styles.empty}>
              <Text style={styles.emptyText}>
                {hasActiveFilters ? 'No rooms match your filters' : 'No rooms found'}
              </Text>
              <Text style={styles.emptySubtext}>
                {hasActiveFilters
                  ? 'Try adjusting your search or filters'
                  : 'Rooms will appear here once added to the database'}
              </Text>
              {hasActiveFilters && (
                <Pressable style={styles.emptyButton} onPress={clearFilters}>
                  <Text style={styles.emptyButtonText}>Clear filters</Text>
                </Pressable>
              )}
            </View>
          ) : null
        }
      />

      <FilterDrawer<RoomTypeFilter>
        visible={typeDrawerOpen}
        title="Filter by Type"
        options={ROOM_TYPES}
        selected={typeFilter}
        onSelect={setTypeFilter}
        onClose={() => setTypeDrawerOpen(false)}
      />

      <FilterDrawer<RoomStatusFilter>
        visible={statusDrawerOpen}
        title="Filter by Status"
        options={ROOM_STATUSES}
        selected={statusFilter}
        onSelect={setStatusFilter}
        onClose={() => setStatusDrawerOpen(false)}
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
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 16,
    backgroundColor: AppColors.white,
    borderBottomWidth: 1,
    borderBottomColor: AppColors.border,
  },
  headerLeft: {
    flex: 1,
    marginRight: 12,
  },
  greeting: {
    fontSize: 20,
    fontWeight: '700',
    color: AppColors.black,
  },
  subtitle: {
    fontSize: 13,
    color: AppColors.grey,
    marginTop: 2,
    fontWeight: '500',
  },
  menuTrigger: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: AppColors.lightGrey,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dotRow: {
    alignItems: 'center',
    justifyContent: 'center',
    gap: 3,
  },
  dot: {
    width: 4,
    height: 4,
    borderRadius: 2,
    backgroundColor: AppColors.grey,
  },
  menuOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.25)',
    justifyContent: 'flex-start',
    alignItems: 'flex-end',
    paddingTop: 90,
    paddingRight: 16,
  },
  menuDropdown: {
    backgroundColor: AppColors.white,
    borderRadius: 14,
    minWidth: 200,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.15,
    shadowRadius: 20,
    elevation: 10,
    overflow: 'hidden',
  },
  menuItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 18,
    paddingVertical: 14,
    gap: 12,
    borderBottomWidth: 1,
    borderBottomColor: AppColors.border,
  },
  menuItemLast: {
    borderBottomWidth: 0,
  },
  menuIcon: {
    fontSize: 18,
  },
  menuItemText: {
    fontSize: 15,
    fontWeight: '600',
    color: AppColors.black,
  },
  statsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    paddingHorizontal: 6,
    paddingBottom: 12,
  },
  list: {
    padding: 14,
  },
  row: {
    gap: 0,
  },

  searchContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: AppColors.white,
    borderRadius: 12,
    marginHorizontal: 6,
    marginBottom: 10,
    paddingHorizontal: 14,
    height: 46,
    borderWidth: 1,
    borderColor: AppColors.border,
  },
  searchIcon: {
    fontSize: 16,
    marginRight: 10,
  },
  searchInput: {
    flex: 1,
    fontSize: 15,
    color: AppColors.black,
    paddingVertical: 0,
  },
  searchClear: {
    marginLeft: 8,
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: AppColors.lightGrey,
    alignItems: 'center',
    justifyContent: 'center',
  },
  searchClearText: {
    fontSize: 13,
    color: AppColors.grey,
    fontWeight: '700',
  },

  filterButtonsRow: {
    flexDirection: 'row',
    gap: 10,
    paddingHorizontal: 6,
    paddingBottom: 12,
  },
  filterButton: {
    flex: 1,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 12,
    backgroundColor: AppColors.white,
    borderWidth: 1.5,
    borderColor: AppColors.border,
  },
  filterButtonActive: {
    borderColor: AppColors.primary,
  },
  filterButtonLabel: {
    fontSize: 11,
    fontWeight: '600',
    color: AppColors.grey,
    textTransform: 'uppercase',
    letterSpacing: 0.4,
    marginBottom: 4,
  },
  filterButtonValueRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  filterButtonDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  filterButtonValue: {
    flex: 1,
    fontSize: 14,
    fontWeight: '700',
    color: AppColors.black,
  },
  filterButtonValueActive: {
    color: AppColors.primary,
  },
  filterButtonChevron: {
    fontSize: 12,
    color: AppColors.grey,
    fontWeight: '700',
  },

  filterInfo: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 6,
    paddingBottom: 8,
  },
  filterInfoText: {
    fontSize: 13,
    color: AppColors.grey,
    fontWeight: '500',
  },
  clearFiltersText: {
    fontSize: 13,
    color: AppColors.primary,
    fontWeight: '600',
  },

  empty: {
    alignItems: 'center',
    paddingVertical: 60,
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
  emptyButton: {
    marginTop: 16,
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 10,
    backgroundColor: AppColors.primary,
  },
  emptyButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: AppColors.white,
  },
});
