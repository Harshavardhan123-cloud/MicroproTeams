import React, { useState, useEffect } from 'react';
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
} from 'react-native';
import { Colors } from '../theme/colors';
import { Avatar } from '../components/common/Avatar';
import { chatStore, Conversation, ChatMessage } from '../stores/chatStore';
import { callStore, CallParticipant } from '../stores/callStore';
import { authStore } from '../stores/authStore';

export const ChatsScreen: React.FC = () => {
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [activeConv, setActiveConv] = useState<Conversation | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [inputText, setInputText] = useState('');
  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => {
    const unsub = chatStore.subscribe(() => {
      const state = chatStore.getState();
      setConversations(state.conversations);
      setActiveConv(state.activeConversation);
      setMessages(state.messages);
    });

    chatStore.fetchConversations();
    return () => unsub();
  }, []);

  const handleRefresh = async () => {
    setRefreshing(true);
    await chatStore.fetchConversations();
    setRefreshing(false);
  };

  const handleSendMessage = () => {
    if (!inputText.trim()) return;
    chatStore.sendMessage(inputText);
    setInputText('');
  };

  // Start 1-to-1 or group call from conversation
  const handleStartCall = (type: 'audio' | 'video') => {
    if (!activeConv) return;
    const recipient: CallParticipant = {
      id: activeConv.recipientId || activeConv.id,
      name: activeConv.name.replace(/^#\s*/, ''),
      avatar: activeConv.avatar,
    };
    callStore.initiateCall(recipient, type, activeConv.id);
  };

  // If inside an active conversation
  if (activeConv) {
    return (
      <KeyboardAvoidingView
        style={styles.container}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        {/* Chat Room Header */}
        <View style={styles.roomHeader}>
          <TouchableOpacity
            style={styles.backButton}
            onPress={() => chatStore.closeActiveConversation()}
          >
            <Text style={styles.backText}>‹</Text>
          </TouchableOpacity>

          <Avatar
            name={activeConv.name.replace(/^#\s*/, '')}
            avatarUrl={activeConv.avatar}
            size={36}
          />

          <View style={styles.roomTitleBlock}>
            <Text style={styles.roomName}>{activeConv.name}</Text>
            <Text style={styles.roomStatus}>
              {activeConv.type === 'channel' ? 'Channel Discussion' : 'Direct Message'}
            </Text>
          </View>

          {/* Quick Call Initiation Action Buttons */}
          <View style={styles.callButtonsRow}>
            <TouchableOpacity
              style={styles.iconCallBtn}
              onPress={() => handleStartCall('audio')}
              activeOpacity={0.7}
            >
              <Text style={styles.callIconEmoji}>📞</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.iconCallBtn, styles.iconCallBtnVideo]}
              onPress={() => handleStartCall('video')}
              activeOpacity={0.7}
            >
              <Text style={styles.callIconEmoji}>📹</Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* Messages List */}
        <FlatList
          data={messages}
          keyExtractor={(item) => item.id}
          style={styles.messagesList}
          contentContainerStyle={styles.messagesContent}
          renderItem={({ item }) => (
            <View
              style={[
                styles.messageRow,
                item.is_outgoing ? styles.messageOutgoing : styles.messageIncoming,
              ]}
            >
              {!item.is_outgoing ? (
                <Avatar
                  name={item.sender_name}
                  avatarUrl={item.sender_avatar}
                  size={28}
                />
              ) : null}

              <View
                style={[
                  styles.bubble,
                  item.is_outgoing ? styles.bubbleOutgoing : styles.bubbleIncoming,
                ]}
              >
                {!item.is_outgoing ? (
                  <Text style={styles.senderLabel}>{item.sender_name}</Text>
                ) : null}
                <Text
                  style={[
                    styles.messageText,
                    item.is_outgoing ? styles.textWhite : styles.textLight,
                  ]}
                >
                  {item.content}
                </Text>
                <Text style={styles.messageTime}>
                  {new Date(item.created_at).toLocaleTimeString([], {
                    hour: '2-digit',
                    minute: '2-digit',
                  })}
                </Text>
              </View>
            </View>
          )}
        />

        {/* Input Bar */}
        <View style={styles.inputBar}>
          <TextInput
            style={styles.chatInput}
            placeholder={`Message ${activeConv.name}...`}
            placeholderTextColor={Colors.textMuted}
            value={inputText}
            onChangeText={setInputText}
            multiline
          />
          <TouchableOpacity
            style={[styles.sendButton, !inputText.trim() && styles.sendButtonDisabled]}
            onPress={handleSendMessage}
            disabled={!inputText.trim()}
          >
            <Text style={styles.sendIcon}>➤</Text>
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    );
  }

  // Conversation List (Channels & Direct Messages)
  return (
    <View style={styles.container}>
      <FlatList
        data={conversations}
        keyExtractor={(item) => item.id}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={handleRefresh}
            tintColor={Colors.primary}
          />
        }
        contentContainerStyle={styles.convListContent}
        renderItem={({ item }) => (
          <TouchableOpacity
            style={styles.convItem}
            onPress={() => chatStore.selectConversation(item)}
            activeOpacity={0.7}
          >
            <Avatar
              name={item.name.replace(/^#\s*/, '')}
              avatarUrl={item.avatar}
              size={48}
              showStatus={item.type === 'direct'}
            />

            <View style={styles.convDetails}>
              <View style={styles.convTopRow}>
                <Text style={styles.convName}>{item.name}</Text>
                {item.lastMessageTime ? (
                  <Text style={styles.convTime}>{item.lastMessageTime}</Text>
                ) : null}
              </View>

              <Text style={styles.convSnippet} numberOfLines={1}>
                {item.lastMessage || 'No recent messages'}
              </Text>
            </View>
          </TouchableOpacity>
        )}
      />
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  convListContent: {
    padding: 16,
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
  },
  convDetails: {
    flex: 1,
    marginLeft: 14,
  },
  convTopRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 4,
  },
  convName: {
    color: Colors.textPrimary,
    fontSize: 15,
    fontWeight: '700',
  },
  convTime: {
    color: Colors.textMuted,
    fontSize: 11,
  },
  convSnippet: {
    color: Colors.textSecondary,
    fontSize: 13,
  },
  roomHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.surface,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: Colors.surfaceBorder,
    gap: 10,
  },
  backButton: {
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  backText: {
    color: Colors.textPrimary,
    fontSize: 28,
    fontWeight: '300',
  },
  roomTitleBlock: {
    flex: 1,
  },
  roomName: {
    color: Colors.textPrimary,
    fontSize: 15,
    fontWeight: '700',
  },
  roomStatus: {
    color: Colors.textMuted,
    fontSize: 11,
  },
  callButtonsRow: {
    flexDirection: 'row',
    gap: 8,
  },
  iconCallBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: Colors.surfaceLight,
    borderWidth: 1,
    borderColor: Colors.surfaceBorder,
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconCallBtnVideo: {
    backgroundColor: 'rgba(99, 102, 241, 0.15)',
    borderColor: 'rgba(99, 102, 241, 0.3)',
  },
  callIconEmoji: {
    fontSize: 16,
  },
  messagesList: {
    flex: 1,
  },
  messagesContent: {
    padding: 16,
    gap: 12,
  },
  messageRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 8,
  },
  messageIncoming: {
    justifyContent: 'flex-start',
  },
  messageOutgoing: {
    justifyContent: 'flex-end',
  },
  bubble: {
    maxWidth: '75%',
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 18,
  },
  bubbleIncoming: {
    backgroundColor: Colors.surfaceLight,
    borderWidth: 1,
    borderColor: Colors.surfaceBorder,
    borderBottomLeftRadius: 4,
  },
  bubbleOutgoing: {
    backgroundColor: Colors.primary,
    borderBottomRightRadius: 4,
  },
  senderLabel: {
    color: Colors.teamsPurpleLight,
    fontSize: 11,
    fontWeight: '700',
    marginBottom: 4,
  },
  messageText: {
    fontSize: 14,
    lineHeight: 20,
  },
  textWhite: {
    color: '#FFFFFF',
  },
  textLight: {
    color: Colors.textPrimary,
  },
  messageTime: {
    color: 'rgba(255, 255, 255, 0.6)',
    fontSize: 10,
    marginTop: 4,
    alignSelf: 'flex-end',
  },
  inputBar: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.surface,
    padding: 10,
    borderTopWidth: 1,
    borderTopColor: Colors.surfaceBorder,
    gap: 10,
  },
  chatInput: {
    flex: 1,
    backgroundColor: Colors.surfaceLight,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: Colors.surfaceBorder,
    paddingHorizontal: 16,
    paddingVertical: 8,
    color: Colors.textPrimary,
    fontSize: 14,
    maxHeight: 100,
  },
  sendButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: Colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sendButtonDisabled: {
    opacity: 0.4,
  },
  sendIcon: {
    color: '#FFFFFF',
    fontSize: 16,
  },
});
