import React from 'react';
import { View, Text, Image, StyleSheet } from 'react-native';
import { Colors } from '../../theme/colors';

interface AvatarProps {
  name: string;
  avatarUrl?: string;
  size?: number;
  showStatus?: boolean;
  status?: 'online' | 'busy' | 'away' | 'offline';
}

export const Avatar: React.FC<AvatarProps> = ({
  name,
  avatarUrl,
  size = 40,
  showStatus = false,
  status = 'online',
}) => {
  const initial = (name || 'U').charAt(0).toUpperCase();

  // Consistent background color based on name hash
  const getBackgroundColor = (str: string) => {
    const colors = [
      '#6366F1', // Indigo
      '#8B5CF6', // Purple
      '#EC4899', // Pink
      '#3B82F6', // Blue
      '#10B981', // Emerald
      '#F59E0B', // Amber
      '#06B6D4', // Cyan
    ];
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      hash = str.charCodeAt(i) + ((hash << 5) - hash);
    }
    return colors[Math.abs(hash) % colors.length];
  };

  const getStatusColor = () => {
    switch (status) {
      case 'online':
        return Colors.emerald;
      case 'busy':
        return Colors.rose;
      case 'away':
        return Colors.amber;
      default:
        return Colors.textMuted;
    }
  };

  const statusDotSize = Math.max(8, Math.floor(size * 0.25));

  return (
    <View style={[styles.container, { width: size, height: size }]}>
      {avatarUrl ? (
        <Image
          source={{ uri: avatarUrl }}
          style={[styles.image, { width: size, height: size, borderRadius: size / 2 }]}
        />
      ) : (
        <View
          style={[
            styles.fallback,
            {
              width: size,
              height: size,
              borderRadius: size / 2,
              backgroundColor: getBackgroundColor(name || 'User'),
            },
          ]}
        >
          <Text style={[styles.initialText, { fontSize: size * 0.42 }]}>{initial}</Text>
        </View>
      )}

      {showStatus ? (
        <View
          style={[
            styles.statusDot,
            {
              width: statusDotSize,
              height: statusDotSize,
              borderRadius: statusDotSize / 2,
              backgroundColor: getStatusColor(),
              bottom: 0,
              right: 0,
            },
          ]}
        />
      ) : null}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    position: 'relative',
    alignItems: 'center',
    justifyContent: 'center',
  },
  image: {
    resizeMode: 'cover',
  },
  fallback: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  initialText: {
    color: '#FFFFFF',
    fontWeight: '700',
  },
  statusDot: {
    position: 'absolute',
    borderWidth: 2,
    borderColor: Colors.surface,
  },
});
