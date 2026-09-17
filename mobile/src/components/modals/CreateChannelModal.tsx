import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Modal,
  TouchableOpacity,
  TextInput,
  ActivityIndicator,
  Alert,
  Switch,
} from 'react-native';
import { Colors } from '../../theme/colors';
import { teamsStore } from '../../stores/teamsStore';

interface CreateChannelModalProps {
  visible: boolean;
  teamId: string;
  onClose: () => void;
}

// Follows the same modal chrome/backdrop/styling pattern as ServerConfigModal.
export const CreateChannelModal: React.FC<CreateChannelModalProps> = ({ visible, teamId, onClose }) => {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [isPrivate, setIsPrivate] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const reset = () => {
    setName('');
    setDescription('');
    setIsPrivate(false);
  };

  const handleClose = () => {
    if (submitting) return;
    reset();
    onClose();
  };

  const handleCreate = async () => {
    if (!name.trim() || submitting) return;
    setSubmitting(true);
    try {
      const result = await teamsStore.createChannel(teamId, {
        name: name.trim(),
        description: description.trim(),
        is_private: isPrivate,
      });
      if (result.success) {
        reset();
        onClose();
      } else {
        Alert.alert('Create Channel Failed', result.error || 'Could not create this channel.');
      }
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={handleClose}>
      <View style={styles.backdrop}>
        <View style={styles.card}>
          <View style={styles.header}>
            <Text style={styles.title}>Create Channel</Text>
            <TouchableOpacity style={styles.closeBtn} onPress={handleClose}>
              <Text style={styles.closeText}>✕</Text>
            </TouchableOpacity>
          </View>

          <Text style={styles.description}>
            Add a new channel to organize discussions within this team.
          </Text>

          <Text style={styles.inputLabel}>Channel Name</Text>
          <TextInput
            style={styles.input}
            value={name}
            onChangeText={setName}
            placeholder="e.g. design-reviews"
            placeholderTextColor={Colors.textMuted}
            autoCapitalize="none"
            autoFocus
          />

          <Text style={styles.inputLabel}>Description (optional)</Text>
          <TextInput
            style={[styles.input, styles.textArea]}
            value={description}
            onChangeText={setDescription}
            placeholder="What is this channel for?"
            placeholderTextColor={Colors.textMuted}
            multiline
            numberOfLines={3}
          />

          <View style={styles.privateRow}>
            <View style={styles.privateTextBlock}>
              <Text style={styles.privateTitle}>Private Channel</Text>
              <Text style={styles.privateSubtitle}>Only invited members can view and post.</Text>
            </View>
            <Switch
              value={isPrivate}
              onValueChange={setIsPrivate}
              trackColor={{ false: Colors.surfaceLight, true: Colors.primaryGlow }}
              thumbColor={isPrivate ? Colors.primary : Colors.textMuted}
            />
          </View>

          <View style={styles.actionRow}>
            <TouchableOpacity style={styles.cancelButton} onPress={handleClose} disabled={submitting} activeOpacity={0.7}>
              <Text style={styles.cancelButtonText}>Cancel</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.saveButton, !name.trim() && styles.saveButtonDisabled]}
              onPress={handleCreate}
              disabled={!name.trim() || submitting}
              activeOpacity={0.8}
            >
              {submitting ? (
                <ActivityIndicator size="small" color="#FFFFFF" />
              ) : (
                <Text style={styles.saveButtonText}>Create Channel</Text>
              )}
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
    fontSize: 13,
    marginBottom: 16,
    lineHeight: 18,
  },
  inputLabel: {
    color: Colors.textSecondary,
    fontSize: 12,
    fontWeight: '600',
    marginBottom: 6,
  },
  input: {
    backgroundColor: Colors.surfaceLight,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Colors.surfaceBorder,
    paddingHorizontal: 14,
    paddingVertical: 12,
    color: Colors.textPrimary,
    fontSize: 14,
    marginBottom: 16,
  },
  textArea: {
    minHeight: 72,
    textAlignVertical: 'top',
  },
  privateRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: Colors.surfaceLight,
    borderWidth: 1,
    borderColor: Colors.surfaceBorder,
    borderRadius: 12,
    padding: 12,
    marginBottom: 20,
    gap: 12,
  },
  privateTextBlock: {
    flex: 1,
  },
  privateTitle: {
    color: Colors.textPrimary,
    fontSize: 13.5,
    fontWeight: '600',
    marginBottom: 2,
  },
  privateSubtitle: {
    color: Colors.textMuted,
    fontSize: 11,
    lineHeight: 15,
  },
  actionRow: {
    flexDirection: 'row',
    gap: 12,
  },
  cancelButton: {
    flex: 1,
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
  saveButton: {
    flex: 1,
    backgroundColor: Colors.primary,
    paddingVertical: 12,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  saveButtonDisabled: {
    opacity: 0.4,
  },
  saveButtonText: {
    color: '#FFFFFF',
    fontSize: 13.5,
    fontWeight: '700',
  },
});
