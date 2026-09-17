import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Image,
  ActivityIndicator,
  Alert,
  Share,
  Linking,
} from 'react-native';
import { FileText, FileSpreadsheet, Archive, Presentation, FileCode, File, Download, LucideIcon } from 'lucide-react-native';
import { Colors } from '../../theme/colors';
import { getMediaUrl } from '../../api/client';

interface AttachmentCardProps {
  name: string;
  url: string;
  size?: number;
  mimeType?: string;
}

export const formatFileSize = (bytes?: number): string => {
  if (!bytes) return '';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
};

interface FileTypeInfo {
  label: string;
  color: string;
  icon: LucideIcon;
}

// Simplified port of frontend/src/components/chat/AttachmentCard.tsx's
// extension-to-icon/color mapping, using lucide-react-native icons and the
// mobile theme's accent colors instead of Tailwind classes.
export const getFileTypeInfo = (fileName: string, mimeType?: string): FileTypeInfo => {
  const ext = (fileName.split('.').pop() || '').toLowerCase();

  if (ext === 'pdf' || mimeType?.includes('pdf')) {
    return { label: 'PDF', color: Colors.rose, icon: FileText };
  }
  if (
    ['xlsx', 'xls', 'csv'].includes(ext) ||
    mimeType?.includes('spreadsheet') ||
    mimeType?.includes('excel') ||
    mimeType?.includes('csv')
  ) {
    return { label: ext ? ext.toUpperCase() : 'EXCEL', color: Colors.emerald, icon: FileSpreadsheet };
  }
  if (['doc', 'docx'].includes(ext) || mimeType?.includes('word') || mimeType?.includes('wordprocessing')) {
    return { label: 'DOCX', color: Colors.cyan, icon: FileText };
  }
  if (
    ['ppt', 'pptx'].includes(ext) ||
    mimeType?.includes('presentation') ||
    mimeType?.includes('powerpoint')
  ) {
    return { label: 'PPTX', color: Colors.amber, icon: Presentation };
  }
  if (
    ['zip', 'rar', '7z', 'tar', 'gz'].includes(ext) ||
    mimeType?.includes('zip') ||
    mimeType?.includes('compressed') ||
    mimeType?.includes('archive')
  ) {
    return { label: ext ? ext.toUpperCase() : 'ZIP', color: Colors.violet, icon: Archive };
  }
  if (['js', 'ts', 'jsx', 'tsx', 'json', 'py', 'html', 'css'].includes(ext)) {
    return { label: ext.toUpperCase(), color: Colors.cyan, icon: FileCode };
  }

  return { label: ext ? ext.toUpperCase() : 'FILE', color: Colors.primary, icon: File };
};

const IMAGE_EXTENSIONS = ['png', 'jpg', 'jpeg', 'gif', 'webp'];

export const AttachmentCard: React.FC<AttachmentCardProps> = ({ name, url, size, mimeType }) => {
  const [imgFailed, setImgFailed] = useState(false);
  const [downloading, setDownloading] = useState(false);

  const mediaUrl = getMediaUrl(url);
  const ext = (name.split('.').pop() || '').toLowerCase();
  const isImage = !imgFailed && (mimeType?.startsWith('image/') || IMAGE_EXTENSIONS.includes(ext));
  const typeInfo = getFileTypeInfo(name, mimeType);
  const IconComponent = typeInfo.icon;

  // Attachments are opened/saved through the platform itself rather than a
  // bundled filesystem module: the system browser handles the actual download
  // (respecting the OS download folder and permissions), and the share sheet
  // covers "save to Files/Drive" and forwarding.
  const openAttachment = async () => {
    if (!mediaUrl || downloading) return;
    setDownloading(true);
    try {
      await Linking.openURL(mediaUrl);
    } catch (err: any) {
      Alert.alert('Cannot Open Attachment', err?.message || 'No app is available to open this file.');
    } finally {
      setDownloading(false);
    }
  };

  const shareAttachment = async () => {
    if (!mediaUrl) return;
    try {
      await Share.share({ url: mediaUrl, message: mediaUrl, title: name || 'Attachment' });
    } catch {
      // Share sheet dismissed - nothing to report.
    }
  };

  const handleDownload = () => {
    if (!mediaUrl || downloading) return;
    Alert.alert(name || 'Attachment', 'What would you like to do with this file?', [
      { text: 'Open / Download', onPress: openAttachment },
      { text: 'Share Link', onPress: shareAttachment },
      { text: 'Cancel', style: 'cancel' },
    ]);
  };

  if (isImage) {
    return (
      <TouchableOpacity style={styles.imageCard} onPress={handleDownload} activeOpacity={0.85} disabled={downloading}>
        <Image
          source={{ uri: mediaUrl }}
          style={styles.image}
          resizeMode="cover"
          onError={() => setImgFailed(true)}
        />
        <View style={styles.imageFooter}>
          <Text style={styles.imageFooterText} numberOfLines={1}>
            {name}
          </Text>
          {downloading ? (
            <ActivityIndicator size="small" color={Colors.textSecondary} />
          ) : (
            <Download size={14} color={Colors.textSecondary} />
          )}
        </View>
      </TouchableOpacity>
    );
  }

  return (
    <TouchableOpacity style={styles.fileCard} onPress={handleDownload} activeOpacity={0.85} disabled={downloading}>
      <View style={[styles.iconWrap, { backgroundColor: `${typeInfo.color}26`, borderColor: `${typeInfo.color}55` }]}>
        <IconComponent size={18} color={typeInfo.color} />
      </View>

      <View style={styles.fileInfo}>
        <View style={styles.fileNameRow}>
          <Text style={styles.fileName} numberOfLines={1}>
            {name}
          </Text>
          <View style={[styles.badge, { backgroundColor: `${typeInfo.color}26`, borderColor: `${typeInfo.color}55` }]}>
            <Text style={[styles.badgeText, { color: typeInfo.color }]}>{typeInfo.label}</Text>
          </View>
        </View>
        <Text style={styles.fileMeta}>{size ? formatFileSize(size) : 'Tap to download'}</Text>
      </View>

      {downloading ? (
        <ActivityIndicator size="small" color={Colors.textSecondary} />
      ) : (
        <Download size={16} color={Colors.textSecondary} />
      )}
    </TouchableOpacity>
  );
};

const styles = StyleSheet.create({
  fileCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.surfaceLight,
    borderWidth: 1,
    borderColor: Colors.surfaceBorder,
    borderRadius: 14,
    padding: 10,
    gap: 10,
    maxWidth: 260,
  },
  iconWrap: {
    width: 36,
    height: 36,
    borderRadius: 10,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  fileInfo: {
    flex: 1,
    minWidth: 0,
  },
  fileNameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  fileName: {
    color: Colors.textPrimary,
    fontSize: 12.5,
    fontWeight: '700',
    flexShrink: 1,
  },
  badge: {
    borderWidth: 1,
    borderRadius: 5,
    paddingHorizontal: 4,
    paddingVertical: 1,
  },
  badgeText: {
    fontSize: 8.5,
    fontWeight: '800',
  },
  fileMeta: {
    color: Colors.textMuted,
    fontSize: 10.5,
    marginTop: 2,
  },
  imageCard: {
    borderRadius: 14,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: Colors.surfaceBorder,
    backgroundColor: Colors.surfaceLight,
    maxWidth: 240,
  },
  image: {
    width: '100%',
    height: 150,
  },
  imageFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 10,
    paddingVertical: 6,
    gap: 8,
  },
  imageFooterText: {
    color: Colors.textPrimary,
    fontSize: 11,
    fontWeight: '600',
    flex: 1,
  },
});
