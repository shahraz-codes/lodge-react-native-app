import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  Modal,
  ScrollView,
  Alert,
  Platform,
  ActivityIndicator,
  TextInput,
} from 'react-native';
import * as Clipboard from 'expo-clipboard';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { AppColors } from '@/constants/theme';
import { useAuth } from '@/hooks/use-auth';
import { logger, type LogEntry, type LogLevel } from '@/services/logger';

const LEVEL_COLORS: Record<LogLevel, string> = {
  debug: AppColors.grey,
  info: AppColors.info,
  warn: AppColors.warning,
  error: AppColors.danger,
};

const LEVEL_FILTERS: { key: LogLevel | 'all'; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'info', label: 'Info' },
  { key: 'warn', label: 'Warn' },
  { key: 'error', label: 'Error' },
];

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

function formatTime(ts: number): string {
  return new Date(ts).toLocaleTimeString('en-IN', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  });
}

export default function ProfileScreen() {
  const router = useRouter();
  const { profile, session, role, isOwner, isReceptionist, profileError, refreshProfile, signOut } =
    useAuth();

  const [logsVisible, setLogsVisible] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [logEntries, setLogEntries] = useState<LogEntry[]>(() => logger.getMemoryEntries());
  const [filter, setFilter] = useState<LogLevel | 'all'>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [fileSize, setFileSize] = useState<number>(() => logger.getFileSize());

  useEffect(() => {
    logger.info('Profile', 'Screen mounted', { role, hasProfile: !!profile });
    const unsubscribe = logger.subscribe((entry) => {
      setLogEntries((prev) => {
        const next = prev.length >= 500 ? prev.slice(prev.length - 499) : prev.slice();
        next.push(entry);
        return next;
      });
    });
    const sizeTimer = setInterval(() => {
      setFileSize(logger.getFileSize());
    }, 3000);
    return () => {
      unsubscribe();
      clearInterval(sizeTimer);
    };
  }, [profile, role]);

  const visibleEntries = useMemo(() => {
    let list = logEntries;
    if (filter !== 'all') {
      list = list.filter((e) => e.level === filter);
    }
    if (searchQuery.trim()) {
      const q = searchQuery.trim().toLowerCase();
      list = list.filter(
        (e) =>
          e.tag.toLowerCase().includes(q) ||
          e.message.toLowerCase().includes(q) ||
          (e.data ? JSON.stringify(e.data).toLowerCase().includes(q) : false),
      );
    }
    return list.slice().reverse();
  }, [logEntries, filter, searchQuery]);

  const handleShareLogs = useCallback(async () => {
    setBusy('share');
    logger.info('Profile', 'User tapped share logs');
    try {
      await logger.share();
      logger.info('Profile', 'Share dialog opened');
    } catch (e: any) {
      const message = e?.message ?? 'Failed to share logs.';
      logger.error('Profile', 'Share failed', { error: message });
      if (Platform.OS === 'web') {
        alert(`Share failed: ${message}`);
      } else {
        Alert.alert('Share Failed', message);
      }
    } finally {
      setBusy(null);
      setFileSize(logger.getFileSize());
    }
  }, []);

  const handleClearLogs = useCallback(() => {
    const proceed = () => {
      logger.clear();
      setLogEntries(logger.getMemoryEntries());
      setFileSize(logger.getFileSize());
    };
    if (Platform.OS === 'web') {
      if (confirm('Clear all logs from this device?')) proceed();
      return;
    }
    Alert.alert(
      'Clear Logs',
      'Clear all locally stored logs? This cannot be undone.',
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Clear', style: 'destructive', onPress: proceed },
      ],
    );
  }, []);

  const handleCopyLogs = useCallback(async () => {
    setBusy('copy');
    try {
      const contents = await logger.getFileContents();
      await Clipboard.setStringAsync(contents);
      logger.info('Profile', 'Logs copied to clipboard', { bytes: contents.length });
      if (Platform.OS === 'web') {
        alert('Logs copied to clipboard.');
      } else {
        Alert.alert('Copied', 'Logs copied to clipboard.');
      }
    } catch (e: any) {
      logger.error('Profile', 'Copy logs failed', { error: e?.message ?? String(e) });
    } finally {
      setBusy(null);
    }
  }, []);

  const handleRefreshProfile = useCallback(async () => {
    setBusy('profile');
    try {
      await refreshProfile();
    } finally {
      setBusy(null);
    }
  }, [refreshProfile]);

  const handleSignOut = useCallback(() => {
    if (Platform.OS === 'web') {
      if (confirm('Sign out of Lodge Manager?')) signOut();
      return;
    }
    Alert.alert('Sign Out', 'Sign out of Lodge Manager?', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Sign Out', style: 'destructive', onPress: signOut },
    ]);
  }, [signOut]);

  const roleLabel = role
    ? role.charAt(0).toUpperCase() + role.slice(1)
    : profileError
      ? 'Unknown (profile failed to load)'
      : profile
        ? 'Role not set'
        : 'Loading…';

  const roleColor = isOwner
    ? AppColors.success
    : isReceptionist
      ? AppColors.info
      : AppColors.warning;

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.header}>
        <Text style={styles.title}>Profile</Text>
      </View>

      <ScrollView contentContainerStyle={styles.scroll}>
        <View style={styles.profileCard}>
          <View style={styles.avatar}>
            <Text style={styles.avatarText}>
              {(profile?.name || session?.user?.email || '?').charAt(0).toUpperCase()}
            </Text>
          </View>
          <View style={styles.profileInfo}>
            <Text style={styles.profileName}>
              {profile?.name || session?.user?.email?.split('@')[0] || 'User'}
            </Text>
            <Text style={styles.profileEmail}>{session?.user?.email ?? '—'}</Text>
            <View style={[styles.roleBadge, { backgroundColor: roleColor }]}>
              <Text style={styles.roleBadgeText}>{roleLabel}</Text>
            </View>
          </View>
        </View>

        {profileError && (
          <View style={styles.errorBox}>
            <Text style={styles.errorTitle}>Profile load issue</Text>
            <Text style={styles.errorMessage}>{profileError}</Text>
            <Pressable style={styles.errorRetry} onPress={handleRefreshProfile}>
              <Text style={styles.errorRetryText}>Retry</Text>
            </Pressable>
          </View>
        )}

        {!profileError && profile && !role && (
          <View style={styles.warningBox}>
            <Text style={styles.warningTitle}>Role not set</Text>
            <Text style={styles.warningMessage}>
              Your account exists but no role is assigned, so role-specific features (like
              Manage Rooms) are hidden. Ask an admin to set your role in the database, then
              tap retry.
            </Text>
            <Pressable style={styles.warningRetry} onPress={handleRefreshProfile}>
              <Text style={styles.warningRetryText}>Retry</Text>
            </Pressable>
          </View>
        )}

        {isOwner && (
          <>
            <Pressable
              style={({ pressed }) => [styles.actionRow, pressed && styles.actionRowPressed]}
              onPress={() => router.push('/room-management')}
            >
              <Text style={styles.actionIcon}>🏨</Text>
              <View style={{ flex: 1 }}>
                <Text style={styles.actionLabel}>Manage Rooms</Text>
                <Text style={styles.actionHint}>Add, edit, or remove rooms</Text>
              </View>
              <Text style={styles.chevron}>›</Text>
            </Pressable>

            <Pressable
              style={({ pressed }) => [styles.actionRow, pressed && styles.actionRowPressed]}
              onPress={() => router.push('/user-management')}
            >
              <Text style={styles.actionIcon}>👥</Text>
              <View style={{ flex: 1 }}>
                <Text style={styles.actionLabel}>Manage Users</Text>
                <Text style={styles.actionHint}>Add or remove receptionists & owners</Text>
              </View>
              <Text style={styles.chevron}>›</Text>
            </Pressable>
          </>
        )}

        <Text style={styles.sectionTitle}>Diagnostics</Text>

        <View style={styles.diagCard}>
          <View style={styles.diagRow}>
            <View style={{ flex: 1 }}>
              <Text style={styles.diagLabel}>Local log file</Text>
              <Text style={styles.diagSubLabel} numberOfLines={1} ellipsizeMode="middle">
                {logger.getFileUri()}
              </Text>
            </View>
            <Text style={styles.diagSize}>{formatBytes(fileSize)}</Text>
          </View>

          <View style={styles.diagButtons}>
            <Pressable
              style={({ pressed }) => [
                styles.diagBtn,
                styles.diagBtnPrimary,
                pressed && { opacity: 0.85 },
                busy === 'share' && { opacity: 0.6 },
              ]}
              onPress={handleShareLogs}
              disabled={!!busy}
            >
              {busy === 'share' ? (
                <ActivityIndicator color={AppColors.white} size="small" />
              ) : (
                <Text style={styles.diagBtnPrimaryText}>Share Log File</Text>
              )}
            </Pressable>

            <Pressable
              style={({ pressed }) => [styles.diagBtn, pressed && { opacity: 0.85 }]}
              onPress={() => setLogsVisible(true)}
            >
              <Text style={styles.diagBtnText}>View Logs</Text>
            </Pressable>
          </View>

          <View style={styles.diagButtons}>
            <Pressable
              style={({ pressed }) => [
                styles.diagBtn,
                styles.diagBtnGhost,
                pressed && { opacity: 0.85 },
                busy === 'copy' && { opacity: 0.6 },
              ]}
              onPress={handleCopyLogs}
              disabled={!!busy}
            >
              {busy === 'copy' ? (
                <ActivityIndicator color={AppColors.primary} size="small" />
              ) : (
                <Text style={styles.diagBtnGhostText}>Copy to Clipboard</Text>
              )}
            </Pressable>

            <Pressable
              style={({ pressed }) => [
                styles.diagBtn,
                styles.diagBtnDanger,
                pressed && { opacity: 0.85 },
              ]}
              onPress={handleClearLogs}
            >
              <Text style={styles.diagBtnDangerText}>Clear Logs</Text>
            </Pressable>
          </View>

          <Text style={styles.diagFootnote}>
            Logs include app launch, auth state, data fetches, role checks, calendar date changes,
            booking actions, and reports of slow or failed network calls. Share this file with
            support to help diagnose loading issues.
          </Text>
        </View>

        <Pressable
          style={({ pressed }) => [styles.signOutBtn, pressed && { opacity: 0.85 }]}
          onPress={handleSignOut}
        >
          <Text style={styles.signOutText}>Sign Out</Text>
        </Pressable>
      </ScrollView>

      <Modal
        visible={logsVisible}
        animationType="slide"
        onRequestClose={() => setLogsVisible(false)}
      >
        <SafeAreaView style={styles.modalContainer} edges={['top']}>
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>Logs ({visibleEntries.length})</Text>
            <Pressable onPress={() => setLogsVisible(false)} hitSlop={12}>
              <Text style={styles.modalClose}>Close</Text>
            </Pressable>
          </View>

          <View style={styles.searchBox}>
            <TextInput
              style={styles.searchInput}
              placeholder="Search logs..."
              placeholderTextColor={AppColors.grey}
              value={searchQuery}
              onChangeText={setSearchQuery}
              autoCapitalize="none"
              autoCorrect={false}
            />
            {searchQuery !== '' && (
              <Pressable onPress={() => setSearchQuery('')} hitSlop={8}>
                <Text style={styles.searchClear}>✕</Text>
              </Pressable>
            )}
          </View>

          <View style={styles.filterRow}>
            {LEVEL_FILTERS.map((f) => (
              <Pressable
                key={f.key}
                onPress={() => setFilter(f.key)}
                style={[
                  styles.filterChip,
                  filter === f.key && styles.filterChipActive,
                ]}
              >
                <Text
                  style={[
                    styles.filterChipText,
                    filter === f.key && styles.filterChipTextActive,
                  ]}
                >
                  {f.label}
                </Text>
              </Pressable>
            ))}
          </View>

          <ScrollView style={styles.logsScroll} contentContainerStyle={styles.logsContent}>
            {visibleEntries.length === 0 ? (
              <Text style={styles.logsEmpty}>No log entries match the filter.</Text>
            ) : (
              visibleEntries.map((entry, idx) => (
                <View
                  key={`${entry.ts}-${idx}`}
                  style={[
                    styles.logEntry,
                    { borderLeftColor: LEVEL_COLORS[entry.level] },
                  ]}
                >
                  <View style={styles.logEntryHeader}>
                    <Text style={[styles.logLevel, { color: LEVEL_COLORS[entry.level] }]}>
                      {entry.level.toUpperCase()}
                    </Text>
                    <Text style={styles.logTag}>{entry.tag}</Text>
                    <Text style={styles.logTime}>{formatTime(entry.ts)}</Text>
                  </View>
                  <Text style={styles.logMessage}>{entry.message}</Text>
                  {entry.data !== undefined && (
                    <Text style={styles.logData}>
                      {(() => {
                        try {
                          return JSON.stringify(entry.data, null, 2);
                        } catch {
                          return String(entry.data);
                        }
                      })()}
                    </Text>
                  )}
                </View>
              ))
            )}
          </ScrollView>
        </SafeAreaView>
      </Modal>
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
  scroll: {
    padding: 20,
    paddingBottom: 40,
  },
  profileCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: AppColors.white,
    borderRadius: 16,
    padding: 18,
    gap: 14,
    borderWidth: 1,
    borderColor: AppColors.border,
    marginBottom: 16,
  },
  avatar: {
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: AppColors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: {
    fontSize: 24,
    fontWeight: '800',
    color: AppColors.white,
  },
  profileInfo: {
    flex: 1,
    gap: 4,
  },
  profileName: {
    fontSize: 18,
    fontWeight: '700',
    color: AppColors.black,
  },
  profileEmail: {
    fontSize: 13,
    color: AppColors.grey,
  },
  roleBadge: {
    alignSelf: 'flex-start',
    paddingHorizontal: 10,
    paddingVertical: 3,
    borderRadius: 8,
    marginTop: 4,
  },
  roleBadgeText: {
    fontSize: 11,
    color: AppColors.white,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.4,
  },
  errorBox: {
    backgroundColor: '#fef2f2',
    borderColor: '#fecaca',
    borderWidth: 1,
    borderRadius: 12,
    padding: 14,
    marginBottom: 16,
  },
  errorTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: AppColors.danger,
    marginBottom: 4,
  },
  errorMessage: {
    fontSize: 13,
    color: AppColors.black,
    marginBottom: 8,
  },
  errorRetry: {
    alignSelf: 'flex-start',
    paddingHorizontal: 12,
    paddingVertical: 6,
    backgroundColor: AppColors.danger,
    borderRadius: 8,
  },
  errorRetryText: {
    color: AppColors.white,
    fontSize: 12,
    fontWeight: '700',
  },
  warningBox: {
    backgroundColor: '#fff7ed',
    borderColor: '#fed7aa',
    borderWidth: 1,
    borderRadius: 12,
    padding: 14,
    marginBottom: 16,
  },
  warningTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: AppColors.warning,
    marginBottom: 4,
  },
  warningMessage: {
    fontSize: 13,
    color: AppColors.black,
    marginBottom: 8,
    lineHeight: 18,
  },
  warningRetry: {
    alignSelf: 'flex-start',
    paddingHorizontal: 12,
    paddingVertical: 6,
    backgroundColor: AppColors.warning,
    borderRadius: 8,
  },
  warningRetryText: {
    color: AppColors.white,
    fontSize: 12,
    fontWeight: '700',
  },
  actionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: AppColors.white,
    borderRadius: 12,
    padding: 16,
    gap: 14,
    borderWidth: 1,
    borderColor: AppColors.border,
    marginBottom: 16,
  },
  actionRowPressed: {
    opacity: 0.85,
  },
  actionIcon: {
    fontSize: 22,
  },
  actionLabel: {
    fontSize: 15,
    fontWeight: '700',
    color: AppColors.black,
  },
  actionHint: {
    fontSize: 12,
    color: AppColors.grey,
    marginTop: 2,
  },
  chevron: {
    fontSize: 20,
    color: AppColors.grey,
    fontWeight: '700',
  },
  sectionTitle: {
    fontSize: 12,
    fontWeight: '700',
    color: AppColors.grey,
    textTransform: 'uppercase',
    letterSpacing: 0.6,
    marginBottom: 10,
    marginTop: 4,
  },
  diagCard: {
    backgroundColor: AppColors.white,
    borderRadius: 14,
    padding: 16,
    borderWidth: 1,
    borderColor: AppColors.border,
    gap: 12,
    marginBottom: 18,
  },
  diagRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  diagLabel: {
    fontSize: 13,
    fontWeight: '700',
    color: AppColors.black,
    marginBottom: 2,
  },
  diagSubLabel: {
    fontSize: 11,
    color: AppColors.grey,
  },
  diagSize: {
    fontSize: 13,
    fontWeight: '700',
    color: AppColors.primary,
  },
  diagButtons: {
    flexDirection: 'row',
    gap: 10,
  },
  diagBtn: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 10,
    alignItems: 'center',
    borderWidth: 1.5,
    borderColor: AppColors.border,
    backgroundColor: AppColors.white,
  },
  diagBtnPrimary: {
    backgroundColor: AppColors.primary,
    borderColor: AppColors.primary,
  },
  diagBtnPrimaryText: {
    fontSize: 14,
    fontWeight: '700',
    color: AppColors.white,
  },
  diagBtnText: {
    fontSize: 14,
    fontWeight: '700',
    color: AppColors.black,
  },
  diagBtnGhost: {
    backgroundColor: AppColors.white,
    borderColor: AppColors.primary,
  },
  diagBtnGhostText: {
    fontSize: 14,
    fontWeight: '700',
    color: AppColors.primary,
  },
  diagBtnDanger: {
    backgroundColor: AppColors.danger,
    borderColor: AppColors.danger,
  },
  diagBtnDangerText: {
    fontSize: 14,
    fontWeight: '700',
    color: AppColors.white,
  },
  diagFootnote: {
    fontSize: 12,
    color: AppColors.grey,
    lineHeight: 17,
  },
  signOutBtn: {
    backgroundColor: AppColors.white,
    borderWidth: 1.5,
    borderColor: AppColors.danger,
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: 'center',
    marginTop: 8,
  },
  signOutText: {
    fontSize: 15,
    fontWeight: '700',
    color: AppColors.danger,
  },
  modalContainer: {
    flex: 1,
    backgroundColor: AppColors.lightGrey,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 14,
    backgroundColor: AppColors.white,
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
  searchBox: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: AppColors.white,
    marginHorizontal: 14,
    marginTop: 12,
    borderRadius: 10,
    paddingHorizontal: 14,
    height: 42,
    borderWidth: 1,
    borderColor: AppColors.border,
  },
  searchInput: {
    flex: 1,
    fontSize: 14,
    color: AppColors.black,
    padding: 0,
  },
  searchClear: {
    fontSize: 14,
    color: AppColors.grey,
    fontWeight: '700',
    paddingHorizontal: 6,
  },
  filterRow: {
    flexDirection: 'row',
    gap: 8,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  filterChip: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: AppColors.border,
    backgroundColor: AppColors.white,
  },
  filterChipActive: {
    backgroundColor: AppColors.primary,
    borderColor: AppColors.primary,
  },
  filterChipText: {
    fontSize: 12,
    fontWeight: '700',
    color: AppColors.grey,
  },
  filterChipTextActive: {
    color: AppColors.white,
  },
  logsScroll: {
    flex: 1,
  },
  logsContent: {
    padding: 12,
    gap: 8,
  },
  logsEmpty: {
    textAlign: 'center',
    paddingVertical: 30,
    color: AppColors.grey,
    fontSize: 14,
  },
  logEntry: {
    backgroundColor: AppColors.white,
    borderRadius: 10,
    padding: 12,
    borderLeftWidth: 4,
    borderWidth: 1,
    borderColor: AppColors.border,
  },
  logEntryHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 4,
  },
  logLevel: {
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  logTag: {
    fontSize: 11,
    fontWeight: '700',
    color: AppColors.black,
    flex: 1,
  },
  logTime: {
    fontSize: 11,
    color: AppColors.grey,
    fontWeight: '600',
  },
  logMessage: {
    fontSize: 13,
    color: AppColors.black,
    fontWeight: '500',
  },
  logData: {
    marginTop: 6,
    fontSize: 11,
    color: AppColors.grey,
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
    backgroundColor: AppColors.lightGrey,
    padding: 6,
    borderRadius: 6,
  },
});
