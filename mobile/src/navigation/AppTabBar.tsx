import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import type { BottomTabBarProps } from '@react-navigation/bottom-tabs';
import { Colors } from '../theme/colors';

const TAB_CONFIG: Record<string, { emoji?: string; glyph?: string; label: string }> = {
  Channels: { glyph: '#', label: 'Channels' },
  Chats: { emoji: '💬', label: 'Chats' },
  Contacts: { emoji: '👥', label: 'Contacts' },
  Meetings: { emoji: '📹', label: 'Meetings' },
  Activity: { emoji: '🔔', label: 'Activity' },
  Settings: { emoji: '⚙️', label: 'Settings' },
};

export function AppTabBar({ state, navigation }: BottomTabBarProps) {
  return (
    <View style={styles.bottomDock}>
      {state.routes.map((route, index) => {
        const isFocused = state.index === index;
        const config = TAB_CONFIG[route.name] || { emoji: '•', label: route.name };

        const onPress = () => {
          const event = navigation.emit({
            type: 'tabPress',
            target: route.key,
            canPreventDefault: true,
          });

          if (!isFocused && !event.defaultPrevented) {
            navigation.navigate(route.name);
          }
        };

        return (
          <TouchableOpacity
            key={route.key}
            style={[styles.dockItem, isFocused && styles.dockItemActive]}
            onPress={onPress}
            activeOpacity={0.7}
          >
            {config.glyph ? (
              <Text style={[styles.dockIconText, isFocused && styles.dockIconTextActive]}>
                {config.glyph}
              </Text>
            ) : (
              <Text style={styles.dockEmoji}>{config.emoji}</Text>
            )}
            <Text style={[styles.dockLabel, isFocused && styles.dockLabelActive]}>
              {config.label}
            </Text>
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  bottomDock: {
    flexDirection: 'row',
    backgroundColor: Colors.surface,
    borderTopWidth: 1,
    borderTopColor: Colors.surfaceBorder,
    paddingVertical: 6,
    paddingHorizontal: 4,
    justifyContent: 'space-around',
    elevation: 8,
  },
  dockItem: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 4,
    paddingHorizontal: 6,
    borderRadius: 12,
    minWidth: 54,
  },
  dockItemActive: {
    backgroundColor: 'rgba(99, 102, 241, 0.12)',
  },
  dockEmoji: {
    fontSize: 18,
    marginBottom: 2,
  },
  dockIconText: {
    fontSize: 18,
    fontWeight: '900',
    color: Colors.textMuted,
    marginBottom: 2,
  },
  dockIconTextActive: {
    color: Colors.cyan,
  },
  dockLabel: {
    color: Colors.textMuted,
    fontSize: 10,
    fontWeight: '600',
  },
  dockLabelActive: {
    color: Colors.textPrimary,
    fontWeight: '700',
  },
});
