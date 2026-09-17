import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, TextInput, TouchableOpacity, ActivityIndicator } from 'react-native';
import { Paperclip, Send, X, Check } from 'lucide-react-native';
import { Colors } from '../../theme/colors';
import { pickAndUploadFile, UploadedFile } from '../../services/fileUploadService';
import { ChatMessage } from '../../stores/chatStore';

interface MessageComposerProps {
  onSend: (text: string, attachments: UploadedFile[]) => void | Promise<void>;
  editingMessage?: ChatMessage | null;
  onSaveEdit?: (text: string) => void | Promise<void>;
  onCancelEdit?: () => void;
  placeholder?: string;
}

export const MessageComposer: React.FC<MessageComposerProps> = ({
  onSend,
  editingMessage,
  onSaveEdit,
  onCancelEdit,
  placeholder = 'Type a message...',
}) => {
  const [text, setText] = useState('');
  const [attachments, setAttachments] = useState<UploadedFile[]>([]);
  const [uploading, setUploading] = useState(false);
  const [sending, setSending] = useState(false);

  const isEditing = !!editingMessage;

  useEffect(() => {
    if (editingMessage) {
      setText(editingMessage.content);
      setAttachments([]);
    } else {
      setText('');
    }
  }, [editingMessage?.id]);

  const handleAttach = async () => {
    if (uploading) return;
    setUploading(true);
    try {
      const uploaded = await pickAndUploadFile();
      if (uploaded) {
        setAttachments((prev) => [...prev, uploaded]);
      }
    } finally {
      setUploading(false);
    }
  };

  const handleRemoveAttachment = (index: number) => {
    setAttachments((prev) => prev.filter((_, i) => i !== index));
  };

  const canSend = (text.trim().length > 0 || attachments.length > 0) && !sending;

  const handlePress = async () => {
    if (!canSend) return;
    const trimmed = text.trim();

    setSending(true);
    try {
      if (isEditing) {
        await onSaveEdit?.(trimmed);
      } else {
        await onSend(trimmed, attachments);
        setText('');
        setAttachments([]);
      }
    } finally {
      setSending(false);
    }
  };

  return (
    <View style={styles.container}>
      {isEditing && (
        <View style={styles.editBanner}>
          <Text style={styles.editBannerText}>Editing message</Text>
          <TouchableOpacity onPress={onCancelEdit} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
            <Text style={styles.editBannerCancel}>Cancel</Text>
          </TouchableOpacity>
        </View>
      )}

      {attachments.length > 0 && (
        <View style={styles.attachmentsRow}>
          {attachments.map((att, idx) => (
            <View key={`${att.url}-${idx}`} style={styles.attachmentChip}>
              <Text style={styles.attachmentChipText} numberOfLines={1}>
                {att.name}
              </Text>
              <TouchableOpacity
                onPress={() => handleRemoveAttachment(idx)}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              >
                <X size={12} color={Colors.textMuted} />
              </TouchableOpacity>
            </View>
          ))}
        </View>
      )}

      <View style={styles.inputRow}>
        <TouchableOpacity
          style={styles.attachBtn}
          onPress={handleAttach}
          disabled={uploading || isEditing}
          activeOpacity={0.7}
        >
          {uploading ? (
            <ActivityIndicator size="small" color={Colors.primary} />
          ) : (
            <Paperclip size={18} color={isEditing ? Colors.textMuted : Colors.primary} />
          )}
        </TouchableOpacity>

        <TextInput
          style={styles.textInput}
          value={text}
          onChangeText={setText}
          placeholder={placeholder}
          placeholderTextColor={Colors.textMuted}
          multiline
        />

        <TouchableOpacity
          style={[styles.sendBtn, !canSend && styles.sendBtnDisabled]}
          onPress={handlePress}
          disabled={!canSend}
          activeOpacity={0.8}
        >
          {sending ? (
            <ActivityIndicator size="small" color="#FFFFFF" />
          ) : isEditing ? (
            <Check size={18} color="#FFFFFF" />
          ) : (
            <Send size={16} color="#FFFFFF" />
          )}
        </TouchableOpacity>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    backgroundColor: Colors.surface,
    borderTopWidth: 1,
    borderTopColor: Colors.surfaceBorder,
    paddingHorizontal: 12,
    paddingVertical: 10,
    gap: 8,
  },
  editBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: 'rgba(99, 102, 241, 0.12)',
    borderWidth: 1,
    borderColor: 'rgba(99, 102, 241, 0.3)',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 7,
  },
  editBannerText: {
    color: Colors.primary,
    fontSize: 11.5,
    fontWeight: '700',
  },
  editBannerCancel: {
    color: Colors.textSecondary,
    fontSize: 11.5,
    fontWeight: '600',
  },
  attachmentsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },
  attachmentChip: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.surfaceLight,
    borderWidth: 1,
    borderColor: Colors.surfaceBorder,
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 6,
    gap: 6,
    maxWidth: 180,
  },
  attachmentChipText: {
    color: Colors.textPrimary,
    fontSize: 11,
    fontWeight: '600',
    flexShrink: 1,
  },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  attachBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.surfaceLight,
    borderWidth: 1,
    borderColor: Colors.surfaceBorder,
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
});
