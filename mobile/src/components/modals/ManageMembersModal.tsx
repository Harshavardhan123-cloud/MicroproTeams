import React, { useEffect, useMemo, useState } from 'react';
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
import { teamsStore, TeamMemberInfo } from '../../stores/teamsStore';
import { contactsStore, UserContact } from '../../stores/contactsStore';

interface ManageMembersModalProps {
  visible: boolean;
  teamId: string;
  onClose: () => void;
}

const ROLE_OPTIONS: Array<'owner' | 'member' | 'guest'> = ['owner', 'member', 'guest'];

// Follows the same modal chrome/backdrop/styling pattern as ServerConfigModal.
export const ManageMembersModal: React.FC<ManageMembersModalProps> = ({ visible, teamId, onClose }) => {
  const [teamsState, setTeamsState] = useState(teamsStore.getState());
  const [contactsState, setContactsState] = useState(contactsStore.getState());
  const [search, setSearch] = useState('');

  useEffect(() => {
    const unsubTeams = teamsStore.subscribe(() => setTeamsState(teamsStore.getState()));
    const unsubContacts = contactsStore.subscribe(() => setContactsState(contactsStore.getState()));
    return () => {
      unsubTeams();
      unsubContacts();
    };
  }, []);

  useEffect(() => {
    if (visible && teamId) {
      teamsStore.fetchTeamMembers(teamId);
      contactsStore.fetchUsers();
    }
  }, [visible, teamId]);

  const members = teamsState.teamMembers[teamId] || [];

  const availableUsers = useMemo(() => {
    const memberIds = new Set(members.map((m) => m.user_id));
    return contactsState.users.filter((u) => {
      if (memberIds.has(u.id)) return false;
      if (!search.trim()) return true;
      const name = (u.display_name || u.username || '').toLowerCase();
      return name.includes(search.toLowerCase()) || u.email.toLowerCase().includes(search.toLowerCase());
    });
  }, [members, contactsState.users, search]);

  const handleRoleChange = (member: TeamMemberInfo) => {
    const options = ROLE_OPTIONS.filter((r) => r !== member.role).map((role) => ({
      text: `Set as ${role.charAt(0).toUpperCase() + role.slice(1)}`,
      onPress: async () => {
        const result = await teamsStore.updateTeamMemberRole(teamId, member.user_id, role);
        if (!result.success) {
          Alert.alert('Update Failed', result.error || 'Could not update this member’s role.');
        }
      },
    }));
    options.push({ text: 'Cancel', onPress: async () => {}, style: 'cancel' } as any);
    Alert.alert(member.user?.display_name || 'Change Role', undefined, options as any);
  };

  const handleRemove = (member: TeamMemberInfo) => {
    Alert.alert(
      'Remove Member',
      `Remove ${member.user?.display_name || 'this member'} from the team?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Remove',
          style: 'destructive',
          onPress: async () => {
            const result = await teamsStore.removeTeamMember(teamId, member.user_id);
            if (!result.success) {
              Alert.alert('Remove Failed', result.error || 'Could not remove this member.');
            }
          },
        },
      ]
    );
  };

  const handleAdd = async (user: UserContact) => {
    const result = await teamsStore.addTeamMember(teamId, user.id);
    if (!result.success) {
      Alert.alert('Add Member Failed', result.error || 'Could not add this member.');
    }
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <View style={styles.card}>
          <View style={styles.header}>
            <Text style={styles.title}>Manage Members</Text>
            <TouchableOpacity style={styles.closeBtn} onPress={onClose}>
              <Text style={styles.closeText}>✕</Text>
            </TouchableOpacity>
          </View>

          <Text style={styles.sectionHeading}>CURRENT MEMBERS ({members.length})</Text>

          {teamsState.isLoadingMembers && members.length === 0 ? (
            <ActivityIndicator color={Colors.primary} style={styles.loader} />
          ) : (
            <FlatList
              data={members}
              keyExtractor={(m) => m.id}
              style={styles.membersList}
              ListEmptyComponent={<Text style={styles.emptyText}>No members yet.</Text>}
              renderItem={({ item }) => (
                <View style={styles.memberRow}>
                  <Avatar name={item.user?.display_name || 'Member'} avatarUrl={item.user?.avatar_url} size={36} />
                  <View style={styles.memberInfo}>
                    <Text style={styles.memberName} numberOfLines={1}>
                      {item.user?.display_name || 'Unknown Member'}
                    </Text>
                    <Text style={styles.memberEmail} numberOfLines={1}>
                      {item.user?.email}
                    </Text>
                  </View>
                  <TouchableOpacity style={styles.roleBadge} onPress={() => handleRoleChange(item)} activeOpacity={0.7}>
                    <Text style={styles.roleBadgeText}>{item.role}</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={styles.removeBtn} onPress={() => handleRemove(item)} activeOpacity={0.7}>
                    <Text style={styles.removeBtnText}>✕</Text>
                  </TouchableOpacity>
                </View>
              )}
            />
          )}

          <Text style={styles.sectionHeading}>ADD MEMBER</Text>
          <TextInput
            style={styles.searchInput}
            value={search}
            onChangeText={setSearch}
            placeholder="Search the workspace directory..."
            placeholderTextColor={Colors.textMuted}
            autoCapitalize="none"
          />

          <FlatList
            data={availableUsers}
            keyExtractor={(u) => u.id}
            style={styles.addList}
            ListEmptyComponent={<Text style={styles.emptyText}>No matching colleagues found.</Text>}
            renderItem={({ item }) => (
              <TouchableOpacity style={styles.addRow} onPress={() => handleAdd(item)} activeOpacity={0.7}>
                <Avatar name={item.display_name || item.username} avatarUrl={item.avatar_url} size={32} />
                <View style={styles.memberInfo}>
                  <Text style={styles.memberName} numberOfLines={1}>
                    {item.display_name || item.username}
                  </Text>
                  <Text style={styles.memberEmail} numberOfLines={1}>
                    {item.email}
                  </Text>
                </View>
                <Text style={styles.addPlus}>+ Add</Text>
              </TouchableOpacity>
            )}
          />
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
  sectionHeading: {
    color: Colors.textMuted,
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 0.8,
    marginTop: 12,
    marginBottom: 8,
  },
  loader: {
    marginVertical: 16,
  },
  membersList: {
    maxHeight: 180,
  },
  memberRow: {
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
  roleBadge: {
    backgroundColor: Colors.surfaceLight,
    borderWidth: 1,
    borderColor: Colors.surfaceBorder,
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 4,
    marginRight: 6,
  },
  roleBadgeText: {
    color: Colors.textSecondary,
    fontSize: 10.5,
    fontWeight: '700',
    textTransform: 'capitalize',
  },
  removeBtn: {
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: 'rgba(239, 68, 68, 0.12)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  removeBtnText: {
    color: Colors.rose,
    fontSize: 11,
    fontWeight: '800',
  },
  searchInput: {
    backgroundColor: Colors.surfaceLight,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Colors.surfaceBorder,
    paddingHorizontal: 14,
    paddingVertical: 10,
    color: Colors.textPrimary,
    fontSize: 13.5,
    marginBottom: 8,
  },
  addList: {
    maxHeight: 180,
  },
  addRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
    gap: 10,
  },
  addPlus: {
    color: Colors.primary,
    fontSize: 12.5,
    fontWeight: '700',
  },
  emptyText: {
    color: Colors.textMuted,
    fontSize: 12,
    textAlign: 'center',
    paddingVertical: 16,
  },
});
