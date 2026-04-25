import React from 'react';
import { View, ActivityIndicator, StyleSheet, Text } from 'react-native';
import { AppColors } from '@/constants/theme';

interface Props {
  message?: string;
  visible?: boolean;
}

export function LoadingOverlay({ message = 'Loading...', visible = true }: Props) {
  if (!visible) return null;

  return (
    <View style={styles.container}>
      <View style={styles.box}>
        <ActivityIndicator size="large" color={AppColors.primary} />
        <Text style={styles.text}>{message}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.3)',
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 999,
  },
  box: {
    backgroundColor: AppColors.white,
    borderRadius: 16,
    padding: 32,
    alignItems: 'center',
    gap: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 8,
    elevation: 5,
  },
  text: {
    fontSize: 15,
    color: AppColors.grey,
    fontWeight: '500',
  },
});
