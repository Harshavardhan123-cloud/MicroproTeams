import React, { useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { useNavigation, useRoute, RouteProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Colors } from '../theme/colors';
import { chatStore, ChatMessage } from '../stores/chatStore';
import { MessageItem } from '../components/chat/MessageItem';
import { MessageComposer } from '../components/chat/MessageComposer';
import type { UploadedFile } from '../services/fileUploadService';
import type { RootStackParamList } from '../navigation/types';

export const ThreadScreen: React.FC = () => {
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const route = useRoute<RouteProp<RootStackParamList, 'Thread'>>();
  const { channelId, messageId, channelName } = route.params;

  const [chatState, setChatState] = useState(chatStore.getState());
  const [rootMessage, setRootMessage] = useState<ChatMessage | null>(null);
  const [replies, setReplies] = useState<ChatMessage[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [editingMessage, setEditingMessage] = useState<ChatMessage | null>(null);
  const flatListRef = useRef<FlatList>(null);

  useEffect(() => {
    const unsub = chatStore.subscribe(() => setChatState(chatStore.getState()));
    return () => unsub();
  }, []);

  // The root message is normally already loaded into chatStore.channelMessages
  // since the user had to be viewing the channel to open this thread.
  useEffect(() => {
    const found = chatState.channelMessages.find((m) => m.id === messageId);
    if (found) setRootMessage(found);
  }, [chatState.channelMessages, messageId]);

  const loadReplies = async () => {
    setIsLoading(true);
    const data = await chatStore.fetchThreadReplies(messageId);
    setReplies(data);
    setIsLoading(false);
  };

  useEffect(() => {
    loadReplies();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [messageId]);

  const handleSend = async (text: string, attachments: UploadedFile[]) => {
    const created = await chatStore.sendThreadReply(channelId, messageId, text, attachments);
    if (created) {
      setReplies((prev) => [...prev, created]);
    }
  };

  const handleSaveEdit = async (text: string) => {
    if (!editingMessage) return;
    const updated = await chatStore.editMessage(editingMessage.id, text, 'channel');
    if (updated) {
      if (rootMessage?.id === updated.id) setRootMessage(updated);
      setReplies((prev) => prev.map((m) => (m.id === updated.id ? updated : m)));
    }
    setEditingMessage(null);
  };

  const handleDelete = async (message: ChatMessage, mode: 'me' | 'everyone') => {
    const result = await chatStore.deleteMessage(message.id, mode, 'channel');
    if (result.success) {
      setReplies((prev) => prev.filter((m) => m.id !== message.id));
      if (rootMessage?.id === message.id) {
        // The parent itself was deleted - nothing sensible left to reply to.
        navigation.goBack();
      }
    } else {
      Alert.alert('Delete Failed', result.error || 'Could not delete this message.');
    }
  };

  const handleToggleReaction = async (message: ChatMessage, emoji: string) => {
    const updated = await chatStore.toggleReaction(message.id, emoji, 'channel');
    if (updated) {
      if (rootMessage?.id === updated.id) setRootMessage(updated);
      setReplies((prev) => prev.map((m) => (m.id === updated.id ? updated : m)));
    }
  };

  return (
    <KeyboardAvoidingView style={styles.container} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      {/* Custom header (RootNavigator hides the native stack header globally) */}
      <View style={styles.header}>
        <TouchableOpacity style={styles.backBtn} onPress={() => navigation.goBack()} activeOpacity={0.7}>
          <Text style={styles.backBtnText}>‹</Text>
        </TouchableOpacity>
        <View style={styles.headerTitleBlock}>
          <Text style={styles.headerTitle}>Thread</Text>
          {channelName ? <Text style={styles.headerSubtitle}>#{channelName}</Text> : null}
        </View>
      </View>

      {isLoading ? (
        <View style={styles.centerLoading}>
          <ActivityIndicator color={Colors.primary} size="large" />
          <Text style={styles.loadingText}>Loading thread...</Text>
        </View>
      ) : (
        <FlatList
          ref={flatListRef}
          data={replies}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.listContent}
          onContentSizeChange={() => flatListRef.current?.scrollToEnd({ animated: true })}
          ListHeaderComponent={
            <View style={styles.rootSection}>
              {rootMessage ? (
                <MessageItem
                  message={rootMessage}
                  onEdit={(m) => setEditingMessage(m)}
                  onDelete={handleDelete}
                  onToggleReaction={handleToggleReaction}
                />
              ) : (
                <Text style={styles.rootPlaceholder}>Original message</Text>
              )}
              <View style={styles.divider} />
              <Text style={styles.repliesHeading}>
                {replies.length > 0 ? `${replies.length} ${replies.length === 1 ? 'Reply' : 'Replies'}` : 'No replies yet'}
              </Text>
            </View>
          }
          ListEmptyComponent={
            <View style={styles.emptyContainer}>
              <Text style={styles.emptySubtitle}>Be the first to reply in this thread.</Text>
            </View>
          }
          renderItem={({ item }) => (
            <View style={styles.replyRow}>
              <MessageItem
                message={item}
                onEdit={(m) => setEditingMessage(m)}
                onDelete={handleDelete}
                onToggleReaction={handleToggleReaction}
              />
            </View>
          )}
        />
      )}

      <MessageComposer
        onSend={handleSend}
        editingMessage={editingMessage}
        onSaveEdit={handleSaveEdit}
        onCancelEdit={() => setEditingMessage(null)}
        placeholder="Reply in thread..."
      />
    </KeyboardAvoidingView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
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
  headerTitleBlock: {
    flex: 1,
  },
  headerTitle: {
    color: Colors.textPrimary,
    fontSize: 16,
    fontWeight: '700',
  },
  headerSubtitle: {
    color: Colors.textSecondary,
    fontSize: 11,
    marginTop: 1,
  },
  listContent: {
    padding: 16,
    gap: 14,
  },
  rootSection: {
    marginBottom: 4,
  },
  rootPlaceholder: {
    color: Colors.textMuted,
    fontSize: 12.5,
    fontStyle: 'italic',
  },
  divider: {
    height: 1,
    backgroundColor: Colors.surfaceBorder,
    marginVertical: 16,
  },
  repliesHeading: {
    color: Colors.textMuted,
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 0.6,
    textTransform: 'uppercase',
  },
  replyRow: {
    marginBottom: 4,
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
    padding: 24,
  },
  emptySubtitle: {
    color: Colors.textSecondary,
    fontSize: 12.5,
    textAlign: 'center',
  },
});
