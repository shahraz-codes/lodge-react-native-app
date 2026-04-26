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
    <View style={styles.cell}>
      <Text style={[styles.value, { color }]} numberOfLines={1}>
        {value}
      </Text>
      <Text style={styles.label} numberOfLines={1}>
        {label}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  cell: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 10,
    paddingHorizontal: 4,
  },
  value: {
    fontSize: 20,
    fontWeight: '800',
    lineHeight: 24,
    includeFontPadding: false,
  },
  label: {
    fontSize: 10,
    color: AppColors.grey,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.4,
    marginTop: 2,
    includeFontPadding: false,
  },
});
