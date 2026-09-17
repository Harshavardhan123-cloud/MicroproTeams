import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  TextInput,
  KeyboardAvoidingView,
  Platform,
  RefreshControl,
  Modal,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { Colors } from '../theme/colors';
import { Avatar } from '../components/common/Avatar';
import { chatStore, DirectConversationItem, ChatMessage } from '../stores/chatStore';
import { contactsStore, UserContact } from '../stores/contactsStore';
import { callStore } from '../stores/callStore';
import { MessageItem } from '../components/chat/MessageItem';
import { MessageComposer } from '../components/chat/MessageComposer';
import type { UploadedFile } from '../services/fileUploadService';

export const ChatsScreen: React.FC = () => {
  const [chatState, setChatState] = useState(chatStore.getState());
  const [contactsState, setContactsState] = useState(contactsStore.getState());
  const [refreshing, setRefreshing] = useState(false);
  const [newChatModalVisible, setNewChatModalVisible] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [editingMessage, setEditingMessage] = useState<ChatMessage | null>(null);
  const flatListRef = useRef<FlatList>(null);

  useEffect(() => {
    const unsubChat = chatStore.subscribe(() => {
      setChatState(chatStore.getState());
    });
    const unsubContacts = contactsStore.subscribe(() => {
      setContactsState(contactsStore.getState());
    });

    chatStore.fetchConversations();
    contactsStore.fetchUsers();

    return () => {
      unsubChat();
      unsubContacts();
    };
  }, []);

  const handleRefresh = async () => {
    setRefreshing(true);
    await chatStore.fetchConversations();
    setRefreshing(false);
  };

  const handleSendMessage = async (text: string, attachments: UploadedFile[]) => {
    await chatStore.sendDirectMessage(text, attachments);
  };

  const handleSaveEdit = async (text: string) => {
    if (!editingMessage) return;
    await chatStore.editMessage(editingMessage.id, text, 'dm');
    setEditingMessage(null);
  };

  const handleDeleteMessage = async (message: ChatMessage, mode: 'me' | 'everyone') => {
    const result = await chatStore.deleteMessage(message.id, mode, 'dm');
    if (!result.success) {
      Alert.alert('Delete Failed', result.error || 'Could not delete this message.');
    }
  };

  const handleToggleReaction = async (message: ChatMessage, emoji: string) => {
    await chatStore.toggleReaction(message.id, emoji, 'dm');
  };

  const handleStartCall = (type: 'audio' | 'video') => {
    const conv = chatState.activeConversation;
    if (!conv || !conv.recipient) return;
    callStore.initiateCall(
      {
        id: conv.recipient.id,
        name: conv.recipient.display_name,
        avatar: conv.recipient.avatar_url,
      },
      type,
      conv.id
    );
  };

  const handleStartNewChatWithUser = async (user: UserContact) => {
    setNewChatModalVisible(false);
    await chatStore.startOrOpenDirectChat(user.id);
  };

  // -------------------------------------------------------------
  // Inside Direct Chat Room View
  // -------------------------------------------------------------
  const { activeConversation, messages, isLoading } = chatState;

  if (activeConversation) {
    const recipient = activeConversation.recipient;
    const isOnline = recipient?.presence === 'available' || recipient?.presence === 'online';

    return (
      <KeyboardAvoidingView
        style={styles.container}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        {/* Chat Room Header */}
        <View style={styles.roomHeader}>
          <TouchableOpacity
            style={styles.backBtn}
            onPress={() => chatStore.closeActiveConversation()}
            activeOpacity={0.7}
          >
            <Text style={styles.backBtnText}>‹</Text>
          </TouchableOpacity>

          <View style={styles.avatarWrap}>
            <Avatar
              name={recipient?.display_name || activeConversation.title || 'Colleague'}
              avatarUrl={recipient?.avatar_url}
              size={36}
            />
            <View
              style={[
                styles.roomPresenceDot,
                { backgroundColor: isOnline ? Colors.emerald : Colors.textMuted },
              ]}
            />
          </View>

          <View style={styles.roomTitleBlock}>
            <Text style={styles.roomTitle} numberOfLines={1}>
              {recipient?.display_name || activeConversation.title || 'Direct Message'}
            </Text>
            <Text style={styles.roomStatus}>
              {isOnline ? 'Online now' : 'Offline'}
            </Text>
          </View>

          {/* Action Call Buttons */}
          <View style={styles.callBtnsRow}>
            <TouchableOpacity
              style={styles.iconCallBtn}
              onPress={() => handleStartCall('audio')}
              activeOpacity={0.7}
            >
              <Text style={styles.callBtnEmoji}>📞</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.iconCallBtn}
              onPress={() => handleStartCall('video')}
              activeOpacity={0.7}
            >
              <Text style={styles.callBtnEmoji}>📹</Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* Message Thread */}
        {isLoading && messages.length === 0 ? (
          <View style={styles.centerLoading}>
            <ActivityIndicator color={Colors.primary} size="large" />
            <Text style={styles.loadingText}>Loading conversation history...</Text>
          </View>
        ) : (
          <FlatList
            ref={flatListRef}
            data={messages}
            keyExtractor={(item) => item.id}
            contentContainerStyle={styles.messagesList}
            onContentSizeChange={() => flatListRef.current?.scrollToEnd({ animated: true })}
            ListEmptyComponent={
              <View style={styles.emptyContainer}>
                <View style={styles.emptyChatIcon}>
                  <Text style={styles.emptyChatIconText}>💬</Text>
                </View>
                <Text style={styles.emptyTitle}>Direct Discussion</Text>
                <Text style={styles.emptySubtitle}>
                  Send your first message to start talking with {recipient?.display_name || 'colleague'}.
                </Text>
              </View>
            }
            renderItem={({ item }) => (
              <MessageItem
                message={item}
                showSenderName={false}
                onEdit={(m) => setEditingMessage(m)}
                onDelete={handleDeleteMessage}
                onToggleReaction={handleToggleReaction}
              />
            )}
          />
        )}

        {/* Bottom Input Box */}
        <MessageComposer
          onSend={handleSendMessage}
          editingMessage={editingMessage}
          onSaveEdit={handleSaveEdit}
          onCancelEdit={() => setEditingMessage(null)}
          placeholder={`Message ${recipient?.display_name || 'colleague'}...`}
        />
      </KeyboardAvoidingView>
    );
  }

  // -------------------------------------------------------------
  // Conversations Inbox List View
  // -------------------------------------------------------------
  const { conversations } = chatState;
  const filteredConvs = conversations.filter((c) => {
    if (!searchQuery.trim()) return true;
    const name = c.recipient?.display_name || c.title || '';
    return name.toLowerCase().includes(searchQuery.toLowerCase());
  });

  return (
    <View style={styles.container}>
      {/* Search & New Chat Action Header */}
      <View style={styles.inboxHeader}>
        <View style={styles.searchBar}>
          <Text style={styles.searchIcon}>🔍</Text>
          <TextInput
            style={styles.searchInput}
            value={searchQuery}
            onChangeText={setSearchQuery}
            placeholder="Search conversations..."
            placeholderTextColor={Colors.textMuted}
            autoCapitalize="none"
          />
        </View>

        <TouchableOpacity
          style={styles.newChatBtn}
          onPress={() => setNewChatModalVisible(true)}
          activeOpacity={0.8}
        >
          <Text style={styles.newChatBtnText}>+ New</Text>
        </TouchableOpacity>
      </View>

      {/* Conversations List */}
      {isLoading && conversations.length === 0 ? (
        <View style={styles.centerLoading}>
          <ActivityIndicator color={Colors.primary} size="large" />
          <Text style={styles.loadingText}>Fetching messages...</Text>
        </View>
      ) : (
        <FlatList
          data={filteredConvs}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.convsList}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={handleRefresh}
              tintColor={Colors.primary}
            />
          }
          ListEmptyComponent={
            <View style={styles.emptyContainer}>
              <Text style={styles.emptyIcon}>💬</Text>
              <Text style={styles.emptyTitle}>No Direct Messages</Text>
              <Text style={styles.emptySubtitle}>
                Tap "+ New" above to start a direct message with any colleague in your workspace.
              </Text>
              <TouchableOpacity
                style={styles.emptyActionBtn}
                onPress={() => setNewChatModalVisible(true)}
              >
                <Text style={styles.emptyActionBtnText}>Start Conversation</Text>
              </TouchableOpacity>
            </View>
          }
          renderItem={({ item }) => {
            const recipient = item.recipient;
            const displayName = recipient?.display_name || item.title || 'Colleague';
            const isOnline = recipient?.presence === 'available' || recipient?.presence === 'online';

            return (
              <TouchableOpacity
                style={styles.convItem}
                onPress={() => chatStore.selectConversation(item)}
                activeOpacity={0.7}
              >
                <View style={styles.avatarWrap}>
                  <Avatar
                    name={displayName}
                    avatarUrl={recipient?.avatar_url}
                    size={44}
                  />
                  <View
                    style={[
                      styles.presenceDot,
                      { backgroundColor: isOnline ? Colors.emerald : Colors.textMuted },
                    ]}
                  />
                </View>

                <View style={styles.convDetails}>
                  <View style={styles.convTitleRow}>
                    <Text style={styles.convName} numberOfLines={1}>
                      {displayName}
                    </Text>
                    <Text style={styles.convTime}>{item.lastMessageTime}</Text>
                  </View>

                  <View style={styles.convBottomRow}>
                    <Text style={styles.convLastMsg} numberOfLines={1}>
                      {item.lastMessage || 'No messages yet'}
                    </Text>
                    {item.unreadCount && item.unreadCount > 0 ? (
                      <View style={styles.unreadBadge}>
                        <Text style={styles.unreadText}>{item.unreadCount}</Text>
                      </View>
                    ) : null}
                  </View>
                </View>
              </TouchableOpacity>
            );
          }}
        />
      )}

      {/* New Chat User Picker Modal */}
      <Modal
        visible={newChatModalVisible}
        transparent
        animationType="slide"
        onRequestClose={() => setNewChatModalVisible(false)}
      >
        <View style={styles.modalBackdrop}>
          <View style={styles.modalCard}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>New Direct Message</Text>
              <TouchableOpacity
                style={styles.closeBtn}
                onPress={() => setNewChatModalVisible(false)}
              >
                <Text style={styles.closeBtnText}>✕</Text>
              </TouchableOpacity>
            </View>

            <Text style={styles.modalSub}>
              Select a colleague from your workspace directory to start a chat:
            </Text>

            <FlatList
              data={contactsState.users}
              keyExtractor={(u) => u.id}
              style={styles.usersPickerList}
              renderItem={({ item }) => (
                <TouchableOpacity
                  style={styles.userPickerItem}
                  onPress={() => handleStartNewChatWithUser(item)}
                  activeOpacity={0.7}
                >
                  <Avatar
                    name={item.display_name || item.username}
                    avatarUrl={item.avatar_url}
                    size={38}
                  />
                  <View style={styles.userPickerInfo}>
                    <Text style={styles.userPickerName}>
                      {item.display_name || item.username}
                    </Text>
                    <Text style={styles.userPickerEmail}>{item.email}</Text>
                  </View>
                  <Text style={styles.startArrow}>›</Text>
                </TouchableOpacity>
              )}
            />
          </View>
        </View>
      </Modal>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  inboxHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    paddingBottom: 12,
    backgroundColor: Colors.surface,
    borderBottomWidth: 1,
    borderBottomColor: Colors.surfaceBorder,
    gap: 10,
  },
  searchBar: {
    flex: 1,
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
  newChatBtn: {
    backgroundColor: Colors.primary,
    paddingHorizontal: 14,
    paddingVertical: 9,
    borderRadius: 12,
  },
  newChatBtnText: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '700',
  },
  convsList: {
    padding: 12,
    gap: 8,
  },
  convItem: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.surface,
    padding: 14,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: Colors.surfaceBorder,
    gap: 12,
  },
  avatarWrap: {
    position: 'relative',
  },
  presenceDot: {
    position: 'absolute',
    bottom: -1,
    right: -1,
    width: 12,
    height: 12,
    borderRadius: 6,
    borderWidth: 2,
    borderColor: Colors.surface,
  },
  convDetails: {
    flex: 1,
  },
  convTitleRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 4,
  },
  convName: {
    color: Colors.textPrimary,
    fontSize: 15,
    fontWeight: '600',
    flex: 1,
  },
  convTime: {
    color: Colors.textMuted,
    fontSize: 11,
    marginLeft: 8,
  },
  convBottomRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  convLastMsg: {
    color: Colors.textSecondary,
    fontSize: 12.5,
    flex: 1,
  },
  unreadBadge: {
    backgroundColor: Colors.primary,
    borderRadius: 10,
    paddingHorizontal: 7,
    paddingVertical: 2,
    marginLeft: 6,
  },
  unreadText: {
    color: '#FFFFFF',
    fontSize: 10.5,
    fontWeight: '800',
  },

  // Room view
  roomHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 10,
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
  roomPresenceDot: {
    position: 'absolute',
    bottom: -1,
    right: -1,
    width: 10,
    height: 10,
    borderRadius: 5,
    borderWidth: 1.5,
    borderColor: Colors.surface,
  },
  roomTitleBlock: {
    flex: 1,
  },
  roomTitle: {
    color: Colors.textPrimary,
    fontSize: 15,
    fontWeight: '700',
  },
  roomStatus: {
    color: Colors.textSecondary,
    fontSize: 11,
    marginTop: 1,
  },
  callBtnsRow: {
    flexDirection: 'row',
    gap: 6,
  },
  iconCallBtn: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: Colors.surfaceLight,
    borderWidth: 1,
    borderColor: Colors.surfaceBorder,
    alignItems: 'center',
    justifyContent: 'center',
  },
  callBtnEmoji: {
    fontSize: 15,
  },
  messagesList: {
    padding: 16,
    gap: 12,
  },
  msgRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 8,
  },
  msgRowLeft: {
    justifyContent: 'flex-start',
  },
  msgRowRight: {
    justifyContent: 'flex-end',
  },
  bubbleWrapper: {
    maxWidth: '75%',
  },
  bubbleWrapperRight: {
    alignItems: 'flex-end',
  },
  bubble: {
    borderRadius: 16,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  bubbleMe: {
    backgroundColor: Colors.primary,
    borderBottomRightRadius: 4,
  },
  bubbleThem: {
    backgroundColor: Colors.surfaceElevated,
    borderWidth: 1,
    borderColor: Colors.surfaceBorder,
    borderBottomLeftRadius: 4,
  },
  msgText: {
    fontSize: 14,
    lineHeight: 20,
  },
  msgTextMe: {
    color: '#FFFFFF',
  },
  msgTextThem: {
    color: Colors.textPrimary,
  },
  bubbleFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-end',
    marginTop: 4,
  },
  timestamp: {
    fontSize: 9.5,
  },
  timeMe: {
    color: 'rgba(255, 255, 255, 0.7)',
  },
  timeThem: {
    color: Colors.textMuted,
  },
  readReceipt: {
    color: Colors.cyan,
    fontSize: 10,
    fontWeight: '800',
  },
  inputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 10,
    backgroundColor: Colors.surface,
    borderTopWidth: 1,
    borderTopColor: Colors.surfaceBorder,
    gap: 8,
  },
  textInput: {
    flex: 1,
    backgroundColor: Colors.surfaceLight,
    borderWidth: 1,
    borderColor: Colors.surfaceBorder,
    borderRadius: 20,
    paddingHorizontal: 16,
    paddingVertical: 10,
    color: Colors.textPrimary,
    fontSize: 14,
    maxHeight: 100,
  },
  sendBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: Colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sendBtnDisabled: {
    opacity: 0.4,
  },
  sendBtnText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '800',
    marginLeft: 2,
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
  emptyChatIcon: {
    width: 54,
    height: 54,
    borderRadius: 18,
    backgroundColor: Colors.surfaceLight,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 12,
  },
  emptyChatIconText: {
    fontSize: 24,
  },

  // Modal
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(5, 7, 11, 0.85)',
    justifyContent: 'flex-end',
  },
  modalCard: {
    backgroundColor: Colors.surface,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    borderTopWidth: 1,
    borderColor: Colors.surfaceBorder,
    padding: 20,
    maxHeight: '80%',
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 6,
  },
  modalTitle: {
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
  closeBtnText: {
    color: Colors.textSecondary,
    fontSize: 14,
    fontWeight: '700',
  },
  modalSub: {
    color: Colors.textSecondary,
    fontSize: 12,
    marginBottom: 16,
  },
  usersPickerList: {
    marginBottom: 16,
  },
  userPickerItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: Colors.surfaceBorder,
    gap: 12,
  },
  userPickerInfo: {
    flex: 1,
  },
  userPickerName: {
    color: Colors.textPrimary,
    fontSize: 14.5,
    fontWeight: '600',
  },
  userPickerEmail: {
    color: Colors.textSecondary,
    fontSize: 11.5,
    marginTop: 2,
  },
  startArrow: {
    color: Colors.textMuted,
    fontSize: 22,
  },
});
