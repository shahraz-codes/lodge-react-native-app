import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  Pressable,
  Alert,
  Platform,
  Modal,
  TextInput,
  RefreshControl,
  ActivityIndicator,
  KeyboardAvoidingView,
  ScrollView,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { AppColors } from '@/constants/theme';
import { useAuth } from '@/hooks/use-auth';
import { LoadingOverlay } from '@/components/loading-overlay';
import { fetchUsers, createUser, deleteUser, type ManagedUser } from '@/services/users';
import type { UserRole } from '@/lib/types';

const ROLE_OPTIONS: { value: UserRole; label: string; description: string }[] = [
  {
    value: 'receptionist',
    label: 'Receptionist',
    description: 'Manages bookings, check-ins, and check-outs',
  },
  {
    value: 'owner',
    label: 'Owner',
    description: 'Full access including rooms and other staff',
  },
];

const ROLE_BADGE: Record<UserRole, { bg: string; label: string }> = {
  owner: { bg: AppColors.success, label: 'Owner' },
  receptionist: { bg: AppColors.info, label: 'Receptionist' },
};

function showAlert(title: string, message: string) {
  if (Platform.OS === 'web') {
    alert(`${title}: ${message}`);
  } else {
    Alert.alert(title, message);
  }
}

export default function UserManagementScreen() {
  const router = useRouter();
  const { isOwner, session } = useAuth();

  const [users, setUsers] = useState<ManagedUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<string | null>(null);

  const [formVisible, setFormVisible] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [role, setRole] = useState<UserRole>('receptionist');

  const load = useCallback(async () => {
    try {
      setError(null);
      const list = await fetchUsers();
      setUsers(list);
    } catch (e: any) {
      setError(e?.message ?? 'Failed to load users.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const handleRefresh = useCallback(() => {
    setRefreshing(true);
    load();
  }, [load]);

  const stats = useMemo(() => {
    const owners = users.filter((u) => u.role === 'owner').length;
    const receptionists = users.filter((u) => u.role === 'receptionist').length;
    return { total: users.length, owners, receptionists };
  }, [users]);

  const resetForm = () => {
    setName('');
    setEmail('');
    setPassword('');
    setConfirmPassword('');
    setRole('receptionist');
  };

  const closeForm = () => {
    if (submitting) return;
    setFormVisible(false);
    resetForm();
  };

  const validate = (): boolean => {
    if (!name.trim()) {
      showAlert('Validation', 'Please enter the user\u2019s full name.');
      return false;
    }
    const trimmedEmail = email.trim();
    if (!trimmedEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmedEmail)) {
      showAlert('Validation', 'Please enter a valid email address.');
      return false;
    }
    if (!password || password.length < 6) {
      showAlert('Validation', 'Password must be at least 6 characters.');
      return false;
    }
    if (password !== confirmPassword) {
      showAlert('Validation', 'The passwords don\u2019t match.');
      return false;
    }
    return true;
  };

  const handleCreate = useCallback(async () => {
    if (!validate()) return;
    setSubmitting(true);
    try {
      await createUser({
        email: email.trim(),
        password,
        name: name.trim(),
        role,
      });
      showAlert(
        'User Added',
        `${name.trim()} can now sign in as a ${role}. Make sure to share their password securely.`,
      );
      setFormVisible(false);
      resetForm();
      await load();
    } catch (e: any) {
      showAlert('Could not add user', e?.message ?? 'Something went wrong.');
    } finally {
      setSubmitting(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [name, email, password, confirmPassword, role, load]);

  const handleDelete = useCallback(
    (user: ManagedUser) => {
      if (user.id === session?.user?.id) {
        showAlert('Not allowed', 'You can\u2019t delete your own account.');
        return;
      }
      const confirmText = `Remove ${user.name || user.email || 'this user'} from staff?`;
      const proceed = async () => {
        setDeleting(user.id);
        try {
          await deleteUser(user.id);
          await load();
        } catch (e: any) {
          showAlert('Delete failed', e?.message ?? 'Could not remove user.');
        } finally {
          setDeleting(null);
        }
      };
      if (Platform.OS === 'web') {
        if (confirm(confirmText)) proceed();
        return;
      }
      Alert.alert('Remove User', confirmText, [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Remove', style: 'destructive', onPress: proceed },
      ]);
    },
    [load, session?.user?.id],
  );

  const renderUser = ({ item }: { item: ManagedUser }) => {
    const badge = item.role ? ROLE_BADGE[item.role] : null;
    const isItemDeleting = deleting === item.id;
    const isSelf = item.id === session?.user?.id;
    const initial = (item.name || item.email || '?').charAt(0).toUpperCase();

    return (
      <View style={styles.userCard}>
        <View style={styles.userTop}>
          <View style={styles.avatar}>
            <Text style={styles.avatarText}>{initial}</Text>
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.userName}>
              {item.name?.trim() ? item.name : item.email || 'Unnamed user'}
              {isSelf ? ' (you)' : ''}
            </Text>
            {item.email && <Text style={styles.userEmail}>{item.email}</Text>}
            {!item.email && item.name && (
              <Text style={styles.userEmail}>ID #{item.id.slice(0, 8).toUpperCase()}</Text>
            )}
          </View>
          {badge ? (
            <View style={[styles.roleBadge, { backgroundColor: badge.bg }]}>
              <Text style={styles.roleBadgeText}>{badge.label}</Text>
            </View>
          ) : (
            <View style={[styles.roleBadge, { backgroundColor: AppColors.warning }]}>
              <Text style={styles.roleBadgeText}>No Role</Text>
            </View>
          )}
        </View>
        <View style={styles.userActions}>
          <Pressable
            style={({ pressed }) => [
              styles.removeBtn,
              pressed && { opacity: 0.85 },
              (isItemDeleting || isSelf) && styles.removeBtnDisabled,
            ]}
            onPress={() => handleDelete(item)}
            disabled={isItemDeleting || isSelf}
          >
            {isItemDeleting ? (
              <ActivityIndicator size="small" color={AppColors.danger} />
            ) : (
              <Text style={styles.removeBtnText}>
                {isSelf ? 'Cannot remove self' : 'Remove user'}
              </Text>
            )}
          </Pressable>
        </View>
      </View>
    );
  };

  if (!isOwner) {
    return (
      <SafeAreaView style={styles.container} edges={['top']}>
        <View style={styles.header}>
          <Pressable onPress={() => router.back()} hitSlop={12}>
            <Text style={styles.backArrow}>←</Text>
          </Pressable>
          <Text style={styles.headerTitle}>User Management</Text>
          <View style={{ width: 32 }} />
        </View>
        <View style={styles.deniedBox}>
          <Text style={styles.deniedTitle}>Owners only</Text>
          <Text style={styles.deniedMessage}>
            Only owners can manage staff accounts. Ask an owner to add or remove users on
            your behalf.
          </Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} hitSlop={12}>
          <Text style={styles.backArrow}>←</Text>
        </Pressable>
        <Text style={styles.headerTitle}>User Management</Text>
        <View style={{ width: 32 }} />
      </View>

      <View style={styles.statsRow}>
        <Stat label="Total" value={stats.total} color={AppColors.primary} />
        <Stat label="Owners" value={stats.owners} color={AppColors.success} />
        <Stat label="Receptionists" value={stats.receptionists} color={AppColors.info} />
      </View>

      <View style={styles.addRow}>
        <Text style={styles.countText}>
          {users.length === 1 ? '1 staff member' : `${users.length} staff members`}
        </Text>
        <Pressable
          style={({ pressed }) => [styles.addBtn, pressed && { opacity: 0.85 }]}
          onPress={() => setFormVisible(true)}
        >
          <Text style={styles.addBtnText}>+ Add User</Text>
        </Pressable>
      </View>

      {error && (
        <View style={styles.errorBox}>
          <Text style={styles.errorText}>{error}</Text>
          <Pressable style={styles.retryBtn} onPress={load}>
            <Text style={styles.retryBtnText}>Retry</Text>
          </Pressable>
        </View>
      )}

      <FlatList
        data={users}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.list}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={handleRefresh}
            colors={[AppColors.primary]}
          />
        }
        renderItem={renderUser}
        ListEmptyComponent={
          !loading ? (
            <View style={styles.empty}>
              <Text style={styles.emptyIcon}>👥</Text>
              <Text style={styles.emptyText}>No users yet</Text>
              <Text style={styles.emptySubtext}>
                Tap "+ Add User" to invite your first receptionist
              </Text>
            </View>
          ) : null
        }
      />

      <Modal
        visible={formVisible}
        animationType="slide"
        transparent
        onRequestClose={closeForm}
      >
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          style={styles.modalRoot}
        >
          <Pressable style={styles.modalBackdrop} onPress={closeForm} />
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Add User</Text>
              <Pressable onPress={closeForm} hitSlop={8}>
                <Text style={styles.modalClose}>Cancel</Text>
              </Pressable>
            </View>

            <ScrollView
              contentContainerStyle={styles.modalScroll}
              keyboardShouldPersistTaps="handled"
            >
              <View style={styles.inputGroup}>
                <Text style={styles.label}>Full Name</Text>
                <TextInput
                  style={styles.input}
                  placeholder="e.g. Priya Sharma"
                  placeholderTextColor={AppColors.grey}
                  value={name}
                  onChangeText={setName}
                  autoCapitalize="words"
                />
              </View>

              <View style={styles.inputGroup}>
                <Text style={styles.label}>Email</Text>
                <TextInput
                  style={styles.input}
                  placeholder="staff@example.com"
                  placeholderTextColor={AppColors.grey}
                  value={email}
                  onChangeText={setEmail}
                  autoCapitalize="none"
                  keyboardType="email-address"
                  autoCorrect={false}
                />
              </View>

              <View style={styles.inputGroup}>
                <Text style={styles.label}>Temporary Password</Text>
                <TextInput
                  style={styles.input}
                  placeholder="Minimum 6 characters"
                  placeholderTextColor={AppColors.grey}
                  value={password}
                  onChangeText={setPassword}
                  secureTextEntry
                />
              </View>

              <View style={styles.inputGroup}>
                <Text style={styles.label}>Confirm Password</Text>
                <TextInput
                  style={styles.input}
                  placeholder="Re-enter the password"
                  placeholderTextColor={AppColors.grey}
                  value={confirmPassword}
                  onChangeText={setConfirmPassword}
                  secureTextEntry
                />
              </View>

              <View style={styles.inputGroup}>
                <Text style={styles.label}>Role</Text>
                <View style={styles.roleOptions}>
                  {ROLE_OPTIONS.map((option) => {
                    const selected = role === option.value;
                    return (
                      <Pressable
                        key={option.value}
                        style={[
                          styles.roleOption,
                          selected && styles.roleOptionSelected,
                        ]}
                        onPress={() => setRole(option.value)}
                      >
                        <View style={styles.roleOptionTop}>
                          <View
                            style={[styles.radio, selected && styles.radioSelected]}
                          >
                            {selected && <View style={styles.radioDot} />}
                          </View>
                          <Text style={styles.roleOptionLabel}>{option.label}</Text>
                        </View>
                        <Text style={styles.roleOptionDescription}>
                          {option.description}
                        </Text>
                      </Pressable>
                    );
                  })}
                </View>
              </View>

              <View style={styles.helperBox}>
                <Text style={styles.helperBoxText}>
                  The new user will receive their login over the channel you choose
                  (verbally, message, etc.). They can sign in using the email and password
                  you set above.
                </Text>
              </View>

              <Pressable
                style={({ pressed }) => [
                  styles.submitBtn,
                  pressed && { opacity: 0.85 },
                  submitting && { opacity: 0.6 },
                ]}
                onPress={handleCreate}
                disabled={submitting}
              >
                {submitting ? (
                  <ActivityIndicator color={AppColors.white} />
                ) : (
                  <Text style={styles.submitBtnText}>Create User</Text>
                )}
              </Pressable>
            </ScrollView>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      <LoadingOverlay visible={loading && users.length === 0} message="Loading users..." />
    </SafeAreaView>
  );
}

function Stat({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <View style={[styles.statCard, { borderColor: color }]}>
      <Text style={[styles.statValue, { color }]}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
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
  statsRow: {
    flexDirection: 'row',
    gap: 10,
    paddingHorizontal: 16,
    paddingTop: 14,
  },
  statCard: {
    flex: 1,
    backgroundColor: AppColors.white,
    borderRadius: 12,
    paddingVertical: 12,
    alignItems: 'center',
    borderWidth: 1.5,
  },
  statValue: {
    fontSize: 22,
    fontWeight: '800',
  },
  statLabel: {
    fontSize: 11,
    color: AppColors.grey,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.4,
    marginTop: 2,
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
    paddingHorizontal: 18,
    paddingVertical: 10,
    borderRadius: 10,
  },
  addBtnText: {
    color: AppColors.white,
    fontSize: 15,
    fontWeight: '700',
  },
  errorBox: {
    marginHorizontal: 16,
    marginBottom: 6,
    backgroundColor: '#fef2f2',
    borderColor: '#fecaca',
    borderWidth: 1,
    borderRadius: 12,
    padding: 14,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  errorText: {
    flex: 1,
    color: AppColors.danger,
    fontSize: 13,
    fontWeight: '600',
  },
  retryBtn: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    backgroundColor: AppColors.danger,
    borderRadius: 8,
  },
  retryBtnText: {
    color: AppColors.white,
    fontSize: 12,
    fontWeight: '700',
  },
  list: {
    paddingHorizontal: 16,
    paddingBottom: 24,
  },
  userCard: {
    backgroundColor: AppColors.white,
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: AppColors.border,
  },
  userTop: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  avatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: AppColors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: {
    color: AppColors.white,
    fontSize: 18,
    fontWeight: '800',
  },
  userName: {
    fontSize: 15,
    fontWeight: '700',
    color: AppColors.black,
  },
  userEmail: {
    fontSize: 12,
    color: AppColors.grey,
    marginTop: 2,
  },
  roleBadge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 10,
  },
  roleBadgeText: {
    color: AppColors.white,
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 0.4,
    textTransform: 'uppercase',
  },
  userActions: {
    marginTop: 14,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: AppColors.border,
  },
  removeBtn: {
    paddingVertical: 10,
    borderRadius: 10,
    alignItems: 'center',
    backgroundColor: '#fef2f2',
    borderWidth: 1.5,
    borderColor: '#fecaca',
  },
  removeBtnDisabled: {
    opacity: 0.5,
  },
  removeBtnText: {
    color: AppColors.danger,
    fontSize: 13,
    fontWeight: '700',
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
  modalRoot: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  modalBackdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.4)',
  },
  modalContent: {
    backgroundColor: AppColors.white,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    maxHeight: '90%',
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: AppColors.border,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: AppColors.black,
  },
  modalClose: {
    fontSize: 15,
    fontWeight: '700',
    color: AppColors.primary,
  },
  modalScroll: {
    padding: 20,
    paddingBottom: 40,
  },
  inputGroup: {
    marginBottom: 16,
  },
  label: {
    fontSize: 13,
    fontWeight: '700',
    color: AppColors.black,
    marginBottom: 8,
    textTransform: 'uppercase',
    letterSpacing: 0.4,
  },
  input: {
    backgroundColor: AppColors.lightGrey,
    borderRadius: 12,
    padding: 14,
    fontSize: 15,
    color: AppColors.black,
    borderWidth: 1,
    borderColor: AppColors.border,
  },
  roleOptions: {
    gap: 10,
  },
  roleOption: {
    backgroundColor: AppColors.lightGrey,
    borderRadius: 12,
    padding: 14,
    borderWidth: 1.5,
    borderColor: AppColors.border,
  },
  roleOptionSelected: {
    backgroundColor: '#eef2ff',
    borderColor: AppColors.primary,
  },
  roleOptionTop: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 4,
  },
  radio: {
    width: 18,
    height: 18,
    borderRadius: 9,
    borderWidth: 2,
    borderColor: AppColors.grey,
    alignItems: 'center',
    justifyContent: 'center',
  },
  radioSelected: {
    borderColor: AppColors.primary,
  },
  radioDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: AppColors.primary,
  },
  roleOptionLabel: {
    fontSize: 15,
    fontWeight: '700',
    color: AppColors.black,
  },
  roleOptionDescription: {
    fontSize: 12,
    color: AppColors.grey,
    marginLeft: 28,
  },
  helperBox: {
    backgroundColor: '#fff7ed',
    borderColor: '#fed7aa',
    borderWidth: 1,
    borderRadius: 10,
    padding: 12,
    marginBottom: 16,
  },
  helperBoxText: {
    fontSize: 12,
    color: '#92400e',
    lineHeight: 17,
  },
  submitBtn: {
    backgroundColor: AppColors.primary,
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: 'center',
  },
  submitBtnText: {
    color: AppColors.white,
    fontSize: 16,
    fontWeight: '800',
  },
  deniedBox: {
    margin: 20,
    padding: 20,
    backgroundColor: AppColors.white,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: AppColors.border,
  },
  deniedTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: AppColors.warning,
    marginBottom: 8,
  },
  deniedMessage: {
    fontSize: 14,
    color: AppColors.black,
    lineHeight: 20,
  },
});
