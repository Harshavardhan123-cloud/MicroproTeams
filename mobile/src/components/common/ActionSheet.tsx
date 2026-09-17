import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Modal, Pressable, ScrollView } from 'react-native';
import { Colors } from '../../theme/colors';

export interface ActionSheetOption {
  label: string;
  onPress: () => void;
  destructive?: boolean;
}

interface ActionSheetProps {
  visible: boolean;
  title?: string;
  subtitle?: string;
  options: ActionSheetOption[];
  onClose: () => void;
}

/**
 * Bottom-sheet action menu.
 *
 * Replaces Alert.alert() for contextual menus: Android's Alert renders at most
 * three buttons and silently drops the rest, which made destructive actions
 * unreachable, and it always paints in the system light theme regardless of the
 * app's dark palette. This renders every option and matches the app's styling.
 */
export const ActionSheet: React.FC<ActionSheetProps> = ({
  visible,
  title,
  subtitle,
  options,
  onClose,
}) => {
  const handlePress = (option: ActionSheetOption) => {
    // Close first so the sheet is never left open behind a screen the action
    // navigates to, or behind a modal the action opens.
    onClose();
    option.onPress();
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose}>
        <Pressable style={styles.sheet} onPress={(e) => e.stopPropagation()}>
          {(title || subtitle) && (
            <View style={styles.header}>
              {title ? (
                <Text style={styles.title} numberOfLines={1}>
                  {title}
                </Text>
              ) : null}
              {subtitle ? (
                <Text style={styles.subtitle} numberOfLines={2}>
                  {subtitle}
                </Text>
              ) : null}
            </View>
          )}

          <ScrollView bounces={false} style={styles.optionsScroll}>
            {options.map((option, idx) => (
              <TouchableOpacity
                key={`${option.label}-${idx}`}
                style={[styles.option, idx < options.length - 1 && styles.optionBorder]}
                onPress={() => handlePress(option)}
                activeOpacity={0.7}
              >
                <Text style={[styles.optionText, option.destructive && styles.optionTextDestructive]}>
                  {option.label}
                </Text>
              </TouchableOpacity>
            ))}
          </ScrollView>

          <TouchableOpacity style={styles.cancelBtn} onPress={onClose} activeOpacity={0.7}>
            <Text style={styles.cancelText}>Cancel</Text>
          </TouchableOpacity>
        </Pressable>
      </Pressable>
    </Modal>
  );
};

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: Colors.overlay,
    justifyContent: 'flex-end',
  },
  sheet: {
    backgroundColor: Colors.surfaceElevated,
    borderTopLeftRadius: 22,
    borderTopRightRadius: 22,
    borderWidth: 1,
    borderBottomWidth: 0,
    borderColor: Colors.surfaceBorder,
    paddingBottom: 24,
    paddingTop: 8,
  },
  header: {
    paddingHorizontal: 20,
    paddingTop: 12,
    paddingBottom: 14,
    borderBottomWidth: 1,
    borderBottomColor: Colors.surfaceBorder,
  },
  title: {
    color: Colors.textPrimary,
    fontSize: 15,
    fontWeight: '700',
  },
  subtitle: {
    color: Colors.textSecondary,
    fontSize: 12,
    marginTop: 3,
  },
  optionsScroll: {
    maxHeight: 380,
  },
  option: {
    paddingHorizontal: 20,
    paddingVertical: 16,
  },
  optionBorder: {
    borderBottomWidth: 1,
    borderBottomColor: Colors.surfaceBorder,
  },
  optionText: {
    color: Colors.textPrimary,
    fontSize: 15,
    fontWeight: '600',
  },
  optionTextDestructive: {
    color: Colors.rose,
  },
  cancelBtn: {
    marginTop: 10,
    marginHorizontal: 16,
    paddingVertical: 14,
    borderRadius: 14,
    backgroundColor: Colors.surfaceLight,
    borderWidth: 1,
    borderColor: Colors.surfaceBorder,
    alignItems: 'center',
  },
  cancelText: {
    color: Colors.textSecondary,
    fontSize: 15,
    fontWeight: '700',
  },
});
