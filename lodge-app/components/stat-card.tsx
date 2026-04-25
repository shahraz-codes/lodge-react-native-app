import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { AppColors } from '@/constants/theme';

interface Props {
  label: string;
  value: number;
  color: string;
}

export function StatCard({ label, value, color }: Props) {
  return (
    <View style={[styles.card, { borderBottomColor: color }]}>
      <Text style={[styles.value, { color }]}>{value}</Text>
      <Text style={styles.label}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    flex: 1,
    backgroundColor: AppColors.white,
    borderRadius: 12,
    padding: 16,
    alignItems: 'center',
    borderBottomWidth: 3,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06,
    shadowRadius: 3,
    elevation: 1,
  },
  value: {
    fontSize: 28,
    fontWeight: '800',
  },
  label: {
    fontSize: 12,
    color: AppColors.grey,
    fontWeight: '600',
    marginTop: 4,
    textTransform: 'uppercase',
  },
});
