import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Modal,
  TouchableOpacity,
  TextInput,
  FlatList,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { Colors } from '../../theme/colors';
import { Avatar } from '../common/Avatar';
import { teamsStore, Team } from '../../stores/teamsStore';

interface TeamSettingsModalProps {
  visible: boolean;
  team: Team | null;
  onClose: () => void;
  // Invoked after the team is successfully deleted, so the caller can clear
  // any screen-level selection state pointing at it.
  onDeleted?: () => void;
}

// Follows the same modal chrome/backdrop/styling pattern as ServerConfigModal.
export const TeamSettingsModal: React.FC<TeamSettingsModalProps> = ({ visible, team, onClose, onDeleted }) => {
  const [teamsState, setTeamsState] = useState(teamsStore.getState());
  const [name, setName] = useState(team?.name || '');
  const [description, setDescription] = useState(team?.description || '');
  const [savingDetails, setSavingDetails] = useState(false);
  const [showTransfer, setShowTransfer] = useState(false);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    const unsub = teamsStore.subscribe(() => setTeamsState(teamsStore.getState()));
    return unsub;
  }, []);

  useEffect(() => {
    if (visible && team) {
      setName(team.name);
      setDescription(team.description || '');
      setShowTransfer(false);
      teamsStore.fetchTeamMembers(team.id);
    }
  }, [visible, team?.id]);

  if (!team) return null;

  const members = teamsState.teamMembers[team.id] || [];
  const transferCandidates = members.filter((m) => m.user_id !== team.owner_id);

  const handleSaveDetails = async () => {
    if (!name.trim() || savingDetails) return;
    setSavingDetails(true);
    try {
      const result = await teamsStore.updateTeam(team.id, { name: name.trim(), description: description.trim() });
      if (!result.success) {
        Alert.alert('Update Failed', result.error || 'Could not update this team.');
      }
    } finally {
      setSavingDetails(false);
    }
  };

  const handleTransfer = (userId: string, displayName?: string) => {
    Alert.alert(
      'Transfer Ownership',
      `Make ${displayName || 'this member'} the new owner of "${team.name}"? You will become a regular member.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Transfer',
          style: 'destructive',
          onPress: async () => {
            const result = await teamsStore.transferOwnership(team.id, userId);
            if (result.success) {
              setShowTransfer(false);
            } else {
              Alert.alert('Transfer Failed', result.error || 'Could not transfer ownership.');
            }
          },
        },
      ]
    );
  };

  const handleDelete = () => {
    Alert.alert(
      'Delete Team',
      `Delete "${team.name}" permanently? All of its channels will become inaccessible. This cannot be undone.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete Team',
          style: 'destructive',
          onPress: async () => {
            setDeleting(true);
            const result = await teamsStore.deleteTeam(team.id);
            setDeleting(false);
            if (result.success) {
              onDeleted?.();
              onClose();
            } else {
              Alert.alert('Delete Failed', result.error || 'Could not delete this team.');
            }
          },
        },
      ]
    );
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <View style={styles.card}>
          <View style={styles.header}>
            <Text style={styles.title}>Team Settings</Text>
            <TouchableOpacity style={styles.closeBtn} onPress={onClose}>
              <Text style={styles.closeText}>✕</Text>
            </TouchableOpacity>
          </View>

          <Text style={styles.inputLabel}>Team Name</Text>
          <TextInput
            style={styles.input}
            value={name}
            onChangeText={setName}
            placeholder="Team name"
            placeholderTextColor={Colors.textMuted}
          />

          <Text style={styles.inputLabel}>Description</Text>
          <TextInput
            style={[styles.input, styles.textArea]}
            value={description}
            onChangeText={setDescription}
            placeholder="What is this team about?"
            placeholderTextColor={Colors.textMuted}
            multiline
            numberOfLines={3}
          />

          <TouchableOpacity
            style={[styles.saveButton, !name.trim() && styles.saveButtonDisabled]}
            onPress={handleSaveDetails}
            disabled={!name.trim() || savingDetails}
            activeOpacity={0.8}
          >
            {savingDetails ? (
              <ActivityIndicator size="small" color="#FFFFFF" />
            ) : (
              <Text style={styles.saveButtonText}>Save Changes</Text>
            )}
          </TouchableOpacity>

          <Text style={styles.sectionHeading}>OWNERSHIP</Text>
          <TouchableOpacity
            style={styles.secondaryButton}
            onPress={() => setShowTransfer((v) => !v)}
            activeOpacity={0.7}
          >
            <Text style={styles.secondaryButtonText}>
              {showTransfer ? 'Hide Transfer Options' : 'Transfer Ownership'}
            </Text>
          </TouchableOpacity>

          {showTransfer && (
            <FlatList
              data={transferCandidates}
              keyExtractor={(m) => m.id}
              style={styles.transferList}
              ListEmptyComponent={<Text style={styles.emptyText}>No other members to transfer to.</Text>}
              renderItem={({ item }) => (
                <TouchableOpacity
                  style={styles.transferRow}
                  onPress={() => handleTransfer(item.user_id, item.user?.display_name)}
                  activeOpacity={0.7}
                >
                  <Avatar name={item.user?.display_name || 'Member'} avatarUrl={item.user?.avatar_url} size={32} />
                  <View style={styles.memberInfo}>
                    <Text style={styles.memberName} numberOfLines={1}>
                      {item.user?.display_name || 'Unknown Member'}
                    </Text>
                    <Text style={styles.memberEmail} numberOfLines={1}>
                      {item.user?.email}
                    </Text>
                  </View>
                  <Text style={styles.transferAction}>Transfer</Text>
                </TouchableOpacity>
              )}
            />
          )}

          <Text style={styles.sectionHeading}>DANGER ZONE</Text>
          <TouchableOpacity style={styles.dangerButton} onPress={handleDelete} disabled={deleting} activeOpacity={0.85}>
            {deleting ? (
              <ActivityIndicator size="small" color="#FFFFFF" />
            ) : (
              <Text style={styles.dangerButtonText}>Delete Team</Text>
            )}
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(5, 7, 11, 0.85)',
    justifyContent: 'flex-end',
  },
  card: {
    backgroundColor: Colors.surface,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    borderTopWidth: 1,
    borderColor: Colors.surfaceBorder,
    padding: 20,
    maxHeight: '85%',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
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
    marginBottom: 14,
  },
  textArea: {
    minHeight: 64,
    textAlignVertical: 'top',
  },
  saveButton: {
    backgroundColor: Colors.primary,
    paddingVertical: 12,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 6,
  },
  saveButtonDisabled: {
    opacity: 0.4,
  },
  saveButtonText: {
    color: '#FFFFFF',
    fontSize: 13.5,
    fontWeight: '700',
  },
  sectionHeading: {
    color: Colors.textMuted,
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 0.8,
    marginTop: 16,
    marginBottom: 8,
  },
  secondaryButton: {
    backgroundColor: Colors.surfaceLight,
    borderWidth: 1,
    borderColor: Colors.surfaceBorder,
    paddingVertical: 12,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  secondaryButtonText: {
    color: Colors.textPrimary,
    fontSize: 13.5,
    fontWeight: '600',
  },
  transferList: {
    maxHeight: 150,
    marginTop: 10,
  },
  transferRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
    gap: 10,
  },
  memberInfo: {
    flex: 1,
  },
  memberName: {
    color: Colors.textPrimary,
    fontSize: 13.5,
    fontWeight: '600',
  },
  memberEmail: {
    color: Colors.textMuted,
    fontSize: 11,
    marginTop: 1,
  },
  transferAction: {
    color: Colors.primary,
    fontSize: 12.5,
    fontWeight: '700',
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
  emptyText: {
    color: Colors.textMuted,
    fontSize: 12,
    textAlign: 'center',
    paddingVertical: 12,
  },
});
