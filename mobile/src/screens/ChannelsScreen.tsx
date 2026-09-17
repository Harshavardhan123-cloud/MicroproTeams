import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
  ScrollView,
  Alert,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Colors } from '../theme/colors';
import { teamsStore, Team, Channel } from '../stores/teamsStore';
import { chatStore, ChatMessage } from '../stores/chatStore';
import { MessageItem } from '../components/chat/MessageItem';
import { MessageComposer } from '../components/chat/MessageComposer';
import { CreateTeamModal } from '../components/modals/CreateTeamModal';
import { CreateChannelModal } from '../components/modals/CreateChannelModal';
import { ManageMembersModal } from '../components/modals/ManageMembersModal';
import { ManagePrivateChannelMembersModal } from '../components/modals/ManagePrivateChannelMembersModal';
import { TeamSettingsModal } from '../components/modals/TeamSettingsModal';
import type { UploadedFile } from '../services/fileUploadService';
import type { RootStackParamList } from '../navigation/types';

type ChannelsNavigationProp = NativeStackNavigationProp<RootStackParamList>;

export const ChannelsScreen: React.FC = () => {
  const navigation = useNavigation<ChannelsNavigationProp>();
  const [teamsState, setTeamsState] = useState(teamsStore.getState());
  const [chatState, setChatState] = useState(chatStore.getState());
  const [activeChannel, setActiveChannel] = useState<Channel | null>(null);
  const [editingMessage, setEditingMessage] = useState<ChatMessage | null>(null);
  const flatListRef = useRef<FlatList>(null);

  // Directory-view modals
  const [showCreateTeamModal, setShowCreateTeamModal] = useState(false);
  const [showCreateChannelModal, setShowCreateChannelModal] = useState(false);
  const [showManageMembersModal, setShowManageMembersModal] = useState(false);
  const [showTeamSettingsModal, setShowTeamSettingsModal] = useState(false);
  // Channel-room-view modal
  const [showPrivateMembersModal, setShowPrivateMembersModal] = useState(false);

  useEffect(() => {
    const unsubTeams = teamsStore.subscribe(() => {
      setTeamsState(teamsStore.getState());
    });
    const unsubChat = chatStore.subscribe(() => {
      setChatState(chatStore.getState());
    });

    teamsStore.fetchTeams();

    return () => {
      unsubTeams();
      unsubChat();
    };
  }, []);

  // Keep the active channel object in sync whenever teams refresh (e.g. after
  // a rename or a private/standard toggle change) instead of going stale.
  useEffect(() => {
    if (!activeChannel) return;
    const parentTeam = teamsState.teams.find((t) => t.id === activeChannel.team_id);
    const updated = parentTeam?.channels.find((c) => c.id === activeChannel.id);
    if (updated && updated !== activeChannel) {
      setActiveChannel(updated);
    } else if (parentTeam && !updated) {
      // Channel was deleted out from under us.
      setActiveChannel(null);
    }
  }, [teamsState.teams]);

  const handleSelectChannel = (channel: Channel) => {
    setActiveChannel(channel);
    chatStore.fetchChannelMessages(channel.id);
  };

  const handleSendMessage = async (text: string, attachments: UploadedFile[]) => {
    if (!activeChannel) return;
    await chatStore.sendChannelMessage(activeChannel.id, text, attachments);
  };

  const handleSaveEdit = async (text: string) => {
    if (!editingMessage) return;
    await chatStore.editMessage(editingMessage.id, text, 'channel');
    setEditingMessage(null);
  };

  const handleDeleteMessage = async (message: ChatMessage, mode: 'me' | 'everyone') => {
    const result = await chatStore.deleteMessage(message.id, mode, 'channel');
    if (!result.success) {
      Alert.alert('Delete Failed', result.error || 'Could not delete this message.');
    }
  };

  const handleToggleReaction = async (message: ChatMessage, emoji: string) => {
    await chatStore.toggleReaction(message.id, emoji, 'channel');
  };

  const handleOpenThread = (message: ChatMessage) => {
    if (!activeChannel) return;
    const params = {
      channelId: activeChannel.id,
      messageId: message.id,
      channelName: activeChannel.name,
    };
    // Thread is a stack screen registered above the tab navigator that hosts
    // this screen — grab the parent stack explicitly rather than relying on
    // navigate() bubbling, so this always resolves correctly.
    const parentNav = navigation.getParent<ChannelsNavigationProp>();
    (parentNav || navigation).navigate('Thread', params);
  };

  const handleOpenTeamActions = (team: Team) => {
    Alert.alert(team.name, undefined, [
      { text: 'Manage Members', onPress: () => setShowManageMembersModal(true) },
      { text: 'Team Settings', onPress: () => setShowTeamSettingsModal(true) },
      { text: 'Cancel', style: 'cancel' },
    ]);
  };

  // -------------------------------------------------------------
  // Inside Channel Chat View
  // -------------------------------------------------------------
  if (activeChannel) {
    return (
      <KeyboardAvoidingView
        style={styles.container}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        {/* Channel Chat Header */}
        <View style={styles.roomHeader}>
          <TouchableOpacity
            style={styles.backBtn}
            onPress={() => setActiveChannel(null)}
            activeOpacity={0.7}
          >
            <Text style={styles.backBtnText}>‹</Text>
          </TouchableOpacity>

          <View style={styles.hashBadge}>
            <Text style={styles.hashText}>{activeChannel.is_private ? '🔒' : '#'}</Text>
          </View>

          <View style={styles.roomTitleBlock}>
            <Text style={styles.roomTitle}>{activeChannel.name}</Text>
            <Text style={styles.roomDesc} numberOfLines={1}>
              {activeChannel.description || 'Channel discussion'}
            </Text>
          </View>

          {activeChannel.is_private && (
            <TouchableOpacity
              style={styles.privateMembersBtn}
              onPress={() => setShowPrivateMembersModal(true)}
              activeOpacity={0.7}
            >
              <Text style={styles.privateMembersBtnText}>Members</Text>
            </TouchableOpacity>
          )}
        </View>

        {/* Message Feed */}
        {chatState.isChannelLoading ? (
          <View style={styles.centerLoading}>
            <ActivityIndicator color={Colors.primary} size="large" />
            <Text style={styles.loadingText}>Loading channel messages...</Text>
          </View>
        ) : (
          <FlatList
            ref={flatListRef}
            data={chatState.channelMessages}
            keyExtractor={(item) => item.id}
            contentContainerStyle={styles.messagesList}
            onContentSizeChange={() => flatListRef.current?.scrollToEnd({ animated: true })}
            ListEmptyComponent={
              <View style={styles.emptyContainer}>
                <View style={styles.emptyHashIcon}>
                  <Text style={styles.emptyHashText}>#</Text>
                </View>
                <Text style={styles.emptyTitle}>Welcome to #{activeChannel.name}!</Text>
                <Text style={styles.emptySubtitle}>
                  This is the start of the #{activeChannel.name} channel. Send a message to start collaborating with your team.
                </Text>
              </View>
            }
            renderItem={({ item }) => (
              <MessageItem
                message={item}
                onEdit={(m) => setEditingMessage(m)}
                onDelete={handleDeleteMessage}
                onToggleReaction={handleToggleReaction}
                onOpenThread={handleOpenThread}
              />
            )}
          />
        )}

        {/* Channel Input Bar */}
        <MessageComposer
          onSend={handleSendMessage}
          editingMessage={editingMessage}
          onSaveEdit={handleSaveEdit}
          onCancelEdit={() => setEditingMessage(null)}
          placeholder={`Message #${activeChannel.name}...`}
        />

        <ManagePrivateChannelMembersModal
          visible={showPrivateMembersModal}
          channelId={activeChannel.id}
          teamId={activeChannel.team_id}
          onClose={() => setShowPrivateMembersModal(false)}
        />
      </KeyboardAvoidingView>
    );
  }

  // -------------------------------------------------------------
  // Channels & Teams Directory View
  // -------------------------------------------------------------
  const { teams, selectedTeam, isLoading } = teamsState;

  return (
    <View style={styles.container}>
      {/* Team Switcher Header */}
      <View style={styles.teamsBar}>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.teamsScroll}
          style={styles.teamsScrollFlex}
        >
          {teams.map((t) => {
            const isSelected = selectedTeam?.id === t.id;
            return (
              <TouchableOpacity
                key={t.id}
                style={[styles.teamPill, isSelected && styles.teamPillActive]}
                onPress={() => teamsStore.selectTeam(t)}
                activeOpacity={0.7}
              >
                <View style={[styles.teamInitial, isSelected && styles.teamInitialActive]}>
                  <Text style={styles.teamInitialText}>{t.name.charAt(0).toUpperCase()}</Text>
                </View>
                <Text style={[styles.teamName, isSelected && styles.teamNameActive]}>
                  {t.name}
                </Text>
              </TouchableOpacity>
            );
          })}
        </ScrollView>

        <TouchableOpacity
          style={styles.addTeamBtn}
          onPress={() => setShowCreateTeamModal(true)}
          activeOpacity={0.8}
        >
          <Text style={styles.addTeamBtnText}>+</Text>
        </TouchableOpacity>
      </View>

      {/* Main Channels List */}
      {isLoading ? (
        <View style={styles.centerLoading}>
          <ActivityIndicator color={Colors.primary} size="large" />
          <Text style={styles.loadingText}>Fetching workspace teams & channels...</Text>
        </View>
      ) : (
        <ScrollView style={styles.contentScroll} contentContainerStyle={styles.contentContainer}>
          {selectedTeam ? (
            <>
              <TouchableOpacity
                style={styles.teamHeroCard}
                onLongPress={() => handleOpenTeamActions(selectedTeam)}
                delayLongPress={280}
                activeOpacity={0.85}
              >
                <View style={styles.teamHeroIcon}>
                  <Text style={styles.teamHeroIconText}>{selectedTeam.name.charAt(0).toUpperCase()}</Text>
                </View>
                <View style={styles.teamHeroInfo}>
                  <Text style={styles.teamHeroTitle}>{selectedTeam.name}</Text>
                  <Text style={styles.teamHeroDesc}>
                    {selectedTeam.description || 'Enterprise Workspace Organization'}
                  </Text>
                </View>
                <TouchableOpacity
                  style={styles.heroGearBtn}
                  onPress={() => handleOpenTeamActions(selectedTeam)}
                  activeOpacity={0.7}
                  hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                >
                  <Text style={styles.heroGearText}>⚙</Text>
                </TouchableOpacity>
              </TouchableOpacity>

              <View style={styles.channelsHeaderRow}>
                <Text style={styles.sectionHeading}>
                  CHANNELS ({selectedTeam.channels?.length || 0})
                </Text>
                <TouchableOpacity
                  style={styles.addChannelBtn}
                  onPress={() => setShowCreateChannelModal(true)}
                  activeOpacity={0.7}
                >
                  <Text style={styles.addChannelBtnText}>+ Channel</Text>
                </TouchableOpacity>
              </View>

              <View style={styles.channelsCard}>
                {(!selectedTeam.channels || selectedTeam.channels.length === 0) ? (
                  <Text style={styles.noChannelsText}>No channels found in this team.</Text>
                ) : (
                  selectedTeam.channels.map((ch, idx) => (
                    <TouchableOpacity
                      key={ch.id}
                      style={[
                        styles.channelItem,
                        idx < selectedTeam.channels.length - 1 && styles.channelItemBorder,
                      ]}
                      onPress={() => handleSelectChannel(ch)}
                      activeOpacity={0.7}
                    >
                      <View style={styles.channelPrefix}>
                        <Text style={styles.channelHash}>{ch.is_private ? '🔒' : '#'}</Text>
                      </View>
                      <View style={styles.channelDetails}>
                        <Text style={styles.channelName}>{ch.name}</Text>
                        {ch.description ? (
                          <Text style={styles.channelSub} numberOfLines={1}>
                            {ch.description}
                          </Text>
                        ) : null}
                      </View>
                      {(ch.unread_count && ch.unread_count > 0) ? (
                        <View style={styles.unreadBadge}>
                          <Text style={styles.unreadText}>{ch.unread_count}</Text>
                        </View>
                      ) : (
                        <Text style={styles.chevron}>›</Text>
                      )}
                    </TouchableOpacity>
                  ))
                )}
              </View>
            </>
          ) : (
            <View style={styles.emptyContainer}>
              <Text style={styles.emptyTitle}>No Teams Available</Text>
              <Text style={styles.emptySubtitle}>You are not a member of any workspace teams yet.</Text>
              <TouchableOpacity
                style={styles.emptyActionBtn}
                onPress={() => setShowCreateTeamModal(true)}
                activeOpacity={0.8}
              >
                <Text style={styles.emptyActionBtnText}>Create a Team</Text>
              </TouchableOpacity>
            </View>
          )}
        </ScrollView>
      )}

      <CreateTeamModal visible={showCreateTeamModal} onClose={() => setShowCreateTeamModal(false)} />

      {selectedTeam && (
        <>
          <CreateChannelModal
            visible={showCreateChannelModal}
            teamId={selectedTeam.id}
            onClose={() => setShowCreateChannelModal(false)}
          />
          <ManageMembersModal
            visible={showManageMembersModal}
            teamId={selectedTeam.id}
            onClose={() => setShowManageMembersModal(false)}
          />
          <TeamSettingsModal
            visible={showTeamSettingsModal}
            team={selectedTeam}
            onClose={() => setShowTeamSettingsModal(false)}
            onDeleted={() => setShowTeamSettingsModal(false)}
          />
        </>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  teamsBar: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.surface,
    borderBottomWidth: 1,
    borderBottomColor: Colors.surfaceBorder,
    paddingVertical: 10,
    paddingRight: 12,
  },
  teamsScrollFlex: {
    flex: 1,
  },
  teamsScroll: {
    paddingHorizontal: 16,
    gap: 8,
  },
  addTeamBtn: {
    width: 32,
    height: 32,
    borderRadius: 10,
    backgroundColor: Colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  addTeamBtnText: {
    color: '#FFFFFF',
    fontSize: 18,
    fontWeight: '800',
    marginTop: -1,
  },
  teamPill: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 12,
    backgroundColor: Colors.surfaceElevated,
    borderWidth: 1,
    borderColor: Colors.surfaceBorder,
    gap: 8,
  },
  teamPillActive: {
    backgroundColor: 'rgba(99, 102, 241, 0.15)',
    borderColor: Colors.primary,
  },
  teamInitial: {
    width: 22,
    height: 22,
    borderRadius: 6,
    backgroundColor: Colors.surfaceLight,
    alignItems: 'center',
    justifyContent: 'center',
  },
  teamInitialActive: {
    backgroundColor: Colors.primary,
  },
  teamInitialText: {
    color: '#FFFFFF',
    fontSize: 11,
    fontWeight: '800',
  },
  teamName: {
    color: Colors.textSecondary,
    fontSize: 13,
    fontWeight: '600',
  },
  teamNameActive: {
    color: Colors.textPrimary,
    fontWeight: '700',
  },
  contentScroll: {
    flex: 1,
  },
  contentContainer: {
    padding: 16,
    paddingBottom: 32,
  },
  teamHeroCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.surface,
    padding: 16,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: Colors.surfaceBorder,
    gap: 14,
    marginBottom: 20,
  },
  teamHeroIcon: {
    width: 48,
    height: 48,
    borderRadius: 16,
    backgroundColor: Colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  teamHeroIconText: {
    color: '#FFFFFF',
    fontSize: 22,
    fontWeight: '900',
  },
  teamHeroInfo: {
    flex: 1,
  },
  teamHeroTitle: {
    color: Colors.textPrimary,
    fontSize: 17,
    fontWeight: '700',
  },
  teamHeroDesc: {
    color: Colors.textSecondary,
    fontSize: 12,
    marginTop: 2,
  },
  heroGearBtn: {
    width: 32,
    height: 32,
    borderRadius: 10,
    backgroundColor: Colors.surfaceLight,
    borderWidth: 1,
    borderColor: Colors.surfaceBorder,
    alignItems: 'center',
    justifyContent: 'center',
  },
  heroGearText: {
    color: Colors.textSecondary,
    fontSize: 15,
  },
  channelsHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  sectionHeading: {
    color: Colors.textMuted,
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 0.8,
    paddingHorizontal: 4,
  },
  addChannelBtn: {
    backgroundColor: 'rgba(99, 102, 241, 0.12)',
    borderWidth: 1,
    borderColor: Colors.primary,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 10,
  },
  addChannelBtnText: {
    color: Colors.primary,
    fontSize: 11.5,
    fontWeight: '700',
  },
  channelsCard: {
    backgroundColor: Colors.surface,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: Colors.surfaceBorder,
    overflow: 'hidden',
  },
  channelItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 14,
    gap: 12,
  },
  channelItemBorder: {
    borderBottomWidth: 1,
    borderBottomColor: Colors.surfaceBorder,
  },
  channelPrefix: {
    width: 32,
    height: 32,
    borderRadius: 10,
    backgroundColor: Colors.surfaceLight,
    alignItems: 'center',
    justifyContent: 'center',
  },
  channelHash: {
    color: Colors.cyan,
    fontSize: 16,
    fontWeight: '900',
  },
  channelDetails: {
    flex: 1,
  },
  channelName: {
    color: Colors.textPrimary,
    fontSize: 15,
    fontWeight: '600',
  },
  channelSub: {
    color: Colors.textSecondary,
    fontSize: 11.5,
    marginTop: 2,
  },
  unreadBadge: {
    backgroundColor: Colors.primary,
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 10,
  },
  unreadText: {
    color: '#FFFFFF',
    fontSize: 11,
    fontWeight: '800',
  },
  chevron: {
    color: Colors.textMuted,
    fontSize: 20,
  },
  noChannelsText: {
    color: Colors.textMuted,
    fontSize: 13,
    padding: 20,
    textAlign: 'center',
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
  },
  emptyHashIcon: {
    width: 60,
    height: 60,
    borderRadius: 20,
    backgroundColor: Colors.surfaceLight,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
  },
  emptyHashText: {
    color: Colors.cyan,
    fontSize: 28,
    fontWeight: '900',
  },
  emptyTitle: {
    color: Colors.textPrimary,
    fontSize: 18,
    fontWeight: '700',
    marginBottom: 6,
    textAlign: 'center',
  },
  emptySubtitle: {
    color: Colors.textSecondary,
    fontSize: 13,
    textAlign: 'center',
    lineHeight: 18,
    maxWidth: 280,
  },
  emptyActionBtn: {
    marginTop: 16,
    backgroundColor: Colors.primary,
    paddingHorizontal: 18,
    paddingVertical: 10,
    borderRadius: 12,
  },
  emptyActionBtnText: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '700',
  },

  // Room view
  roomHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 12,
    backgroundColor: Colors.surface,
    borderBottomWidth: 1,
    borderBottomColor: Colors.surfaceBorder,
    gap: 10,
  },
  backBtn: {
    width: 32,
    height: 32,
    alignItems: 'center',
    justifyContent: 'center',
  },
  backBtnText: {
    color: Colors.textPrimary,
    fontSize: 28,
    fontWeight: '300',
    marginTop: -4,
  },
  hashBadge: {
    width: 32,
    height: 32,
    borderRadius: 10,
    backgroundColor: Colors.surfaceLight,
    alignItems: 'center',
    justifyContent: 'center',
  },
  hashText: {
    color: Colors.textSecondary,
    fontSize: 16,
    fontWeight: '800',
  },
  roomTitleBlock: {
    flex: 1,
  },
  roomTitle: {
    color: Colors.textPrimary,
    fontSize: 16,
    fontWeight: '700',
  },
  roomDesc: {
    color: Colors.textSecondary,
    fontSize: 11,
    marginTop: 1,
  },
  privateMembersBtn: {
    backgroundColor: Colors.surfaceLight,
    borderWidth: 1,
    borderColor: Colors.surfaceBorder,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 10,
  },
  privateMembersBtnText: {
    color: Colors.textSecondary,
    fontSize: 11,
    fontWeight: '700',
  },
  messagesList: {
    padding: 16,
    gap: 12,
  },
});
