import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  RefreshControl,
  ActivityIndicator,
} from 'react-native';
import { Colors } from '../theme/colors';
import { activityStore, ActivityItem, WorkspaceFile } from '../stores/activityStore';

export const ActivityScreen: React.FC = () => {
  const [state, setState] = useState(activityStore.getState());
  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => {
    const unsub = activityStore.subscribe(() => {
      setState(activityStore.getState());
    });

    activityStore.fetchNotifications();
    activityStore.fetchFiles();

    return () => unsub();
  }, []);

  const handleRefresh = async () => {
    setRefreshing(true);
    if (state.activeSubTab === 'notifications') {
      await activityStore.fetchNotifications();
    } else {
      await activityStore.fetchFiles();
    }
    setRefreshing(false);
  };

  const formatFileSize = (bytes: number) => {
    if (!bytes) return '0 KB';
    if (bytes < 1024 * 1024) {
      return `${(bytes / 1024).toFixed(1)} KB`;
    }
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  const { notifications, files, activeSubTab, isLoadingNotifs, isLoadingFiles } = state;

  return (
    <View style={styles.container}>
      {/* Sub-tab Navigation */}
      <View style={styles.tabBar}>
        <TouchableOpacity
          style={[styles.tabBtn, activeSubTab === 'notifications' && styles.tabBtnActive]}
          onPress={() => activityStore.setSubTab('notifications')}
          activeOpacity={0.7}
        >
          <Text style={styles.tabEmoji}>🔔</Text>
          <Text
            style={[styles.tabLabel, activeSubTab === 'notifications' && styles.tabLabelActive]}
          >
            Activity & Alerts
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.tabBtn, activeSubTab === 'files' && styles.tabBtnActive]}
          onPress={() => activityStore.setSubTab('files')}
          activeOpacity={0.7}
        >
          <Text style={styles.tabEmoji}>📁</Text>
          <Text style={[styles.tabLabel, activeSubTab === 'files' && styles.tabLabelActive]}>
            Workspace Files
          </Text>
        </TouchableOpacity>
      </View>

      {/* Notifications Tab Content */}
      {activeSubTab === 'notifications' ? (
        <View style={styles.subContainer}>
          <View style={styles.sectionHeaderRow}>
            <Text style={styles.sectionTitle}>Recent Notifications</Text>
            <TouchableOpacity onPress={() => activityStore.markAllRead()}>
              <Text style={styles.markReadText}>Mark all read</Text>
            </TouchableOpacity>
          </View>

          {isLoadingNotifs && notifications.length === 0 ? (
            <View style={styles.centerLoading}>
              <ActivityIndicator color={Colors.primary} size="large" />
              <Text style={styles.loadingText}>Fetching activity alerts...</Text>
            </View>
          ) : (
            <FlatList
              data={notifications}
              keyExtractor={(n) => n.id}
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
                  <Text style={styles.emptyIcon}>🔔</Text>
                  <Text style={styles.emptyTitle}>All Caught Up</Text>
                  <Text style={styles.emptySubtitle}>No unread activity alerts or call notifications.</Text>
                </View>
              }
              renderItem={({ item }) => (
                <View style={[styles.notifCard, !item.is_read && styles.notifCardUnread]}>
                  <View style={styles.notifIconWrap}>
                    <Text style={styles.notifEmoji}>
                      {item.type === 'call' ? '📞' : item.type === 'meeting' ? '🎥' : '💬'}
                    </Text>
                  </View>
                  <View style={styles.notifDetails}>
                    <View style={styles.notifHeaderRow}>
                      <Text style={styles.notifTitle} numberOfLines={1}>
                        {item.title}
                      </Text>
                      <Text style={styles.notifTime}>
                        {new Date(item.created_at).toLocaleTimeString([], {
                          hour: '2-digit',
                          minute: '2-digit',
                        })}
                      </Text>
                    </View>
                    <Text style={styles.notifBody}>{item.body}</Text>
                  </View>
                  {!item.is_read && <View style={styles.unreadDot} />}
                </View>
              )}
            />
          )}
        </View>
      ) : (
        /* Files Tab Content */
        <View style={styles.subContainer}>
          <View style={styles.sectionHeaderRow}>
            <Text style={styles.sectionTitle}>Shared Files & Media</Text>
            <Text style={styles.filesCount}>{files.length} items</Text>
          </View>

          {isLoadingFiles && files.length === 0 ? (
            <View style={styles.centerLoading}>
              <ActivityIndicator color={Colors.primary} size="large" />
              <Text style={styles.loadingText}>Loading shared files...</Text>
            </View>
          ) : (
            <FlatList
              data={files}
              keyExtractor={(f) => f.id}
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
                  <Text style={styles.emptyIcon}>📁</Text>
                  <Text style={styles.emptyTitle}>No Files Yet</Text>
                  <Text style={styles.emptySubtitle}>
                    Documents and images shared in channels or chats will appear here.
                  </Text>
                </View>
              }
              renderItem={({ item }) => (
                <View style={styles.fileCard}>
                  <View style={styles.fileIconWrap}>
                    <Text style={styles.fileEmoji}>📄</Text>
                  </View>
                  <View style={styles.fileDetails}>
                    <Text style={styles.fileName} numberOfLines={1}>
                      {item.name}
                    </Text>
                    <Text style={styles.fileSub}>
                      {formatFileSize(item.size)} • By {item.uploader_name}
                    </Text>
                  </View>
                  <View style={styles.fileActionBadge}>
                    <Text style={styles.fileActionText}>View</Text>
                  </View>
                </View>
              )}
            />
          )}
        </View>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  tabBar: {
    flexDirection: 'row',
    backgroundColor: Colors.surface,
    padding: 6,
    marginHorizontal: 16,
    marginTop: 12,
    marginBottom: 8,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: Colors.surfaceBorder,
    gap: 6,
  },
  tabBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 9,
    borderRadius: 10,
    gap: 6,
  },
  tabBtnActive: {
    backgroundColor: Colors.primary,
  },
  tabEmoji: {
    fontSize: 14,
  },
  tabLabel: {
    color: Colors.textSecondary,
    fontSize: 12.5,
    fontWeight: '600',
  },
  tabLabelActive: {
    color: '#FFFFFF',
    fontWeight: '700',
  },
  subContainer: {
    flex: 1,
  },
  sectionHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 10,
  },
  sectionTitle: {
    color: Colors.textPrimary,
    fontSize: 15,
    fontWeight: '700',
  },
  markReadText: {
    color: Colors.primary,
    fontSize: 12,
    fontWeight: '700',
  },
  filesCount: {
    color: Colors.textMuted,
    fontSize: 12,
  },
  listContent: {
    paddingHorizontal: 16,
    paddingBottom: 32,
    gap: 10,
  },
  notifCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.surface,
    padding: 14,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: Colors.surfaceBorder,
    gap: 12,
  },
  notifCardUnread: {
    borderColor: 'rgba(99, 102, 241, 0.4)',
    backgroundColor: 'rgba(17, 19, 26, 0.98)',
  },
  notifIconWrap: {
    width: 38,
    height: 38,
    borderRadius: 12,
    backgroundColor: Colors.surfaceLight,
    alignItems: 'center',
    justifyContent: 'center',
  },
  notifEmoji: {
    fontSize: 18,
  },
  notifDetails: {
    flex: 1,
  },
  notifHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 3,
  },
  notifTitle: {
    color: Colors.textPrimary,
    fontSize: 14,
    fontWeight: '600',
    flex: 1,
  },
  notifTime: {
    color: Colors.textMuted,
    fontSize: 10.5,
    marginLeft: 6,
  },
  notifBody: {
    color: Colors.textSecondary,
    fontSize: 12,
    lineHeight: 16,
  },
  unreadDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: Colors.primary,
  },
  fileCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.surface,
    padding: 14,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: Colors.surfaceBorder,
    gap: 12,
  },
  fileIconWrap: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: 'rgba(6, 182, 212, 0.12)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  fileEmoji: {
    fontSize: 20,
  },
  fileDetails: {
    flex: 1,
  },
  fileName: {
    color: Colors.textPrimary,
    fontSize: 14,
    fontWeight: '600',
  },
  fileSub: {
    color: Colors.textSecondary,
    fontSize: 11.5,
    marginTop: 2,
  },
  fileActionBadge: {
    backgroundColor: Colors.surfaceLight,
    borderWidth: 1,
    borderColor: Colors.surfaceBorder,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 8,
  },
  fileActionText: {
    color: Colors.textSecondary,
    fontSize: 11,
    fontWeight: '600',
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
    marginTop: 40,
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
