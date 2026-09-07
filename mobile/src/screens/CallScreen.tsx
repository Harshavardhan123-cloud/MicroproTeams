import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  SafeAreaView,
} from 'react-native';
import { Colors } from '../theme/colors';
import { Avatar } from '../components/common/Avatar';
import { callStore, CallParticipant } from '../stores/callStore';
import { authStore } from '../stores/authStore';
import { AddPeopleModal } from '../components/call/AddPeopleModal';
import { Toast } from '../components/common/Toast';

export const CallScreen: React.FC = () => {
  const [callState, setCallState] = useState(callStore.getState());
  const [addPeopleModalVisible, setAddPeopleModalVisible] = useState(false);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  useEffect(() => {
    const unsub = callStore.subscribe(() => {
      setCallState(callStore.getState());
    });
    return () => unsub();
  }, []);

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 3500);
  };

  const handleToggleRecordingPrivacy = () => {
    const isNowVisible = callStore.toggleRecordingVisibility();
    showToast(
      isNowVisible
        ? 'Attendee recording notification is now ON'
        : 'Attendee recording notification is now HIDDEN'
    );
  };

  const formatTime = (secs: number) => {
    const m = Math.floor(secs / 60);
    const s = secs % 60;
    return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  };

  const isHost = callState.isCaller;
  const showRecordingBadge =
    callState.isRecording && (isHost || callState.notifyParticipantsOfRecording);

  return (
    <SafeAreaView style={styles.container}>
      <Toast message={toastMessage} type="info" />

      {/* Top Status Bar */}
      <View style={styles.topBar}>
        <View style={styles.topInfo}>
          <View style={styles.callTypePill}>
            <Text style={styles.callTypePillText}>
              {callState.isGroupCall ? 'Group Meeting' : '1-on-1 Call'}
            </Text>
          </View>

          {/* Recording Badge */}
          {showRecordingBadge ? (
            <View style={styles.recBadge}>
              <View style={styles.recDot} />
              <Text style={styles.recText}>
                REC {formatTime(callState.recordingSeconds)}
              </Text>
            </View>
          ) : null}
        </View>

        {/* Add People Button (Always ENABLED for 1-to-1 & Group calls) */}
        <TouchableOpacity
          style={styles.addPeopleTopBtn}
          onPress={() => setAddPeopleModalVisible(true)}
          activeOpacity={0.7}
        >
          <Text style={styles.addPeopleTopBtnText}>+ Add People</Text>
        </TouchableOpacity>
      </View>

      {/* Host Recording Privacy Bar (Shown if user is Host) */}
      {isHost ? (
        <View style={styles.hostPrivacyBar}>
          <View style={styles.hostPrivacyInfo}>
            <Text style={styles.hostPrivacyTitle}>Host Recording Privacy</Text>
            <Text style={styles.hostPrivacyDesc}>
              {callState.notifyParticipantsOfRecording
                ? 'Attendees can see the REC notification'
                : 'Attendee REC notification is hidden'}
            </Text>
          </View>

          <TouchableOpacity
            style={[
              styles.privacyToggleBtn,
              callState.notifyParticipantsOfRecording
                ? styles.privacyToggleOn
                : styles.privacyToggleOff,
            ]}
            onPress={handleToggleRecordingPrivacy}
            activeOpacity={0.8}
          >
            <Text style={styles.privacyToggleText}>
              {callState.notifyParticipantsOfRecording ? 'Notify: ON' : 'Notify: OFF'}
            </Text>
          </TouchableOpacity>
        </View>
      ) : null}

      {/* Video / Participant Mesh Grid */}
      <ScrollView
        contentContainerStyle={styles.participantsGrid}
        style={styles.gridScrollView}
      >
        {callState.participants.map((participant) => (
          <View key={participant.id} style={styles.participantCard}>
            <View style={styles.avatarPulsingContainer}>
              <Avatar
                name={participant.name}
                avatarUrl={participant.avatar}
                size={70}
              />
            </View>

            <View style={styles.participantTag}>
              <Text style={styles.participantName}>
                {participant.name}
                {participant.isHost ? ' (Host)' : ''}
              </Text>
            </View>
          </View>
        ))}
      </ScrollView>

      {/* In-Call HUD Action Dock */}
      <View style={styles.hudDock}>
        {/* Mute Mic */}
        <TouchableOpacity
          style={[styles.hudButton, callState.isMuted && styles.hudButtonDanger]}
          onPress={() => callStore.toggleMute()}
          activeOpacity={0.7}
        >
          <Text style={styles.hudEmoji}>{callState.isMuted ? '🔇' : '🎙️'}</Text>
          <Text style={styles.hudLabel}>{callState.isMuted ? 'Unmute' : 'Mute'}</Text>
        </TouchableOpacity>

        {/* Video Camera Toggle */}
        <TouchableOpacity
          style={[styles.hudButton, callState.isVideoOff && styles.hudButtonDanger]}
          onPress={() => callStore.toggleVideo()}
          activeOpacity={0.7}
        >
          <Text style={styles.hudEmoji}>{callState.isVideoOff ? '🚫' : '📹'}</Text>
          <Text style={styles.hudLabel}>{callState.isVideoOff ? 'Video Off' : 'Video'}</Text>
        </TouchableOpacity>

        {/* Speakerphone */}
        <TouchableOpacity
          style={styles.hudButton}
          onPress={() => callStore.toggleSpeaker()}
          activeOpacity={0.7}
        >
          <Text style={styles.hudEmoji}>{callState.isSpeakerOn ? '🔊' : '🔈'}</Text>
          <Text style={styles.hudLabel}>Speaker</Text>
        </TouchableOpacity>

        {/* Add People Button in HUD */}
        <TouchableOpacity
          style={[styles.hudButton, styles.hudButtonPrimary]}
          onPress={() => setAddPeopleModalVisible(true)}
          activeOpacity={0.7}
        >
          <Text style={styles.hudEmoji}>👥</Text>
          <Text style={styles.hudLabel}>Add People</Text>
        </TouchableOpacity>

        {/* Host Record Button */}
        {isHost ? (
          <TouchableOpacity
            style={[
              styles.hudButton,
              callState.isRecording ? styles.hudButtonRecording : null,
            ]}
            onPress={() => callStore.toggleRecording()}
            activeOpacity={0.7}
          >
            <Text style={styles.hudEmoji}>{callState.isRecording ? '⏹️' : '⏺️'}</Text>
            <Text style={styles.hudLabel}>
              {callState.isRecording ? 'Stop REC' : 'Record'}
            </Text>
          </TouchableOpacity>
        ) : null}

        {/* End Call */}
        <TouchableOpacity
          style={[styles.hudButton, styles.hudButtonEndCall]}
          onPress={() => callStore.endCall(true)}
          activeOpacity={0.7}
        >
          <Text style={styles.hudEmoji}>📞</Text>
          <Text style={styles.hudLabel}>End</Text>
        </TouchableOpacity>
      </View>

      {/* Add People Modal */}
      <AddPeopleModal
        visible={addPeopleModalVisible}
        onClose={() => setAddPeopleModalVisible(false)}
      />
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  topBar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: Colors.surfaceBorder,
  },
  topInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  callTypePill: {
    backgroundColor: 'rgba(99, 102, 241, 0.15)',
    borderWidth: 1,
    borderColor: 'rgba(99, 102, 241, 0.3)',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 999,
  },
  callTypePillText: {
    color: Colors.teamsPurpleLight,
    fontSize: 11,
    fontWeight: '700',
  },
  recBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(239, 68, 68, 0.2)',
    borderWidth: 1,
    borderColor: 'rgba(239, 68, 68, 0.4)',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 999,
    gap: 6,
  },
  recDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: Colors.rose,
  },
  recText: {
    color: '#FF6B6B',
    fontSize: 10.5,
    fontWeight: '800',
  },
  addPeopleTopBtn: {
    backgroundColor: Colors.surfaceLight,
    borderWidth: 1,
    borderColor: Colors.primary,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 10,
  },
  addPeopleTopBtnText: {
    color: Colors.primary,
    fontSize: 12,
    fontWeight: '700',
  },
  hostPrivacyBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: 'rgba(18, 22, 32, 0.95)',
    borderWidth: 1,
    borderColor: 'rgba(99, 102, 241, 0.25)',
    marginHorizontal: 16,
    marginTop: 10,
    padding: 10,
    borderRadius: 14,
  },
  hostPrivacyInfo: {
    flex: 1,
  },
  hostPrivacyTitle: {
    color: Colors.textPrimary,
    fontSize: 12.5,
    fontWeight: '700',
  },
  hostPrivacyDesc: {
    color: Colors.textSecondary,
    fontSize: 10.5,
    marginTop: 1,
  },
  privacyToggleBtn: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
    borderWidth: 1,
  },
  privacyToggleOn: {
    backgroundColor: 'rgba(16, 185, 129, 0.15)',
    borderColor: Colors.emerald,
  },
  privacyToggleOff: {
    backgroundColor: 'rgba(245, 158, 11, 0.15)',
    borderColor: Colors.amber,
  },
  privacyToggleText: {
    color: Colors.textPrimary,
    fontSize: 11,
    fontWeight: '700',
  },
  gridScrollView: {
    flex: 1,
  },
  participantsGrid: {
    padding: 16,
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
    justifyContent: 'center',
  },
  participantCard: {
    width: '46%',
    aspectRatio: 0.9,
    backgroundColor: Colors.surface,
    borderWidth: 1.5,
    borderColor: Colors.surfaceBorder,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
    overflow: 'hidden',
  },
  avatarPulsingContainer: {
    padding: 8,
  },
  participantTag: {
    position: 'absolute',
    bottom: 10,
    backgroundColor: 'rgba(11, 14, 20, 0.85)',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 999,
  },
  participantName: {
    color: Colors.textPrimary,
    fontSize: 11.5,
    fontWeight: '600',
  },
  hudDock: {
    flexDirection: 'row',
    backgroundColor: Colors.surface,
    borderTopWidth: 1,
    borderTopColor: Colors.surfaceBorder,
    paddingVertical: 12,
    paddingHorizontal: 8,
    justifyContent: 'space-around',
    alignItems: 'center',
  },
  hudButton: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 6,
    paddingHorizontal: 8,
    borderRadius: 12,
  },
  hudButtonDanger: {
    backgroundColor: 'rgba(239, 68, 68, 0.15)',
  },
  hudButtonPrimary: {
    backgroundColor: 'rgba(99, 102, 241, 0.15)',
  },
  hudButtonRecording: {
    backgroundColor: 'rgba(239, 68, 68, 0.25)',
  },
  hudButtonEndCall: {
    backgroundColor: Colors.rose,
    borderRadius: 16,
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  hudEmoji: {
    fontSize: 20,
    marginBottom: 2,
  },
  hudLabel: {
    color: Colors.textPrimary,
    fontSize: 10,
    fontWeight: '600',
  },
});
