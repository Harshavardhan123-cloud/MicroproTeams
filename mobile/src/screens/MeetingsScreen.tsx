import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  TextInput,
  ScrollView,
  ActivityIndicator,
  Share,
  Alert,
  Linking,
  Platform,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Colors } from '../theme/colors';
import { meetingStore, MeetingItem } from '../stores/meetingStore';
import { authStore } from '../stores/authStore';
import { getTargetHostUrl } from '../api/client';
import type { RootStackParamList } from '../navigation/types';

export const MeetingsScreen: React.FC = () => {
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const [meetingState, setMeetingState] = useState(meetingStore.getState());
  const [meetingCodeInput, setMeetingCodeInput] = useState('');
  const [copiedCode, setCopiedCode] = useState(false);
  const [isJoining, setIsJoining] = useState(false);

  useEffect(() => {
    const unsub = meetingStore.subscribe(() => {
      setMeetingState(meetingStore.getState());
    });
    meetingStore.fetchMeetings();
    return () => unsub();
  }, []);

  const handleStartInstantMeeting = async () => {
    const user = authStore.getState().user;
    const meeting = await meetingStore.createInstantMeeting(
      `${user?.display_name || user?.username || 'Team'}'s Meeting`
    );

    if (meeting) {
      const meetUrl = `${targetHost}/meet/${meeting.meeting_code}`;
      Alert.alert(
        '🎥 Instant Meeting Ready',
        `Room Code: #${meeting.meeting_code}\nTitle: ${meeting.title}`,
        [
          {
            text: '🚀 Enter HD Video Room',
            onPress: () => Linking.openURL(meetUrl),
          },
          {
            text: '📱 In-App Call',
            onPress: () => {
              // A meeting is joined directly on the SFU - it does not "ring"
              // anyone the way a 1:1 call does.
              navigation.navigate('MeetingRoom', {
                roomId: meeting.id,
                meetingId: meeting.id,
                callType: 'video',
                isHost: true,
              });
            },
          },
          {
            text: 'Share Link',
            onPress: () => handleShareLink(meeting.meeting_code),
          },
        ]
      );
    }
  };

  const handleJoinByCode = async () => {
    if (!meetingCodeInput.trim()) return;
    setIsJoining(true);

    const cleanCode = meetingCodeInput.trim().replace(/^.*\/meet\//, '');
    const meeting = await meetingStore.getMeetingByCode(cleanCode);

    setIsJoining(false);
    const meetUrl = `${targetHost}/meet/${cleanCode}`;

    Alert.alert(
      'Join Meeting',
      `Room Code: #${cleanCode}\nHow would you like to join?`,
      [
        {
          text: '🚀 HD Video & Audio',
          onPress: () => Linking.openURL(meetUrl),
        },
        {
          text: '📱 In-App Call',
          onPress: () => {
            // Join the SFU room directly. When the code could not be resolved
            // to a meeting, fall back to using it as the room id so the user
            // still lands in the same room as everyone else who typed it.
            navigation.navigate('MeetingRoom', {
              roomId: meeting ? meeting.id : cleanCode,
              meetingId: meeting ? meeting.id : undefined,
              callType: 'video',
            });
          },
        },
        { text: 'Cancel', style: 'cancel' },
      ]
    );

    setMeetingCodeInput('');
  };

  const handleShareLink = (code: string) => {
    const targetHost = getTargetHostUrl();
    const url = `${targetHost}/meet/${code}`;
    Share.share({
      message: `Join my Micropro Commute video meeting: ${url}`,
      url,
    }).catch(() => {});
  };

  const { isCreating, meetings } = meetingState;
  const activeMeetingCode = meetingState.activeMeeting?.meeting_code || '384920';
  const targetHost = getTargetHostUrl();
  const shareableUrl = `${targetHost}/meet/${activeMeetingCode}`;

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      {/* Hero Card: Cinematic Video & Audio Rooms (Matching Frontend) */}
      <View style={styles.heroCard}>
        <View style={styles.heroIconWrapper}>
          <Text style={styles.heroIconText}>📹</Text>
        </View>
        <Text style={styles.heroTitle}>Cinematic Video & Audio Rooms</Text>
        <Text style={styles.heroSubtitle}>
          Host high-definition WebRTC group calls with real-time audio, video mesh signaling, and persistent meeting links.
        </Text>

        <TouchableOpacity
          style={[styles.instantBtn, isCreating && styles.instantBtnDisabled]}
          onPress={handleStartInstantMeeting}
          disabled={isCreating}
          activeOpacity={0.8}
        >
          {isCreating ? (
            <ActivityIndicator color="#FFFFFF" size="small" />
          ) : (
            <>
              <Text style={styles.instantBtnIcon}>📹</Text>
              <Text style={styles.instantBtnText}>Start Instant Meeting</Text>
            </>
          )}
        </TouchableOpacity>
      </View>

      {/* Join Meeting by Code Card */}
      <View style={styles.sectionCard}>
        <Text style={styles.cardTitle}>Join With Meeting Code</Text>
        <Text style={styles.cardSubtitle}>
          Enter the 6-digit room code or paste the full meeting link:
        </Text>

        <View style={styles.joinInputRow}>
          <TextInput
            style={styles.joinInput}
            value={meetingCodeInput}
            onChangeText={setMeetingCodeInput}
            placeholder="e.g. 748291 or /meet/748291"
            placeholderTextColor={Colors.textMuted}
            autoCapitalize="none"
            autoCorrect={false}
          />
          <TouchableOpacity
            style={[styles.joinBtn, (!meetingCodeInput.trim() || isJoining) && styles.joinBtnDisabled]}
            onPress={handleJoinByCode}
            disabled={!meetingCodeInput.trim() || isJoining}
            activeOpacity={0.8}
          >
            {isJoining ? (
              <ActivityIndicator color="#FFFFFF" size="small" />
            ) : (
              <Text style={styles.joinBtnText}>Join</Text>
            )}
          </TouchableOpacity>
        </View>
      </View>

      {/* Persistent Meeting Link Card */}
      <View style={styles.sectionCard}>
        <View style={styles.linkHeaderRow}>
          <Text style={styles.cardTitle}>Your Meeting Link</Text>
          <View style={styles.activeTag}>
            <View style={styles.activeDot} />
            <Text style={styles.activeTagText}>Active</Text>
          </View>
        </View>
        <Text style={styles.cardSubtitle}>
          Share this link with remote participants on web, desktop, or mobile:
        </Text>

        <View style={styles.linkBox}>
          <Text style={styles.linkText} numberOfLines={1}>
            {shareableUrl}
          </Text>
        </View>

        <TouchableOpacity
          style={styles.launchHdBtn}
          onPress={() => Linking.openURL(shareableUrl)}
          activeOpacity={0.8}
        >
          <Text style={styles.launchHdBtnText}>🎥 Launch HD Video & Audio Room</Text>
        </TouchableOpacity>

        <View style={styles.linkActionsRow}>
          <TouchableOpacity
            style={styles.copyBtn}
            onPress={() => {
              setCopiedCode(true);
              Alert.alert('Link Ready', `Shareable meeting URL:\n${shareableUrl}`);
              setTimeout(() => setCopiedCode(false), 2000);
            }}
            activeOpacity={0.7}
          >
            <Text style={styles.btnActionText}>{copiedCode ? '✓ Copied' : '📋 Copy Link'}</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.shareBtn}
            onPress={() => handleShareLink(activeMeetingCode)}
            activeOpacity={0.8}
          >
            <Text style={styles.shareBtnText}>🚀 Share Link</Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* Recent / Active Meetings List */}
      {meetings.length > 0 && (
        <View style={styles.sectionCard}>
          <Text style={styles.cardTitle}>Recent Workspace Meetings</Text>
          <Text style={styles.cardSubtitle}>Active and scheduled conference rooms:</Text>

          <View style={styles.meetingsList}>
            {meetings.map((m) => (
              <TouchableOpacity
                key={m.id}
                style={styles.meetingItem}
                onPress={() => {
                  const mUrl = `${targetHost}/meet/${m.meeting_code}`;
                  Alert.alert(
                    m.title,
                    `Room Code: #${m.meeting_code}\nChoose connection mode:`,
                    [
                      {
                        text: '🎥 HD Video & Audio',
                        onPress: () => Linking.openURL(mUrl),
                      },
                      {
                        text: '📱 In-App Call',
                        onPress: () => {
                          navigation.navigate('MeetingRoom', {
                            roomId: m.id,
                            meetingId: m.id,
                            callType: 'video',
                          });
                        },
                      },
                      { text: 'Cancel', style: 'cancel' },
                    ]
                  );
                }}
                activeOpacity={0.7}
              >
                <View style={styles.meetingItemIcon}>
                  <Text style={styles.meetingItemIconText}>🎥</Text>
                </View>
                <View style={styles.meetingItemDetails}>
                  <Text style={styles.meetingItemTitle}>{m.title}</Text>
                  <Text style={styles.meetingItemCode}>Room Code: #{m.meeting_code}</Text>
                </View>
                <View style={styles.joinItemBadge}>
                  <Text style={styles.joinItemBadgeText}>Join</Text>
                </View>
              </TouchableOpacity>
            ))}
          </View>
        </View>
      )}
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
  heroCard: {
    backgroundColor: Colors.surface,
    borderRadius: 24,
    borderWidth: 1,
    borderColor: Colors.surfaceBorder,
    padding: 24,
    alignItems: 'center',
    textAlign: 'center',
    shadowColor: Colors.primary,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 16,
    elevation: 4,
  },
  heroIconWrapper: {
    width: 60,
    height: 60,
    borderRadius: 20,
    backgroundColor: Colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
    shadowColor: Colors.primary,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.35,
    shadowRadius: 10,
    elevation: 6,
  },
  heroIconText: {
    fontSize: 28,
  },
  heroTitle: {
    color: Colors.textPrimary,
    fontSize: 20,
    fontWeight: '800',
    marginBottom: 8,
    textAlign: 'center',
  },
  heroSubtitle: {
    color: Colors.textSecondary,
    fontSize: 12.5,
    textAlign: 'center',
    lineHeight: 18,
    marginBottom: 20,
    maxWidth: 320,
  },
  instantBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.primary,
    paddingHorizontal: 22,
    paddingVertical: 14,
    borderRadius: 14,
    gap: 8,
    shadowColor: Colors.primary,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 4,
  },
  instantBtnDisabled: {
    opacity: 0.6,
  },
  instantBtnIcon: {
    fontSize: 16,
  },
  instantBtnText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '700',
  },
  sectionCard: {
    backgroundColor: Colors.surface,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: Colors.surfaceBorder,
    padding: 20,
  },
  cardTitle: {
    color: Colors.textPrimary,
    fontSize: 16,
    fontWeight: '700',
    marginBottom: 4,
  },
  cardSubtitle: {
    color: Colors.textSecondary,
    fontSize: 12,
    marginBottom: 14,
    lineHeight: 17,
  },
  joinInputRow: {
    flexDirection: 'row',
    gap: 10,
  },
  joinInput: {
    flex: 1,
    backgroundColor: Colors.surfaceLight,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Colors.surfaceBorder,
    paddingHorizontal: 14,
    paddingVertical: 11,
    color: Colors.textPrimary,
    fontSize: 14,
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
  },
  joinBtn: {
    backgroundColor: Colors.primary,
    paddingHorizontal: 20,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  joinBtnDisabled: {
    opacity: 0.4,
  },
  joinBtnText: {
    color: '#FFFFFF',
    fontSize: 13.5,
    fontWeight: '700',
  },
  linkHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 4,
  },
  activeTag: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(16, 185, 129, 0.12)',
    borderColor: 'rgba(16, 185, 129, 0.3)',
    borderWidth: 1,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 999,
    gap: 5,
  },
  activeDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: Colors.emerald,
  },
  activeTagText: {
    color: Colors.emerald,
    fontSize: 10.5,
    fontWeight: '700',
  },
  linkBox: {
    backgroundColor: Colors.surfaceLight,
    padding: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Colors.surfaceBorder,
    marginBottom: 12,
  },
  linkText: {
    color: Colors.cyan,
    fontSize: 12,
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
  },
  launchHdBtn: {
    backgroundColor: Colors.primary,
    paddingVertical: 13,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 12,
    shadowColor: Colors.primary,
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.3,
    shadowRadius: 6,
    elevation: 3,
  },
  launchHdBtnText: {
    color: '#FFFFFF',
    fontSize: 13.5,
    fontWeight: '700',
  },
  linkActionsRow: {
    flexDirection: 'row',
    gap: 10,
  },
  copyBtn: {
    flex: 1,
    backgroundColor: Colors.surfaceLight,
    borderWidth: 1,
    borderColor: Colors.surfaceBorder,
    paddingVertical: 11,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  btnActionText: {
    color: Colors.textPrimary,
    fontSize: 12.5,
    fontWeight: '600',
  },
  shareBtn: {
    flex: 1,
    backgroundColor: Colors.primary,
    paddingVertical: 11,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  shareBtnText: {
    color: '#FFFFFF',
    fontSize: 12.5,
    fontWeight: '700',
  },
  meetingsList: {
    gap: 8,
  },
  meetingItem: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.surfaceLight,
    padding: 12,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: Colors.surfaceBorder,
    gap: 12,
  },
  meetingItemIcon: {
    width: 38,
    height: 38,
    borderRadius: 12,
    backgroundColor: 'rgba(99, 102, 241, 0.15)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  meetingItemIconText: {
    fontSize: 18,
  },
  meetingItemDetails: {
    flex: 1,
  },
  meetingItemTitle: {
    color: Colors.textPrimary,
    fontSize: 14,
    fontWeight: '600',
  },
  meetingItemCode: {
    color: Colors.textSecondary,
    fontSize: 11,
    marginTop: 2,
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
  },
  joinItemBadge: {
    backgroundColor: Colors.primary,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
  },
  joinItemBadgeText: {
    color: '#FFFFFF',
    fontSize: 11.5,
    fontWeight: '700',
  },
});
