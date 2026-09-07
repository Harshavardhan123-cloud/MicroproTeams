import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  TextInput,
  Image,
} from 'react-native';
import { Colors } from '../theme/colors';
import { Avatar } from '../components/common/Avatar';
import { authStore } from '../stores/authStore';
import { ringtoneService, RINGTONE_OPTIONS, RingtoneOption } from '../services/ringtoneService';
import { getTargetHostUrl } from '../api/client';
import { ServerConfigModal } from '../components/modals/ServerConfigModal';
import { Toast } from '../components/common/Toast';

const PRESET_AVATARS = [
  'https://api.dicebear.com/7.x/bottts/png?seed=Alex',
  'https://api.dicebear.com/7.x/bottts/png?seed=Sarah',
  'https://api.dicebear.com/7.x/bottts/png?seed=Cyber',
  'https://api.dicebear.com/7.x/bottts/png?seed=Neon',
  'https://api.dicebear.com/7.x/adventurer/png?seed=Felix',
  'https://api.dicebear.com/7.x/adventurer/png?seed=Bella',
  'https://api.dicebear.com/7.x/adventurer/png?seed=Jasper',
  'https://api.dicebear.com/7.x/adventurer/png?seed=Luna',
  'https://api.dicebear.com/7.x/lorelei/png?seed=Zoe',
  'https://api.dicebear.com/7.x/lorelei/png?seed=Milo',
  'https://api.dicebear.com/7.x/lorelei/png?seed=Caleb',
  'https://api.dicebear.com/7.x/lorelei/png?seed=Maya',
];

