import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  TextInput,
  ScrollView,
  Share,
} from 'react-native';
import { Colors } from '../theme/colors';
import { getTargetHostUrl } from '../api/client';
import { callStore } from '../stores/callStore';
import { authStore } from '../stores/authStore';

interface ScheduledMeeting {
  id: string;
  code: string;
  title: string;
  link: string;
  scheduledTime: string;
}

export const MeetingsScreen: React.FC = () => {
  const [meetingCodeInput, setMeetingCodeInput] = useState('');
  const [scheduledTitle, setScheduledTitle] = useState('');
  const [feedbackToast, setFeedbackToast] = useState<string | null>(null);
  const [meetings, setMeetings] = useState<ScheduledMeeting[]>([
    {
      id: 'm-1',
      code: 'sync-dev-842',
      title: 'Daily Architecture Standup',
      link: `${getTargetHostUrl()}/meet/sync-dev-842`,
      scheduledTime: 'Today at 2:00 PM',
    },
    {
      id: 'm-2',
      code: 'rev-q3-910',
      title: 'Mobile App Architecture Review',
      link: `${getTargetHostUrl()}/meet/rev-q3-910`,
      scheduledTime: 'Tomorrow at 11:30 AM',
    },
  ]);

  const showToast = (msg: string) => {
    setFeedbackToast(msg);
    setTimeout(() => setFeedbackToast(null), 3000);
  };

  const generateMeetingCode = (): string => {
    const part1 = Math.random().toString(36).substring(2, 5);
    const part2 = Math.random().toString(36).substring(2, 6);
    return `mtg-${part1}-${part2}`;
  };

  const handleStartInstantMeeting = () => {
    const code = generateMeetingCode();
    const currentUser = authStore.getState().user;
    callStore.initiateCall(
      {
        id: `room-${code}`,
        name: `Instant Meeting (${code})`,
      },
      'video',
      code
    );
  };

  const handleScheduleMeeting = () => {
    if (!scheduledTitle.trim()) {
      showToast('Please enter a meeting title');
      return;
    }

    const code = generateMeetingCode();
    const baseUrl = getTargetHostUrl();
    const link = `${baseUrl}/meet/${code}`;

    const newMeeting: ScheduledMeeting = {
      id: `sched-${Date.now()}`,
      code,
      title: scheduledTitle.trim(),
      link,
      scheduledTime: 'Scheduled for later today',
    };

    setMeetings([newMeeting, ...meetings]);
    setScheduledTitle('');
    showToast(`Meeting link created: /meet/${code}`);
  };

  const handleCopyOrShareLink = async (meeting: ScheduledMeeting) => {
    try {
      await Share.share({
        message: `Join my Micropro Commute meeting: ${meeting.title}\nLink: ${meeting.link}\nMeeting Code: ${meeting.code}`,
        title: meeting.title,
      });
      showToast('Meeting link shared!');
    } catch (e) {
      showToast('Link ready to copy');
    }
  };

  const handleJoinByCode = () => {
    let cleanCode = meetingCodeInput.trim();
    if (!cleanCode) {
      showToast('Please enter a valid meeting code or URL');
      return;
    }

    // If full URL was pasted, extract code after /meet/
    if (cleanCode.includes('/meet/')) {
      cleanCode = cleanCode.split('/meet/')[1].split(/[?#]/)[0];
    }

    callStore.initiateCall(
      {
        id: `room-${cleanCode}`,
        name: `Meeting (${cleanCode})`,
      },
      'video',
      cleanCode
    );
    setMeetingCodeInput('');
  };

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      {/* Toast Feedback */}
      {feedbackToast ? (
        <View style={styles.toast}>
          <Text style={styles.toastText}>{feedbackToast}</Text>
        </View>
      ) : null}

      {/* Hero Action Cards */}
      <View style={styles.heroRow}>
        <TouchableOpacity
          style={[styles.heroCard, styles.heroCardPrimary]}
          onPress={handleStartInstantMeeting}
          activeOpacity={0.8}
        >
          <View style={styles.heroIconWrapper}>
            <Text style={styles.heroIconEmoji}>📹</Text>
          </View>
          <Text style={styles.heroCardTitle}>Instant Meeting</Text>
          <Text style={styles.heroCardDesc}>Start right now with a single tap</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.heroCard}
          onPress={() => {
            const code = generateMeetingCode();
            showToast(`Generated: ${getTargetHostUrl()}/meet/${code}`);
          }}
          activeOpacity={0.8}
        >
          <View style={[styles.heroIconWrapper, styles.heroIconCyan]}>
            <Text style={styles.heroIconEmoji}>🔗</Text>
          </View>
          <Text style={styles.heroCardTitle}>Get Link</Text>
          <Text style={styles.heroCardDesc}>Create meeting link to send</Text>
        </TouchableOpacity>
      </View>

      {/* Join with Code Card */}
      <View style={styles.card}>
        <Text style={styles.cardTitle}>Join a Meeting</Text>
        <Text style={styles.cardSubtitle}>
          Enter a 9-character code or paste a `/meet/:code` link:
        </Text>

        <View style={styles.joinInputRow}>
          <TextInput
            style={styles.joinInput}
            placeholder="e.g. mtg-abc-123 or paste link"
            placeholderTextColor={Colors.textMuted}
            value={meetingCodeInput}
            onChangeText={setMeetingCodeInput}
            autoCapitalize="none"
          />
          <TouchableOpacity
            style={styles.joinButton}
            onPress={handleJoinByCode}
            activeOpacity={0.8}
          >
            <Text style={styles.joinButtonText}>Join</Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* Schedule Meeting with Link Card */}
      <View style={styles.card}>
        <Text style={styles.cardTitle}>Schedule Meeting & Generate Link</Text>
        <Text style={styles.cardSubtitle}>
          Creates a permanent join link for your team:
        </Text>

        <View style={styles.scheduleInputRow}>
          <TextInput
            style={styles.scheduleInput}
            placeholder="Meeting title (e.g. Sprint Planning)"
            placeholderTextColor={Colors.textMuted}
            value={scheduledTitle}
            onChangeText={setScheduledTitle}
          />
          <TouchableOpacity
            style={styles.scheduleButton}
            onPress={handleScheduleMeeting}
            activeOpacity={0.8}
          >
            <Text style={styles.scheduleButtonText}>+ Create Link</Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* Upcoming & Scheduled Meetings */}
      <View style={styles.meetingsSection}>
        <Text style={styles.sectionTitle}>Scheduled Meetings</Text>

        {meetings.map((meeting) => (
          <View key={meeting.id} style={styles.meetingItem}>
            <View style={styles.meetingInfo}>
              <Text style={styles.meetingTitle}>{meeting.title}</Text>
              <Text style={styles.meetingTime}>{meeting.scheduledTime}</Text>
              <Text style={styles.meetingLink} numberOfLines={1}>
                {meeting.link}
              </Text>
            </View>

            <View style={styles.meetingActions}>
              <TouchableOpacity
                style={styles.shareBtn}
                onPress={() => handleCopyOrShareLink(meeting)}
                activeOpacity={0.7}
              >
                <Text style={styles.shareBtnText}>Share Link</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.quickJoinBtn}
                onPress={() => {
                  callStore.initiateCall(
                    {
                      id: `room-${meeting.code}`,
                      name: meeting.title,
                    },
                    'video',
                    meeting.code
                  );
                }}
                activeOpacity={0.8}
              >
                <Text style={styles.quickJoinBtnText}>Start</Text>
              </TouchableOpacity>
            </View>
          </View>
        ))}
      </View>
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
  },
  toast: {
    backgroundColor: Colors.surfaceLight,
    borderWidth: 1,
    borderColor: Colors.primary,
    borderRadius: 12,
    padding: 12,
    alignItems: 'center',
  },
  toastText: {
    color: Colors.textPrimary,
    fontSize: 13,
    fontWeight: '600',
  },
  heroRow: {
    flexDirection: 'row',
    gap: 12,
  },
  heroCard: {
    flex: 1,
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.surfaceBorder,
    borderRadius: 20,
    padding: 16,
  },
  heroCardPrimary: {
    borderColor: 'rgba(99, 102, 241, 0.4)',
    backgroundColor: 'rgba(99, 102, 241, 0.1)',
  },
  heroIconWrapper: {
    width: 44,
    height: 44,
    borderRadius: 14,
    backgroundColor: Colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 12,
  },
  heroIconCyan: {
    backgroundColor: Colors.cyan,
  },
  heroIconEmoji: {
    fontSize: 20,
  },
  heroCardTitle: {
    color: Colors.textPrimary,
    fontSize: 15,
    fontWeight: '700',
    marginBottom: 4,
  },
  heroCardDesc: {
    color: Colors.textSecondary,
    fontSize: 11.5,
    lineHeight: 16,
  },
  card: {
    backgroundColor: Colors.surface,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: Colors.surfaceBorder,
    padding: 18,
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
    paddingVertical: 10,
    color: Colors.textPrimary,
    fontSize: 14,
  },
  joinButton: {
    backgroundColor: Colors.primary,
    paddingHorizontal: 20,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  joinButtonText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '700',
  },
  scheduleInputRow: {
    flexDirection: 'column',
    gap: 10,
  },
  scheduleInput: {
    backgroundColor: Colors.surfaceLight,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Colors.surfaceBorder,
    paddingHorizontal: 14,
    paddingVertical: 10,
    color: Colors.textPrimary,
    fontSize: 14,
  },
  scheduleButton: {
    backgroundColor: Colors.surfaceLight,
    borderWidth: 1,
    borderColor: Colors.primary,
    paddingVertical: 12,
    borderRadius: 12,
    alignItems: 'center',
  },
  scheduleButtonText: {
    color: Colors.primary,
    fontSize: 13.5,
    fontWeight: '700',
  },
  meetingsSection: {
    marginTop: 8,
    gap: 12,
  },
  sectionTitle: {
    color: Colors.textPrimary,
    fontSize: 16,
    fontWeight: '700',
  },
  meetingItem: {
    backgroundColor: Colors.surface,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: Colors.surfaceBorder,
    padding: 16,
  },
  meetingInfo: {
    marginBottom: 12,
  },
  meetingTitle: {
    color: Colors.textPrimary,
    fontSize: 15,
    fontWeight: '700',
  },
  meetingTime: {
    color: Colors.textMuted,
    fontSize: 12,
    marginTop: 2,
  },
  meetingLink: {
    color: Colors.cyan,
    fontSize: 11.5,
    marginTop: 4,
  },
  meetingActions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 10,
  },
  shareBtn: {
    backgroundColor: Colors.surfaceLight,
    borderWidth: 1,
    borderColor: Colors.surfaceBorder,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 10,
  },
  shareBtnText: {
    color: Colors.textSecondary,
    fontSize: 12.5,
    fontWeight: '600',
  },
  quickJoinBtn: {
    backgroundColor: Colors.emerald,
    paddingHorizontal: 18,
    paddingVertical: 8,
    borderRadius: 10,
  },
  quickJoinBtnText: {
    color: '#FFFFFF',
    fontSize: 12.5,
    fontWeight: '700',
  },
});
