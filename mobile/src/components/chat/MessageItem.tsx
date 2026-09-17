import React, { useMemo, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { MessageSquare } from 'lucide-react-native';
import { Colors } from '../../theme/colors';
import { Avatar } from '../common/Avatar';
import { ActionSheet, ActionSheetOption } from '../common/ActionSheet';
import { AttachmentCard } from './AttachmentCard';
import { DeleteMessageModal } from '../modals/DeleteMessageModal';
import { authStore } from '../../stores/authStore';
import { ChatMessage } from '../../stores/chatStore';

interface MessageItemProps {
  message: ChatMessage;
  onEdit?: (message: ChatMessage) => void;
  onDelete?: (message: ChatMessage, mode: 'me' | 'everyone') => void;
  onToggleReaction?: (message: ChatMessage, emoji: string) => void;
  // Only provided by callers that support threading (channel messages).
  // When omitted, "Reply in Thread" and the reply-count badge are hidden.
  onOpenThread?: (message: ChatMessage) => void;
  showSenderName?: boolean;
  avatarSize?: number;
}

const QUICK_EMOJIS = ['👍', '❤️', '😂', '🎉', '😮', '😢'];

// Matches the `[Attachment: name](url)` convention encoded by
// MessageComposer / the web frontend byte-for-byte.
const ATTACHMENT_TAG_REGEX = /\[Attachment:\s*([^\]]+)\]\(([^)]+)\)/gi;
const ATTACHMENT_STRIP_REGEX = /\[Attachment:\s*[^\]]+\]\([^)]+\)/gi;

function parseAttachments(content: string): { name: string; url: string }[] {
  const results: { name: string; url: string }[] = [];
  const regex = new RegExp(ATTACHMENT_TAG_REGEX);
  let match: RegExpExecArray | null;
  while ((match = regex.exec(content)) !== null) {
    results.push({ name: match[1].trim(), url: match[2].trim() });
  }
  return results;
}

