import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Colors } from '../../theme/colors';

interface ToastProps {
  message: string | null;
  type?: 'info' | 'success' | 'warning' | 'error';
}

export const Toast: React.FC<ToastProps> = ({ message, type = 'info' }) => {
  if (!message) return null;

  const getBorderColor = () => {
    switch (type) {
      case 'success':
        return Colors.emerald;
      case 'warning':
        return Colors.amber;
      case 'error':
        return Colors.rose;
      default:
        return Colors.primary;
    }
  };

  return (
    <View style={[styles.container, { borderColor: getBorderColor() }]}>
      <Text style={styles.text}>{message}</Text>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    top: 50,
    left: 20,
    right: 20,
    backgroundColor: Colors.surface,
    borderWidth: 1.5,
    borderRadius: 14,
    paddingVertical: 12,
    paddingHorizontal: 16,
    zIndex: 9999,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.4,
    shadowRadius: 12,
    elevation: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  text: {
    color: Colors.textPrimary,
    fontSize: 13.5,
    fontWeight: '600',
    textAlign: 'center',
  },
});