export const ProfileSettingsScreen: React.FC = () => {
  const [currentUser, setCurrentUser] = useState(authStore.getState().user);
  const [selectedRingtoneId, setSelectedRingtoneId] = useState(
    ringtoneService.getCurrentRingtoneId()
  );
  const [customAvatarUrl, setCustomAvatarUrl] = useState('');
  const [serverModalVisible, setServerModalVisible] = useState(false);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  useEffect(() => {
    const unsub = authStore.subscribe(() => {
      setCurrentUser(authStore.getState().user);
    });
    ringtoneService.init().then(() => {
      setSelectedRingtoneId(ringtoneService.getCurrentRingtoneId());
    });
    return () => unsub();
  }, []);

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 3000);
  };

  const handleSelectAvatar = async (url: string) => {
    await authStore.updateAvatar(url);
    showToast('Profile avatar updated!');
  };

  const handleSelectRingtone = async (option: RingtoneOption) => {
    setSelectedRingtoneId(option.id);
    await ringtoneService.setRingtone(option.id);
    ringtoneService.preview(option.id);
    showToast(`Ringtone set to: ${option.name}`);
  };

  const currentServer = getTargetHostUrl();
  const isTunnel = currentServer.includes('trycloudflare.com');

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <Toast message={toastMessage} type="success" />

      {/* User Card */}
      <View style={styles.profileHeroCard}>
        <Avatar
          name={currentUser?.display_name || currentUser?.username || 'Admin'}
          avatarUrl={currentUser?.avatar_url}
          size={76}
          showStatus
          status="online"
        />

        <View style={styles.profileInfo}>
          <Text style={styles.displayName}>
            {currentUser?.display_name || currentUser?.username || 'Workspace Member'}
          </Text>
          <Text style={styles.userEmail}>{currentUser?.email || 'admin@example.com'}</Text>
          <View style={styles.rolePill}>
            <Text style={styles.rolePillText}>Micropro Commute Verified</Text>
          </View>
        </View>
      </View>

      {/* Feature 1: Avatar Customization */}
      <View style={styles.sectionCard}>
        <Text style={styles.sectionTitle}>Choose Profile Avatar</Text>
        <Text style={styles.sectionSubtitle}>
          Select from Obsidian character presets or paste custom image URL:
        </Text>

        {/* Preset Avatar Grid */}
        <View style={styles.avatarGrid}>
          {PRESET_AVATARS.map((url, idx) => {
            const isSelected = currentUser?.avatar_url === url;
            return (
              <TouchableOpacity
                key={idx}
                style={[styles.avatarThumbnail, isSelected && styles.avatarThumbnailSelected]}
                onPress={() => handleSelectAvatar(url)}
                activeOpacity={0.7}
              >
                <Image source={{ uri: url }} style={styles.avatarThumbImg} />
              </TouchableOpacity>
            );
          })}
        </View>

        {/* Custom URL Input */}
        <View style={styles.customAvatarRow}>
          <TextInput
            style={styles.customAvatarInput}
            placeholder="Paste custom image URL..."
            placeholderTextColor={Colors.textMuted}
            value={customAvatarUrl}
            onChangeText={setCustomAvatarUrl}
            autoCapitalize="none"
          />
          <TouchableOpacity
            style={styles.applyAvatarBtn}
            onPress={() => {
              if (customAvatarUrl.trim()) {
                handleSelectAvatar(customAvatarUrl.trim());
                setCustomAvatarUrl('');
              }
            }}
          >
            <Text style={styles.applyAvatarBtnText}>Apply</Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* Feature 2: Ringtone Customization */}
      <View style={styles.sectionCard}>
        <Text style={styles.sectionTitle}>Call Ringtone & Melody</Text>
        <Text style={styles.sectionSubtitle}>
          Select incoming call rhythm pattern and preview tone:
        </Text>

        <View style={styles.ringtonesList}>
          {RINGTONE_OPTIONS.map((opt) => {
            const isSelected = selectedRingtoneId === opt.id;
            return (
              <TouchableOpacity
                key={opt.id}
                style={[styles.ringtoneItem, isSelected && styles.ringtoneItemSelected]}
                onPress={() => handleSelectRingtone(opt)}
                activeOpacity={0.7}
              >
                <View style={styles.ringtoneDetails}>
                  <View style={styles.ringtoneTitleRow}>
                    <Text style={[styles.ringtoneName, isSelected && styles.textPrimaryColor]}>
                      {opt.name}
                    </Text>
                    {isSelected ? (
                      <View style={styles.activePill}>
                        <Text style={styles.activePillText}>Active</Text>
                      </View>
                    ) : null}
                  </View>
                  <Text style={styles.ringtoneDesc}>{opt.description}</Text>
                </View>

                <TouchableOpacity
                  style={styles.previewBtn}
                  onPress={() => ringtoneService.preview(opt.id)}
                  activeOpacity={0.6}
                >
                  <Text style={styles.previewBtnText}>▶ Preview</Text>
                </TouchableOpacity>
              </TouchableOpacity>
            );
          })}
        </View>
      </View>

      {/* Feature 3: Server Gateway Configuration */}
      <View style={styles.sectionCard}>
        <Text style={styles.sectionTitle}>Backend Gateway Endpoint</Text>
        <Text style={styles.sectionSubtitle}>
          Currently connecting to:
        </Text>

        <View style={styles.serverInfoCard}>
          <View
            style={[
              styles.serverDot,
              { backgroundColor: isTunnel ? Colors.cyan : Colors.emerald },
            ]}
          />
          <Text style={styles.serverCurrentText}>{currentServer}</Text>
        </View>

        <TouchableOpacity
          style={styles.serverChangeBtn}
          onPress={() => setServerModalVisible(true)}
          activeOpacity={0.7}
        >
          <Text style={styles.serverChangeBtnText}>Switch Gateway / Test Server</Text>
        </TouchableOpacity>
      </View>

      {/* Logout */}
      <TouchableOpacity
        style={styles.logoutBtn}
        onPress={() => authStore.logout()}
        activeOpacity={0.8}
      >
        <Text style={styles.logoutBtnText}>Sign Out of Workspace</Text>
      </TouchableOpacity>

      <ServerConfigModal
        visible={serverModalVisible}
        onClose={() => setServerModalVisible(false)}
      />
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  content: {
    padding: 16,
    gap: 16,
    paddingBottom: 40,
  },
  profileHeroCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.surface,
    padding: 20,
    borderRadius: 24,
    borderWidth: 1,
    borderColor: Colors.surfaceBorder,
    gap: 16,
  },
  profileInfo: {
    flex: 1,
  },
  displayName: {
    color: Colors.textPrimary,
    fontSize: 18,
    fontWeight: '700',
  },
  userEmail: {
    color: Colors.textSecondary,
    fontSize: 13,
    marginTop: 2,
  },
  rolePill: {
    marginTop: 8,
    backgroundColor: 'rgba(99, 102, 241, 0.15)',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
    alignSelf: 'flex-start',
  },
  rolePillText: {
    color: Colors.teamsPurpleLight,
    fontSize: 10.5,
    fontWeight: '700',
  },
  sectionCard: {
    backgroundColor: Colors.surface,
    padding: 18,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: Colors.surfaceBorder,
  },
  sectionTitle: {
    color: Colors.textPrimary,
    fontSize: 16,
    fontWeight: '700',
  },
  sectionSubtitle: {
    color: Colors.textSecondary,
    fontSize: 12,
    marginTop: 2,
    marginBottom: 14,
  },
  avatarGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    marginBottom: 14,
  },
  avatarThumbnail: {
    width: 48,
    height: 48,
    borderRadius: 24,
    borderWidth: 2,
    borderColor: 'transparent',
    overflow: 'hidden',
    backgroundColor: Colors.surfaceLight,
  },
  avatarThumbnailSelected: {
    borderColor: Colors.primary,
  },
  avatarThumbImg: {
    width: '100%',
    height: '100%',
  },
  customAvatarRow: {
    flexDirection: 'row',
    gap: 10,
  },
  customAvatarInput: {
    flex: 1,
    backgroundColor: Colors.surfaceLight,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Colors.surfaceBorder,
    paddingHorizontal: 12,
    paddingVertical: 8,
    color: Colors.textPrimary,
    fontSize: 13,
  },
  applyAvatarBtn: {
    backgroundColor: Colors.primary,
    paddingHorizontal: 16,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  applyAvatarBtnText: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '700',
  },
  ringtonesList: {
    gap: 8,
  },
  ringtoneItem: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.surfaceLight,
    padding: 12,
    borderRadius: 14,
    borderWidth: 1.5,
    borderColor: Colors.surfaceBorderLight,
  },
  ringtoneItemSelected: {
    borderColor: Colors.primary,
    backgroundColor: 'rgba(99, 102, 241, 0.1)',
  },
  ringtoneDetails: {
    flex: 1,
  },
  ringtoneTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  ringtoneName: {
    color: Colors.textPrimary,
    fontSize: 14,
    fontWeight: '600',
  },
  textPrimaryColor: {
    color: Colors.primary,
  },
  activePill: {
    backgroundColor: Colors.primary,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  activePillText: {
    color: '#FFFFFF',
    fontSize: 9,
    fontWeight: '800',
  },
  ringtoneDesc: {
    color: Colors.textMuted,
    fontSize: 11,
    marginTop: 2,
  },
  previewBtn: {
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.surfaceBorder,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
  },
  previewBtnText: {
    color: Colors.textSecondary,
    fontSize: 11,
    fontWeight: '600',
  },
  serverInfoCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.surfaceLight,
    padding: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Colors.surfaceBorder,
    gap: 8,
    marginBottom: 12,
  },
  serverDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  serverCurrentText: {
    color: Colors.textPrimary,
    fontSize: 12,
    fontFamily: 'monospace',
    flex: 1,
  },
  serverChangeBtn: {
    backgroundColor: Colors.surfaceLight,
    borderWidth: 1,
    borderColor: Colors.surfaceBorderLight,
    paddingVertical: 12,
    borderRadius: 12,
    alignItems: 'center',
  },
  serverChangeBtnText: {
    color: Colors.primary,
    fontSize: 13,
    fontWeight: '700',
  },
  logoutBtn: {
    backgroundColor: 'rgba(239, 68, 68, 0.15)',
    borderWidth: 1,
    borderColor: 'rgba(239, 68, 68, 0.3)',
    paddingVertical: 14,
    borderRadius: 16,
    alignItems: 'center',
    marginTop: 8,
  },
  logoutBtnText: {
    color: Colors.rose,
    fontSize: 14,
    fontWeight: '700',
  },
});
