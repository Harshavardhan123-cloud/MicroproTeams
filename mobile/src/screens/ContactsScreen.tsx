import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  TextInput,
  RefreshControl,
  ActivityIndicator,
} from 'react-native';
import { Colors } from '../theme/colors';
import { Avatar } from '../components/common/Avatar';
import { contactsStore, UserContact } from '../stores/contactsStore';
import { chatStore } from '../stores/chatStore';
import { callStore } from '../stores/callStore';

interface ContactsScreenProps {
  onOpenChat?: () => void;
}

export const ContactsScreen: React.FC<ContactsScreenProps> = ({ onOpenChat }) => {
  const [contactsState, setContactsState] = useState(contactsStore.getState());
  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => {
    const unsub = contactsStore.subscribe(() => {
      setContactsState(contactsStore.getState());
    });
    contactsStore.fetchUsers();
    return () => unsub();
  }, []);

  const handleRefresh = async () => {
    setRefreshing(true);
    await contactsStore.fetchUsers();
    setRefreshing(false);
  };

  const handleStartChat = async (contact: UserContact) => {
    const conv = await chatStore.startOrOpenDirectChat(contact.id);
    if (conv && onOpenChat) {
      onOpenChat();
    }
  };

  const handleCall = (contact: UserContact, type: 'audio' | 'video') => {
    callStore.initiateCall(
      {
        id: contact.id,
        name: contact.display_name || contact.username,
        avatar: contact.avatar_url,
      },
      type
    );
  };

  const { users, isLoading, searchQuery, filter } = contactsState;

  const filteredUsers = users.filter((u) => {
    // 1. Search query
    const matchQuery =
      !searchQuery.trim() ||
      u.display_name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      u.username?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      u.email?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      u.department?.toLowerCase().includes(searchQuery.toLowerCase());

    if (!matchQuery) return false;

    // 2. Presence filter
    if (filter === 'online') {
      return u.presence === 'available' || u.presence === 'online';
    }
    if (filter === 'favorites') {
      return u.is_favorite;
    }
    return true;
  });

  return (
    <View style={styles.container}>
      {/* Search & Filter Header */}
      <View style={styles.headerArea}>
        <View style={styles.searchBar}>
          <Text style={styles.searchIcon}>🔍</Text>
          <TextInput
            style={styles.searchInput}
            value={searchQuery}
            onChangeText={(t) => contactsStore.setSearchQuery(t)}
            placeholder="Search colleagues by name, role or email..."
            placeholderTextColor={Colors.textMuted}
            autoCapitalize="none"
          />
          {searchQuery.length > 0 && (
            <TouchableOpacity onPress={() => contactsStore.setSearchQuery('')}>
              <Text style={styles.clearSearch}>✕</Text>
            </TouchableOpacity>
          )}
        </View>

        {/* Filter Pills */}
        <View style={styles.filterPills}>
          <TouchableOpacity
            style={[styles.pill, filter === 'all' && styles.pillActive]}
            onPress={() => contactsStore.setFilter('all')}
            activeOpacity={0.7}
          >
            <Text style={[styles.pillText, filter === 'all' && styles.pillTextActive]}>
              All ({users.length})
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.pill, filter === 'online' && styles.pillActive]}
            onPress={() => contactsStore.setFilter('online')}
            activeOpacity={0.7}
          >
            <View style={styles.onlineDot} />
            <Text style={[styles.pillText, filter === 'online' && styles.pillTextActive]}>
              Online
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.pill, filter === 'favorites' && styles.pillActive]}
            onPress={() => contactsStore.setFilter('favorites')}
            activeOpacity={0.7}
          >
            <Text style={[styles.pillText, filter === 'favorites' && styles.pillTextActive]}>
              ★ Favorites
            </Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* Directory List */}
      {isLoading && users.length === 0 ? (
        <View style={styles.centerLoading}>
          <ActivityIndicator color={Colors.primary} size="large" />
          <Text style={styles.loadingText}>Loading company directory...</Text>
        </View>
      ) : (
        <FlatList
          data={filteredUsers}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.listContent}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={handleRefresh}
              tintColor={Colors.primary}
            />
          }
          ListEmptyComponent={
            <View style={styles.emptyContainer}>
              <Text style={styles.emptyIcon}>👥</Text>
              <Text style={styles.emptyTitle}>No Colleagues Found</Text>
              <Text style={styles.emptySubtitle}>
                {searchQuery ? 'Try matching another name or keyword.' : 'No members in this filter.'}
              </Text>
            </View>
          }
          renderItem={({ item }) => {
            const isOnline = item.presence === 'available' || item.presence === 'online';

            return (
              <View style={styles.contactCard}>
                <View style={styles.contactMain}>
                  <View style={styles.avatarWrapper}>
                    <Avatar
                      name={item.display_name || item.username}
                      avatarUrl={item.avatar_url}
                      size={46}
                    />
                    <View
                      style={[
                        styles.presenceDot,
                        { backgroundColor: isOnline ? Colors.emerald : Colors.textMuted },
                      ]}
                    />
                  </View>

                  <View style={styles.contactInfo}>
                    <View style={styles.nameRow}>
                      <Text style={styles.contactName} numberOfLines={1}>
                        {item.display_name || item.username}
                      </Text>
                      <TouchableOpacity
                        onPress={() => contactsStore.toggleFavorite(item.id)}
                        hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                      >
                        <Text style={[styles.starIcon, item.is_favorite && styles.starActive]}>
                          {item.is_favorite ? '★' : '☆'}
                        </Text>
                      </TouchableOpacity>
                    </View>

                    <Text style={styles.contactEmail} numberOfLines={1}>
                      {item.email}
                    </Text>

                    <View style={styles.tagsRow}>
                      <View style={styles.roleTag}>
                        <Text style={styles.roleTagText}>{item.role || 'Colleague'}</Text>
                      </View>
                      {item.department ? (
                        <View style={styles.deptTag}>
                          <Text style={styles.deptTagText}>{item.department}</Text>
                        </View>
                      ) : null}
                    </View>
                  </View>
                </View>

                {/* Contact Quick Action Buttons */}
                <View style={styles.actionsRow}>
                  <TouchableOpacity
                    style={styles.chatActionBtn}
                    onPress={() => handleStartChat(item)}
                    activeOpacity={0.7}
                  >
                    <Text style={styles.actionBtnIcon}>💬</Text>
                    <Text style={styles.chatActionBtnText}>Message</Text>
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={styles.callActionBtn}
                    onPress={() => handleCall(item, 'audio')}
                    activeOpacity={0.7}
                  >
                    <Text style={styles.actionBtnIcon}>📞</Text>
                    <Text style={styles.callActionBtnText}>Call</Text>
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={styles.videoActionBtn}
                    onPress={() => handleCall(item, 'video')}
                    activeOpacity={0.7}
                  >
                    <Text style={styles.actionBtnIcon}>📹</Text>
                    <Text style={styles.videoActionBtnText}>Video</Text>
                  </TouchableOpacity>
                </View>
              </View>
            );
          }}
        />
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  headerArea: {
    padding: 16,
    paddingBottom: 12,
    backgroundColor: Colors.surface,
    borderBottomWidth: 1,
    borderBottomColor: Colors.surfaceBorder,
    gap: 12,
  },
  searchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.surfaceLight,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: Colors.surfaceBorder,
    paddingHorizontal: 12,
    paddingVertical: 8,
    gap: 8,
  },
  searchIcon: {
    fontSize: 14,
  },
  searchInput: {
    flex: 1,
    color: Colors.textPrimary,
    fontSize: 13.5,
    padding: 0,
  },
  clearSearch: {
    color: Colors.textMuted,
    fontSize: 14,
    paddingHorizontal: 4,
  },
  filterPills: {
    flexDirection: 'row',
    gap: 8,
  },
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 999,
    backgroundColor: Colors.surfaceElevated,
    borderWidth: 1,
    borderColor: Colors.surfaceBorder,
    gap: 6,
  },
  pillActive: {
    backgroundColor: 'rgba(99, 102, 241, 0.15)',
    borderColor: Colors.primary,
  },
  pillText: {
    color: Colors.textSecondary,
    fontSize: 12,
    fontWeight: '600',
  },
  pillTextActive: {
    color: Colors.textPrimary,
    fontWeight: '700',
  },
  onlineDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: Colors.emerald,
  },
  listContent: {
    padding: 16,
    gap: 12,
  },
  contactCard: {
    backgroundColor: Colors.surface,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: Colors.surfaceBorder,
    padding: 16,
    gap: 14,
  },
  contactMain: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
  },
  avatarWrapper: {
    position: 'relative',
  },
  presenceDot: {
    position: 'absolute',
    bottom: -1,
    right: -1,
    width: 13,
    height: 13,
    borderRadius: 7,
    borderWidth: 2,
    borderColor: Colors.surface,
  },
  contactInfo: {
    flex: 1,
  },
  nameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  contactName: {
    color: Colors.textPrimary,
    fontSize: 16,
    fontWeight: '700',
    flex: 1,
  },
  starIcon: {
    fontSize: 18,
    color: Colors.textMuted,
    marginLeft: 8,
  },
  starActive: {
    color: Colors.amber,
  },
  contactEmail: {
    color: Colors.textSecondary,
    fontSize: 12,
    marginTop: 2,
  },
  tagsRow: {
    flexDirection: 'row',
    gap: 6,
    marginTop: 6,
  },
  roleTag: {
    backgroundColor: 'rgba(99, 102, 241, 0.12)',
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 6,
  },
  roleTagText: {
    color: Colors.primary,
    fontSize: 10,
    fontWeight: '700',
  },
  deptTag: {
    backgroundColor: Colors.surfaceLight,
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 6,
  },
  deptTagText: {
    color: Colors.textMuted,
    fontSize: 10,
    fontWeight: '600',
  },
  actionsRow: {
    flexDirection: 'row',
    gap: 8,
    borderTopWidth: 1,
    borderTopColor: Colors.surfaceBorder,
    paddingTop: 12,
  },
  chatActionBtn: {
    flex: 1.3,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.primary,
    paddingVertical: 9,
    borderRadius: 10,
    gap: 6,
  },
  chatActionBtnText: {
    color: '#FFFFFF',
    fontSize: 12.5,
    fontWeight: '700',
  },
  callActionBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.surfaceLight,
    borderWidth: 1,
    borderColor: Colors.surfaceBorder,
    paddingVertical: 9,
    borderRadius: 10,
    gap: 5,
  },
  callActionBtnText: {
    color: Colors.textPrimary,
    fontSize: 12,
    fontWeight: '600',
  },
  videoActionBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.surfaceLight,
    borderWidth: 1,
    borderColor: Colors.surfaceBorder,
    paddingVertical: 9,
    borderRadius: 10,
    gap: 5,
  },
  videoActionBtnText: {
    color: Colors.textPrimary,
    fontSize: 12,
    fontWeight: '600',
  },
  actionBtnIcon: {
    fontSize: 12,
  },
  centerLoading: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 32,
  },
  loadingText: {
    color: Colors.textSecondary,
    fontSize: 13,
    marginTop: 12,
  },
  emptyContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    padding: 40,
    marginTop: 30,
  },
  emptyIcon: {
    fontSize: 36,
    marginBottom: 12,
  },
  emptyTitle: {
    color: Colors.textPrimary,
    fontSize: 17,
    fontWeight: '700',
    marginBottom: 4,
  },
  emptySubtitle: {
    color: Colors.textSecondary,
    fontSize: 12.5,
    textAlign: 'center',
  },
});
