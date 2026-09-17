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
import { teamsStore } from '../../stores/teamsStore';

interface ManagePrivateChannelMembersModalProps {
  visible: boolean;
  channelId: string;
  // Parent team id, used to restrict the "add member" picker to users who
  // already belong to the team — private channel members must be team
  // members first (enforced server-side too).
  teamId: string;
  onClose: () => void;
}

// Follows the same modal chrome/backdrop/styling pattern as ServerConfigModal.
export const ManagePrivateChannelMembersModal: React.FC<ManagePrivateChannelMembersModalProps> = ({
  visible,
  channelId,
  teamId,
  onClose,
}) => {
  const [teamsState, setTeamsState] = useState(teamsStore.getState());
  const [search, setSearch] = useState('');

  useEffect(() => {
    const unsub = teamsStore.subscribe(() => setTeamsState(teamsStore.getState()));
    return unsub;
  }, []);

  useEffect(() => {
    if (visible && channelId) {
      teamsStore.fetchChannelMembers(channelId);
      if (teamId) teamsStore.fetchTeamMembers(teamId);
    }
  }, [visible, channelId, teamId]);

  const channelMembers = teamsState.channelMembers[channelId] || [];
  const teamMembers = teamsState.teamMembers[teamId] || [];

  const availableTeamMembers = useMemo(() => {
    const channelMemberIds = new Set(channelMembers.map((m) => m.user_id));
    return teamMembers.filter((m) => {
      if (channelMemberIds.has(m.user_id)) return false;
      if (!search.trim()) return true;
      const name = (m.user?.display_name || '').toLowerCase();
      const email = (m.user?.email || '').toLowerCase();
      return name.includes(search.toLowerCase()) || email.includes(search.toLowerCase());
    });
  }, [channelMembers, teamMembers, search]);

  const handleRemove = (userId: string, displayName?: string) => {
    Alert.alert(
      'Remove Member',
      `Remove ${displayName || 'this member'} from this private channel?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Remove',
          style: 'destructive',
          onPress: async () => {
            const result = await teamsStore.removeChannelMember(channelId, userId);
            if (!result.success) {
              Alert.alert('Remove Failed', result.error || 'Could not remove this member.');
            }
          },
        },
      ]
    );
  };

  const handleAdd = async (userId: string) => {
    const result = await teamsStore.addChannelMember(channelId, userId);
    if (!result.success) {
      Alert.alert('Add Member Failed', result.error || 'Could not add this member.');
    }
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <View style={styles.card}>
          <View style={styles.header}>
            <Text style={styles.title}>Private Channel Members</Text>
            <TouchableOpacity style={styles.closeBtn} onPress={onClose}>
              <Text style={styles.closeText}>✕</Text>
            </TouchableOpacity>
          </View>

          <Text style={styles.description}>
            Only members added here can view and post in this private channel.
          </Text>

          <Text style={styles.sectionHeading}>CURRENT MEMBERS ({channelMembers.length})</Text>

          {teamsState.isLoadingMembers && channelMembers.length === 0 ? (
            <ActivityIndicator color={Colors.primary} style={styles.loader} />
          ) : (
            <FlatList
              data={channelMembers}
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
                  <View style={styles.roleBadge}>
                    <Text style={styles.roleBadgeText}>{item.role}</Text>
                  </View>
                  <TouchableOpacity
                    style={styles.removeBtn}
                    onPress={() => handleRemove(item.user_id, item.user?.display_name)}
                    activeOpacity={0.7}
                  >
                    <Text style={styles.removeBtnText}>✕</Text>
                  </TouchableOpacity>
                </View>
              )}
            />
          )}

          <Text style={styles.sectionHeading}>ADD FROM TEAM</Text>
          <TextInput
            style={styles.searchInput}
            value={search}
            onChangeText={setSearch}
            placeholder="Search team members..."
            placeholderTextColor={Colors.textMuted}
            autoCapitalize="none"
          />

          <FlatList
            data={availableTeamMembers}
            keyExtractor={(m) => m.user_id}
            style={styles.addList}
            ListEmptyComponent={<Text style={styles.emptyText}>No eligible team members found.</Text>}
            renderItem={({ item }) => (
              <TouchableOpacity style={styles.addRow} onPress={() => handleAdd(item.user_id)} activeOpacity={0.7}>
                <Avatar name={item.user?.display_name || 'Member'} avatarUrl={item.user?.avatar_url} size={32} />
                <View style={styles.memberInfo}>
                  <Text style={styles.memberName} numberOfLines={1}>
                    {item.user?.display_name || 'Unknown Member'}
                  </Text>
                  <Text style={styles.memberEmail} numberOfLines={1}>
                    {item.user?.email}
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
    marginBottom: 8,
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
