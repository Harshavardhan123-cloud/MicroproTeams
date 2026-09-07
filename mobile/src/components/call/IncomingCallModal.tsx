import React from 'react';
import { View, Text, StyleSheet, Modal, TouchableOpacity } from 'react-native';
import { Colors } from '../../theme/colors';
import { Avatar } from '../common/Avatar';
import { callStore } from '../../stores/callStore';

interface IncomingCallModalProps {
  callState: 'idle' | 'incoming' | 'outgoing' | 'active' | 'already_accepted';
  callerName: string;
  callerAvatar?: string;
  callType: 'video' | 'audio';
  otherDeviceMessage: string | null;
  onAccept: () => void;
  onDecline: () => void;
  onDismissOtherDevice: () => void;
}

export const IncomingCallModal: React.FC<IncomingCallModalProps> = ({
  callState,
  callerName,
  callerAvatar,
  callType,
  otherDeviceMessage,
  onAccept,
  onDecline,
  onDismissOtherDevice,
}) => {
  // 1. Notification: Call accepted on another device
  if (callState === 'already_accepted') {
    return (
      <Modal transparent animationType="fade" visible={true}>
        <View style={styles.backdrop}>
          <View style={styles.alertCard}>
            <View style={styles.alertIconWrapper}>
              <Text style={styles.alertEmoji}>📱</Text>
            </View>

            <Text style={styles.alertTitle}>Call Accepted on Another Device</Text>
            <Text style={styles.alertMessage}>
              {otherDeviceMessage ||
                'This call was accepted on another active device or session. Only one user session is valid for call acceptance.'}
            </Text>

            <TouchableOpacity
              style={styles.alertDismissButton}
              onPress={onDismissOtherDevice}
              activeOpacity={0.8}
            >
              <Text style={styles.alertDismissButtonText}>Dismiss</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    );
  }

  // 2. Incoming call modal
  if (callState !== 'incoming') return null;

  return (
    <Modal transparent animationType="slide" visible={true}>
      <View style={styles.backdrop}>
        <View style={styles.incomingCard}>
          {/* Incoming Call Header */}
          <View style={styles.badgePill}>
            <Text style={styles.badgePillText}>
              Incoming {callType === 'video' ? 'Video' : 'Audio'} Call
            </Text>
          </View>

          {/* Caller Avatar & Info */}
          <View style={styles.avatarContainer}>
            <Avatar name={callerName} avatarUrl={callerAvatar} size={90} />
            <Text style={styles.callerName}>{callerName}</Text>
            <Text style={styles.callTypeLabel}>Micropro Commute Calling...</Text>
          </View>

          {/* Action Buttons: Decline & Accept */}
          <View style={styles.actionsContainer}>
            <TouchableOpacity
              style={[styles.actionBtn, styles.declineBtn]}
              onPress={onDecline}
              activeOpacity={0.8}
            >
              <Text style={styles.actionIcon}>✕</Text>
              <Text style={styles.actionBtnText}>Decline</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.actionBtn, styles.acceptBtn]}
              onPress={onAccept}
              activeOpacity={0.8}
            >
              <Text style={styles.actionIcon}>✓</Text>
              <Text style={styles.actionBtnText}>Accept</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(5, 7, 11, 0.88)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 20,
  },
  alertCard: {
    width: '100%',
    maxWidth: 360,
    backgroundColor: Colors.surface,
    borderWidth: 1.5,
    borderColor: Colors.amber,
    borderRadius: 24,
    padding: 24,
    alignItems: 'center',
    shadowColor: Colors.amber,
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.35,
    shadowRadius: 16,
    elevation: 10,
  },
  alertIconWrapper: {
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: 'rgba(245, 158, 11, 0.15)',
    borderWidth: 1,
    borderColor: 'rgba(245, 158, 11, 0.3)',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
  },
  alertEmoji: {
    fontSize: 28,
  },
  alertTitle: {
    color: Colors.textPrimary,
    fontSize: 18,
    fontWeight: '700',
    textAlign: 'center',
    marginBottom: 8,
  },
  alertMessage: {
    color: Colors.textSecondary,
    fontSize: 13.5,
    lineHeight: 20,
    textAlign: 'center',
    marginBottom: 20,
  },
  alertDismissButton: {
    backgroundColor: Colors.amber,
    paddingVertical: 12,
    paddingHorizontal: 28,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  alertDismissButtonText: {
    color: '#000000',
    fontSize: 14,
    fontWeight: '700',
  },
  incomingCard: {
    width: '100%',
    maxWidth: 380,
    backgroundColor: Colors.surface,
    borderWidth: 2,
    borderColor: Colors.teamsPurple,
    borderRadius: 28,
    padding: 28,
    alignItems: 'center',
    shadowColor: Colors.teamsPurple,
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.45,
    shadowRadius: 20,
    elevation: 12,
  },
  badgePill: {
    backgroundColor: 'rgba(91, 95, 199, 0.2)',
    borderWidth: 1,
    borderColor: 'rgba(91, 95, 199, 0.4)',
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 999,
    marginBottom: 24,
  },
  badgePillText: {
    color: Colors.teamsPurpleLight,
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 0.5,
    textTransform: 'uppercase',
  },
  avatarContainer: {
    alignItems: 'center',
    marginBottom: 32,
  },
  callerName: {
    color: Colors.textPrimary,
    fontSize: 22,
    fontWeight: '700',
    marginTop: 16,
    letterSpacing: -0.3,
  },
  callTypeLabel: {
    color: Colors.textSecondary,
    fontSize: 13,
    marginTop: 4,
  },
  actionsContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    width: '100%',
    gap: 16,
  },
  actionBtn: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: 8,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 5,
  },
  declineBtn: {
    backgroundColor: Colors.rose,
    shadowColor: Colors.rose,
  },
  acceptBtn: {
    backgroundColor: Colors.emerald,
    shadowColor: Colors.emerald,
  },
  actionIcon: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '800',
  },
  actionBtnText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '700',
  },
});
