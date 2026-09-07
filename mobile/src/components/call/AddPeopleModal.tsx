import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Modal,
  TouchableOpacity,
  FlatList,
  TextInput,
  ActivityIndicator,
} from 'react-native';
import { Colors } from '../../theme/colors';
import { Avatar } from '../common/Avatar';
import { apiClient } from '../../api/client';
import { authStore } from '../../stores/authStore';
import { callStore, CallParticipant } from '../../stores/callStore';

interface AddPeopleModalProps {
  visible: boolean;
  onClose: () => void;
}

interface TeamMember {
  id: string;
  username: string;
  display_name?: string;
  email?: string;
  avatar_url?: string;
}

export const AddPeopleModal: React.FC<AddPeopleModalProps> = ({ visible, onClose }) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [members, setMembers] = useState<TeamMember[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [invitedIds, setInvitedIds] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (visible) {
      loadTeamMembers();
    }
  }, [visible]);

  const loadTeamMembers = async () => {
    setIsLoading(true);
    try {
      const res = await apiClient.get('/users');
      const data = res.data.data || res.data || [];
      const current = authStore.getState().user;
      const filtered = data.filter((u: any) => u.id !== current?.id);
      setMembers(filtered);
    } catch (e) {
      console.warn('Failed to load users for Add People:', e);
      // Fallback dummy members if offline
      setMembers([
        { id: 'user-2', username: 'sarah_dev', display_name: 'Sarah Connor', email: 'sarah@example.com' },
        { id: 'user-3', username: 'alex_lead', display_name: 'Alex Rivera', email: 'alex@example.com' },
        { id: 'user-4', username: 'elena_eng', display_name: 'Elena Rostova', email: 'elena@example.com' },
      ]);
    } finally {
      setIsLoading(false);
    }
  };

  const handleInvite = (member: TeamMember) => {
    const participant: CallParticipant = {
      id: member.id,
      name: member.display_name || member.username,
      avatar: member.avatar_url,
    };
    callStore.addParticipant(participant);
    setInvitedIds(new Set([...invitedIds, member.id]));
  };

  const currentParticipants = callStore.getState().participants;
  const filteredMembers = members.filter((m) => {
    const query = searchQuery.toLowerCase();
    const name = (m.display_name || m.username || '').toLowerCase();
    const email = (m.email || '').toLowerCase();
    return name.includes(query) || email.includes(query);
  });

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <View style={styles.card}>
          {/* Header */}
          <View style={styles.headerRow}>
            <View>
              <Text style={styles.title}>Add People to Call</Text>
              <Text style={styles.subtitle}>
                Invite teammates to convert this into a group meeting
              </Text>
            </View>
            <TouchableOpacity style={styles.closeButton} onPress={onClose}>
              <Text style={styles.closeText}>✕</Text>
            </TouchableOpacity>
          </View>

          {/* Search bar */}
          <View style={styles.searchBox}>
            <Text style={styles.searchIcon}>🔍</Text>
            <TextInput
              style={styles.searchInput}
              placeholder="Search by name or email..."
              placeholderTextColor={Colors.textMuted}
              value={searchQuery}
              onChangeText={setSearchQuery}
              autoCapitalize="none"
            />
          </View>

          {/* Members List */}
          {isLoading ? (
            <View style={styles.loadingContainer}>
              <ActivityIndicator color={Colors.primary} size="large" />
            </View>
          ) : (
            <FlatList
              data={filteredMembers}
              keyExtractor={(item) => item.id}
              style={styles.list}
              contentContainerStyle={{ gap: 8 }}
              renderItem={({ item }) => {
                const isAlreadyInCall = currentParticipants.some((p) => p.id === item.id);
                const isInvited = invitedIds.has(item.id) || isAlreadyInCall;

                return (
                  <View style={styles.memberItem}>
                    <Avatar
                      name={item.display_name || item.username}
                      avatarUrl={item.avatar_url}
                      size={44}
                    />

                    <View style={styles.memberInfo}>
                      <Text style={styles.memberName}>
                        {item.display_name || item.username}
                      </Text>
                      <Text style={styles.memberEmail}>{item.email || `@${item.username}`}</Text>
                    </View>

                    <TouchableOpacity
                      style={[
                        styles.inviteButton,
                        isInvited ? styles.invitedButton : styles.activeInviteButton,
                      ]}
                      onPress={() => !isInvited && handleInvite(item)}
                      disabled={isInvited}
                      activeOpacity={0.7}
                    >
                      <Text
                        style={[
                          styles.inviteButtonText,
                          isInvited ? styles.invitedButtonText : styles.activeInviteButtonText,
                        ]}
                      >
                        {isAlreadyInCall ? 'In Call' : isInvited ? 'Invited' : '+ Add'}
                      </Text>
                    </TouchableOpacity>
                  </View>
                );
              }}
            />
          )}

          {/* Footer */}
          <TouchableOpacity style={styles.doneButton} onPress={onClose}>
            <Text style={styles.doneButtonText}>Done</Text>
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
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    borderWidth: 1,
    borderColor: Colors.surfaceBorder,
    padding: 20,
    maxHeight: '80%',
  },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 16,
  },
  title: {
    color: Colors.textPrimary,
    fontSize: 18,
    fontWeight: '700',
  },
  subtitle: {
    color: Colors.textSecondary,
    fontSize: 12,
    marginTop: 2,
  },
  closeButton: {
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
  searchBox: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.surfaceLight,
    borderRadius: 12,
    paddingHorizontal: 12,
    borderWidth: 1,
    borderColor: Colors.surfaceBorder,
    marginBottom: 16,
  },
  searchIcon: {
    fontSize: 14,
    marginRight: 8,
  },
  searchInput: {
    flex: 1,
    height: 44,
    color: Colors.textPrimary,
    fontSize: 14,
  },
  loadingContainer: {
    paddingVertical: 40,
    alignItems: 'center',
  },
  list: {
    maxHeight: 320,
    marginBottom: 16,
  },
  memberItem: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.surfaceLight,
    padding: 12,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: Colors.surfaceBorderLight,
  },
  memberInfo: {
    flex: 1,
    marginLeft: 12,
  },
  memberName: {
    color: Colors.textPrimary,
    fontSize: 14.5,
    fontWeight: '600',
  },
  memberEmail: {
    color: Colors.textMuted,
    fontSize: 11.5,
    marginTop: 1,
  },
  inviteButton: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 10,
    alignItems: 'center',
  },
  activeInviteButton: {
    backgroundColor: Colors.primary,
  },
  invitedButton: {
    backgroundColor: 'rgba(99, 102, 241, 0.15)',
    borderWidth: 1,
    borderColor: 'rgba(99, 102, 241, 0.3)',
  },
  inviteButtonText: {
    fontSize: 12.5,
    fontWeight: '700',
  },
  activeInviteButtonText: {
    color: '#FFFFFF',
  },
  invitedButtonText: {
    color: Colors.teamsPurpleLight,
  },
  doneButton: {
    backgroundColor: Colors.primary,
    paddingVertical: 14,
    borderRadius: 14,
    alignItems: 'center',
  },
  doneButtonText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '700',
  },
});
