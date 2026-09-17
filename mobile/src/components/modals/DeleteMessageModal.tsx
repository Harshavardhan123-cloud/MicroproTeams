import React from 'react';
import { View, Text, StyleSheet, Modal, TouchableOpacity } from 'react-native';
import { Colors } from '../../theme/colors';

interface DeleteMessageModalProps {
  visible: boolean;
  onClose: () => void;
  onConfirm: (mode: 'me' | 'everyone') => void;
}

// Follows the same modal chrome/backdrop/styling pattern as ServerConfigModal.
export const DeleteMessageModal: React.FC<DeleteMessageModalProps> = ({ visible, onClose, onConfirm }) => {
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <View style={styles.card}>
          <View style={styles.header}>
            <Text style={styles.title}>Delete Message</Text>
            <TouchableOpacity style={styles.closeBtn} onPress={onClose}>
              <Text style={styles.closeText}>✕</Text>
            </TouchableOpacity>
          </View>

          <Text style={styles.description}>
            "Delete for me" removes this message from your view only. "Delete for everyone" permanently
            removes it for all participants and requires administrator permissions.
          </Text>

          <View style={styles.actions}>
            <TouchableOpacity style={styles.dangerButton} onPress={() => onConfirm('everyone')} activeOpacity={0.85}>
              <Text style={styles.dangerButtonText}>Delete for Everyone</Text>
            </TouchableOpacity>

            <TouchableOpacity style={styles.primaryButton} onPress={() => onConfirm('me')} activeOpacity={0.85}>
              <Text style={styles.primaryButtonText}>Delete for Me</Text>
            </TouchableOpacity>

            <TouchableOpacity style={styles.cancelButton} onPress={onClose} activeOpacity={0.7}>
              <Text style={styles.cancelButtonText}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(5, 7, 11, 0.85)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  card: {
    width: '100%',
    maxWidth: 400,
    backgroundColor: Colors.surface,
    borderRadius: 24,
    padding: 24,
    borderWidth: 1,
    borderColor: Colors.surfaceBorder,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.5,
    shadowRadius: 20,
    elevation: 10,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  title: {
    color: Colors.textPrimary,
    fontSize: 18,
    fontWeight: '700',
  },
  closeBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: Colors.surfaceLight,
    alignItems: 'center',
    justifyContent: 'center',
  },
  closeText: {
    color: Colors.textSecondary,
    fontSize: 14,
    fontWeight: '700',
  },
  description: {
    color: Colors.textSecondary,
    fontSize: 12.5,
    lineHeight: 18,
    marginBottom: 20,
  },
  actions: {
    gap: 10,
  },
  dangerButton: {
    backgroundColor: Colors.rose,
    paddingVertical: 13,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dangerButtonText: {
    color: '#FFFFFF',
    fontSize: 13.5,
    fontWeight: '700',
  },
  primaryButton: {
    backgroundColor: Colors.primary,
    paddingVertical: 13,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  primaryButtonText: {
    color: '#FFFFFF',
    fontSize: 13.5,
    fontWeight: '700',
  },
  cancelButton: {
    backgroundColor: Colors.surfaceLight,
    borderWidth: 1,
    borderColor: Colors.surfaceBorder,
    paddingVertical: 12,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cancelButtonText: {
    color: Colors.textPrimary,
    fontSize: 13.5,
    fontWeight: '600',
  },
});
