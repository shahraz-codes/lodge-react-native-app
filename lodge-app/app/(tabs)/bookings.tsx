import React, { useState, useMemo, useCallback, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  RefreshControl,
  Pressable,
  Alert,
  Platform,
  TextInput,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { AppColors } from '@/constants/theme';
import { useBookings } from '@/hooks/use-bookings';
import { BookingCard } from '@/components/booking-card';
import { LoadingOverlay } from '@/components/loading-overlay';
import { CancelBookingModal } from '@/components/cancel-booking-modal';
import { ExtendBookingModal } from '@/components/extend-booking-modal';
import { FilterDrawer, FilterOption } from '@/components/filter-drawer';
import {
  cancelBooking,
  checkInBooking,
  checkOutBooking,
  extendBooking,
} from '@/services/bookings';
import type { Booking, BookingType } from '@/lib/types';

type StatusFilter = 'active' | 'cancelled' | 'all';
type TypeFilter = 'all' | BookingType;

const PAGE_SIZE = 10;

const STATUS_FILTERS: FilterOption<StatusFilter>[] = [
  { key: 'active', label: 'Active', color: AppColors.success },
  { key: 'all', label: 'All' },
  { key: 'cancelled', label: 'Cancelled', color: AppColors.danger },
];

const TYPE_FILTERS: FilterOption<TypeFilter>[] = [
  { key: 'all', label: 'All Types' },
  { key: 'full_day', label: 'Full Day' },
  { key: 'half_day', label: '12 Hours' },
  { key: 'hourly', label: 'Hourly' },
];

export default function BookingsScreen() {
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('active');
  const [typeFilter, setTypeFilter] = useState<TypeFilter>('all');
  const { bookings, loading, refresh } = useBookings(false);
  const [actionLoading, setActionLoading] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusDrawerOpen, setStatusDrawerOpen] = useState(false);
  const [typeDrawerOpen, setTypeDrawerOpen] = useState(false);
  const [page, setPage] = useState(1);
  const router = useRouter();

  const [cancelTarget, setCancelTarget] = useState<Booking | null>(null);
  const [extendTarget, setExtendTarget] = useState<Booking | null>(null);

  const selectedStatusOption =
    STATUS_FILTERS.find((s) => s.key === statusFilter) ?? STATUS_FILTERS[0];
  const selectedTypeOption =
    TYPE_FILTERS.find((t) => t.key === typeFilter) ?? TYPE_FILTERS[0];

  const filteredBookings = useMemo(() => {
    let list = bookings;

    if (statusFilter === 'active') {
      list = list.filter((b) => b.status === 'booked' || b.status === 'checked_in');
    } else if (statusFilter === 'cancelled') {
      list = list.filter((b) => b.status === 'cancelled');
    }

    if (typeFilter !== 'all') {
      list = list.filter((b) => b.booking_type === typeFilter);
    }

    if (searchQuery !== '') {
      const query = searchQuery.toLowerCase();
      list = list.filter((b) => b.room?.room_number?.toLowerCase().includes(query));
    }

    return list;
  }, [bookings, statusFilter, typeFilter, searchQuery]);

  useEffect(() => {
    setPage(1);
  }, [statusFilter, typeFilter, searchQuery]);

  const totalPages = Math.max(1, Math.ceil(filteredBookings.length / PAGE_SIZE));
  const currentPage = Math.min(page, totalPages);
  const visibleBookings = useMemo(
    () => filteredBookings.slice(0, currentPage * PAGE_SIZE),
    [filteredBookings, currentPage],
  );
  const hasMore = visibleBookings.length < filteredBookings.length;

  const handleLoadMore = useCallback(() => {
    if (hasMore) {
      setPage((p) => p + 1);
    }
  }, [hasMore]);

  const showError = useCallback((message: string) => {
    if (Platform.OS === 'web') {
      alert(message);
    } else {
      Alert.alert('Error', message);
    }
  }, []);

  const handleCheckIn = useCallback(
    async (booking: Booking) => {
      setActionLoading(true);
      try {
        await checkInBooking(booking.id);
        await refresh();
      } catch (err: any) {
        showError(err.message || 'Failed to check in.');
      } finally {
        setActionLoading(false);
      }
    },
    [refresh, showError],
  );

  const handleCheckOut = useCallback(
    async (booking: Booking) => {
      setActionLoading(true);
      try {
        await checkOutBooking(booking.id, booking.room_id);
        await refresh();
      } catch (err: any) {
        showError(err.message || 'Failed to check out.');
      } finally {
        setActionLoading(false);
      }
    },
    [refresh, showError],
  );

  const handleCancelConfirm = useCallback(
    async (booking: Booking, reason: string) => {
      setActionLoading(true);
      try {
        await cancelBooking(booking.id, booking.room_id, reason);
        await refresh();
      } catch (err: any) {
        showError(err.message || 'Failed to cancel booking.');
        throw err;
      } finally {
        setActionLoading(false);
      }
    },
    [refresh, showError],
  );

  const handleExtendConfirm = useCallback(
    async (
      booking: Booking,
      newCheckOut: Date,
      additionalAmount: number,
      newBookingType?: BookingType,
    ) => {
      setActionLoading(true);
      try {
        await extendBooking(
          booking.id,
          booking.room_id,
          booking.check_out,
          newCheckOut,
          additionalAmount,
          newBookingType,
        );
        await refresh();
      } catch (err: any) {
        showError(err.message || 'Failed to extend booking.');
        throw err;
      } finally {
        setActionLoading(false);
      }
    },
    [refresh, showError],
  );

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.header}>
        <Text style={styles.title}>Bookings</Text>
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
            statusFilter !== 'active' && styles.filterButtonActive,
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
                statusFilter !== 'active' && styles.filterButtonValueActive,
              ]}
              numberOfLines={1}
            >
              {selectedStatusOption.label}
            </Text>
            <Text style={styles.filterButtonChevron}>▾</Text>
          </View>
        </Pressable>

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
      </View>

      <FlatList
        data={visibleBookings}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.list}
        refreshControl={
          <RefreshControl refreshing={loading} onRefresh={refresh} colors={[AppColors.primary]} />
        }
        onEndReachedThreshold={0.4}
        onEndReached={handleLoadMore}
        renderItem={({ item }) => (
          <BookingCard
            booking={item}
            onPress={(b) =>
              router.push({
                pathname: '/booking-details',
                params: { bookingId: b.id },
              })
            }
            onCheckIn={handleCheckIn}
            onCheckOut={handleCheckOut}
            onCancel={setCancelTarget}
            onExtend={setExtendTarget}
          />
        )}
        ListFooterComponent={
          filteredBookings.length === 0 ? null : (
            <View style={styles.footer}>
              {hasMore ? (
                <Pressable style={styles.loadMoreBtn} onPress={handleLoadMore}>
                  <ActivityIndicator size="small" color={AppColors.primary} />
                  <Text style={styles.loadMoreText}>Load more</Text>
                </Pressable>
              ) : (
                <Text style={styles.footerEndText}>
                  {filteredBookings.length === 1
                    ? '1 booking'
                    : `Showing all ${filteredBookings.length} bookings`}
                </Text>
              )}
              <Text style={styles.pageInfoText}>
                Page {currentPage} of {totalPages}
              </Text>
            </View>
          )
        }
        ListEmptyComponent={
          !loading ? (
            <View style={styles.empty}>
              <Text style={styles.emptyText}>
                {searchQuery ? 'No bookings match your search' : 'No bookings found'}
              </Text>
              <Text style={styles.emptySubtext}>
                {searchQuery
                  ? `No bookings found for room "${searchQuery}"`
                  : statusFilter === 'active'
                    ? 'No active bookings at the moment'
                    : statusFilter === 'cancelled'
                      ? 'No cancelled bookings'
                      : 'No bookings have been made yet'}
              </Text>
              {searchQuery !== '' && (
                <Pressable style={styles.clearButton} onPress={() => setSearchQuery('')}>
                  <Text style={styles.clearButtonText}>Clear search</Text>
                </Pressable>
              )}
            </View>
          ) : null
        }
      />

      <Pressable
        style={({ pressed }) => [styles.fab, pressed && styles.fabPressed]}
        onPress={() => router.push('/add-booking')}
      >
        <Text style={styles.fabIcon}>+</Text>
        <Text style={styles.fabLabel}>New Booking</Text>
      </Pressable>

      <CancelBookingModal
        visible={cancelTarget !== null}
        booking={cancelTarget}
        onClose={() => setCancelTarget(null)}
        onConfirm={handleCancelConfirm}
      />

      <ExtendBookingModal
        visible={extendTarget !== null}
        booking={extendTarget}
        onClose={() => setExtendTarget(null)}
        onConfirm={handleExtendConfirm}
      />

      <FilterDrawer<StatusFilter>
        visible={statusDrawerOpen}
        title="Filter by Status"
        options={STATUS_FILTERS}
        selected={statusFilter}
        onSelect={setStatusFilter}
        onClose={() => setStatusDrawerOpen(false)}
      />

      <FilterDrawer<TypeFilter>
        visible={typeDrawerOpen}
        title="Filter by Type"
        options={TYPE_FILTERS}
        selected={typeFilter}
        onSelect={setTypeFilter}
        onClose={() => setTypeDrawerOpen(false)}
      />

      <LoadingOverlay visible={actionLoading} message="Processing..." />
    </SafeAreaView>
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
  searchContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: AppColors.white,
    borderRadius: 12,
    marginHorizontal: 16,
    marginTop: 12,
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
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 4,
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
  list: {
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 100,
  },
  footer: {
    paddingVertical: 16,
    alignItems: 'center',
    gap: 8,
  },
  loadMoreBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 18,
    paddingVertical: 10,
    backgroundColor: AppColors.white,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: AppColors.border,
  },
  loadMoreText: {
    fontSize: 14,
    fontWeight: '600',
    color: AppColors.primary,
  },
  footerEndText: {
    fontSize: 13,
    color: AppColors.grey,
    fontWeight: '500',
  },
  pageInfoText: {
    fontSize: 12,
    color: AppColors.grey,
    fontWeight: '500',
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
    paddingHorizontal: 20,
  },
  clearButton: {
    marginTop: 16,
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 10,
    backgroundColor: AppColors.primary,
  },
  clearButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: AppColors.white,
  },
  fab: {
    position: 'absolute',
    bottom: 24,
    right: 20,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: AppColors.primary,
    paddingVertical: 14,
    paddingHorizontal: 20,
    borderRadius: 28,
    gap: 8,
    shadowColor: AppColors.primary,
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.35,
    shadowRadius: 12,
    elevation: 8,
  },
  fabPressed: {
    opacity: 0.85,
    transform: [{ scale: 0.96 }],
  },
  fabIcon: {
    fontSize: 22,
    fontWeight: '700',
    color: AppColors.white,
    lineHeight: 24,
  },
  fabLabel: {
    fontSize: 15,
    fontWeight: '700',
    color: AppColors.white,
  },
});