export const MessageItem: React.FC<MessageItemProps> = ({
  message,
  onEdit,
  onDelete,
  onToggleReaction,
  onOpenThread,
  showSenderName = true,
  avatarSize = 30,
}) => {
  const [showEmojiRow, setShowEmojiRow] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [showMenu, setShowMenu] = useState(false);

  const isMe = !!message.is_outgoing;
  const currentUserId = authStore.getState().user?.id;

  const attachments = useMemo(() => parseAttachments(message.content || ''), [message.content]);
  const displayContent = useMemo(
    () => (message.content || '').replace(ATTACHMENT_STRIP_REGEX, '').trim(),
    [message.content]
  );

  const groupedReactions = useMemo(() => {
    const map = new Map<string, { count: number; reactedByMe: boolean }>();
    (message.reactions || []).forEach((r) => {
      const existing = map.get(r.emoji) || { count: 0, reactedByMe: false };
      existing.count += 1;
      if (r.user_id === currentUserId) existing.reactedByMe = true;
      map.set(r.emoji, existing);
    });
    return Array.from(map.entries()).map(([emoji, v]) => ({ emoji, ...v }));
  }, [message.reactions, currentUserId]);

  const formattedTime = new Date(message.created_at).toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit',
  });

  const canOpenThread = !!onOpenThread && !message.parent_message_id && !!message.channel_id;

  // Built as a themed bottom sheet rather than Alert.alert: Android's Alert
  // renders at most three buttons and silently drops any beyond that, which
  // hid "Delete" entirely once React / Reply in Thread / Edit were present.
  const menuOptions = useMemo(() => {
    const options: ActionSheetOption[] = [
      { label: 'React', onPress: () => setShowEmojiRow(true) },
    ];

    if (canOpenThread) {
      options.push({
        label: message.reply_count
          ? `View ${message.reply_count} ${message.reply_count === 1 ? 'Reply' : 'Replies'}`
          : 'Reply in Thread',
        onPress: () => onOpenThread?.(message),
      });
    }

    if (isMe) {
      options.push({ label: 'Edit', onPress: () => onEdit?.(message) });
      options.push({
        label: 'Delete',
        destructive: true,
        onPress: () => setShowDeleteModal(true),
      });
    }

    return options;
  }, [canOpenThread, isMe, message, onEdit, onOpenThread]);

  const handleLongPress = () => setShowMenu(true);

  return (
    <View style={[styles.row, isMe ? styles.rowRight : styles.rowLeft]}>
      {!isMe && <Avatar name={message.sender_name} avatarUrl={message.sender_avatar} size={avatarSize} />}

      <View style={[styles.bubbleWrapper, isMe && styles.bubbleWrapperRight]}>
        {!isMe && showSenderName && <Text style={styles.senderLabel}>{message.sender_name}</Text>}

        <TouchableOpacity
          activeOpacity={0.85}
          onLongPress={handleLongPress}
          delayLongPress={280}
          style={[styles.bubble, isMe ? styles.bubbleMe : styles.bubbleThem]}
        >
          {attachments.length > 0 && (
            <View style={styles.attachmentsStack}>
              {attachments.map((att, idx) => (
                <AttachmentCard key={`${att.url}-${idx}`} name={att.name} url={att.url} />
              ))}
            </View>
          )}

          {displayContent.length > 0 && (
            <Text style={[styles.msgText, isMe ? styles.msgTextMe : styles.msgTextThem]}>
              {displayContent}
            </Text>
          )}

          <View style={styles.bubbleFooter}>
            <Text style={[styles.timestamp, isMe ? styles.timeMe : styles.timeThem]}>{formattedTime}</Text>
            {message.is_edited && (
              <Text style={[styles.editedLabel, isMe ? styles.timeMe : styles.timeThem]}> · edited</Text>
            )}
          </View>
        </TouchableOpacity>

        {(groupedReactions.length > 0 || showEmojiRow) && (
          <View style={[styles.reactionsRow, isMe && styles.reactionsRowRight]}>
            {groupedReactions.map((r) => (
              <TouchableOpacity
                key={r.emoji}
                style={[styles.reactionPill, r.reactedByMe && styles.reactionPillActive]}
                onPress={() => onToggleReaction?.(message, r.emoji)}
                activeOpacity={0.7}
              >
                <Text style={styles.reactionEmoji}>{r.emoji}</Text>
                <Text style={styles.reactionCount}>{r.count}</Text>
              </TouchableOpacity>
            ))}

            {showEmojiRow &&
              QUICK_EMOJIS.map((emoji) => (
                <TouchableOpacity
                  key={emoji}
                  style={styles.emojiPickerBtn}
                  onPress={() => {
                    onToggleReaction?.(message, emoji);
                    setShowEmojiRow(false);
                  }}
                  activeOpacity={0.7}
                >
                  <Text style={styles.reactionEmoji}>{emoji}</Text>
                </TouchableOpacity>
              ))}
          </View>
        )}

        {canOpenThread && (message.reply_count || 0) > 0 && (
          <TouchableOpacity
            style={[styles.threadBadge, isMe && styles.threadBadgeRight]}
            onPress={() => onOpenThread?.(message)}
            activeOpacity={0.7}
          >
            <MessageSquare size={11} color={Colors.primary} />
            <Text style={styles.threadBadgeText}>
              {message.reply_count} {message.reply_count === 1 ? 'reply' : 'replies'}
            </Text>
          </TouchableOpacity>
        )}
      </View>

      <ActionSheet
        visible={showMenu}
        title={message.sender_name}
        options={menuOptions}
        onClose={() => setShowMenu(false)}
      />

      <DeleteMessageModal
        visible={showDeleteModal}
        onClose={() => setShowDeleteModal(false)}
        onConfirm={(mode) => {
          setShowDeleteModal(false);
          onDelete?.(message, mode);
        }}
      />
    </View>
  );
};

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 8,
  },
  rowLeft: {
    justifyContent: 'flex-start',
  },
  rowRight: {
    justifyContent: 'flex-end',
  },
  bubbleWrapper: {
    maxWidth: '78%',
  },
  bubbleWrapperRight: {
    alignItems: 'flex-end',
  },
  senderLabel: {
    color: Colors.textMuted,
    fontSize: 11,
    fontWeight: '600',
    marginBottom: 4,
    marginLeft: 4,
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
  attachmentsStack: {
    gap: 6,
    marginBottom: 6,
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
  editedLabel: {
    fontSize: 9.5,
    fontStyle: 'italic',
  },
  timeMe: {
    color: 'rgba(255, 255, 255, 0.7)',
  },
  timeThem: {
    color: Colors.textMuted,
  },
  reactionsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 5,
    marginTop: 5,
  },
  reactionsRowRight: {
    justifyContent: 'flex-end',
  },
  reactionPill: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.surfaceLight,
    borderWidth: 1,
    borderColor: Colors.surfaceBorder,
    borderRadius: 999,
    paddingHorizontal: 8,
    paddingVertical: 3,
    gap: 4,
  },
  reactionPillActive: {
    borderColor: Colors.primary,
    backgroundColor: 'rgba(99, 102, 241, 0.15)',
  },
  reactionEmoji: {
    fontSize: 12,
  },
  reactionCount: {
    color: Colors.textMuted,
    fontSize: 10,
    fontWeight: '700',
  },
  emojiPickerBtn: {
    backgroundColor: Colors.surfaceLight,
    borderWidth: 1,
    borderColor: Colors.surfaceBorder,
    borderRadius: 999,
    paddingHorizontal: 7,
    paddingVertical: 3,
  },
  threadBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    marginTop: 6,
    alignSelf: 'flex-start',
  },
  threadBadgeRight: {
    alignSelf: 'flex-end',
  },
  threadBadgeText: {
    color: Colors.primary,
    fontSize: 11,
    fontWeight: '600',
  },
});
