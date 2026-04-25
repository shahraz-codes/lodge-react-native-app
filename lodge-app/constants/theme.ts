import { Platform } from 'react-native';

export const Colors = {
  light: {
    text: '#1a1a2e',
    background: '#f5f6fa',
    tint: '#2c3e8f',
    icon: '#687076',
    tabIconDefault: '#687076',
    tabIconSelected: '#2c3e8f',
    card: '#ffffff',
    border: '#e1e4e8',
    subtle: '#6b7280',
  },
  dark: {
    text: '#ECEDEE',
    background: '#151718',
    tint: '#6c8cff',
    icon: '#9BA1A6',
    tabIconDefault: '#9BA1A6',
    tabIconSelected: '#6c8cff',
    card: '#1e2022',
    border: '#2d3134',
    subtle: '#9BA1A6',
  },
};

export const AppColors = {
  primary: '#2c3e8f',
  primaryLight: '#4a6cf7',
  secondary: '#6c8cff',
  success: '#22c55e',
  danger: '#ef4444',
  warning: '#f59e0b',
  info: '#3b82f6',

  roomAvailable: '#22c55e',
  roomOccupied: '#ef4444',
  roomMaintenance: '#f59e0b',

  white: '#ffffff',
  black: '#1a1a2e',
  grey: '#6b7280',
  lightGrey: '#f3f4f6',
  border: '#e5e7eb',
};

export const Fonts = Platform.select({
  ios: {
    sans: 'system-ui',
    serif: 'ui-serif',
    rounded: 'ui-rounded',
    mono: 'ui-monospace',
  },
  default: {
    sans: 'normal',
    serif: 'serif',
    rounded: 'normal',
    mono: 'monospace',
  },
  web: {
    sans: "system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif",
    serif: "Georgia, 'Times New Roman', serif",
    rounded: "'SF Pro Rounded', sans-serif",
    mono: "SFMono-Regular, Menlo, Monaco, Consolas, monospace",
  },
});
