import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  Modal,
  ScrollView,
  TouchableOpacity,
  Platform,
} from 'react-native';
import { Colors } from '../../theme/colors';
import type {
  AudioRoute,
  LocalDeviceState,
  MediaDeviceInfo,
} from '../../services/MeetingWebRTCManager';

interface DeviceSettingsModalProps {
  visible: boolean;
  onClose: () => void;
  deviceState: LocalDeviceState;
  onSelectMicrophone: (deviceId: string) => void;
  onSelectCamera: (deviceId: string) => void;
  onFlipCamera: () => void;
  onSelectAudioRoute: (route: AudioRoute) => void;
  onRefreshDevices: () => void;
}

const AUDIO_ROUTES: Array<{ route: AudioRoute; icon: string; label: string }> = [
  { route: 'earpiece', icon: '🔈', label: 'Earpiece' },
  { route: 'speaker', icon: '🔊', label: 'Speaker' },
  { route: 'bluetooth', icon: '🎧', label: 'Bluetooth' },
];

const facingLabel = (device: MediaDeviceInfo): string | null => {
  if (device.facing === 'front') return 'Front';
  if (device.facing === 'environment') return 'Back';
  return null;
};

const deviceLabel = (device: MediaDeviceInfo, fallback: string): string =>
  device.label && device.label.trim().length > 0 ? device.label : fallback;

interface DeviceRowProps {
  title: string;
  subtitle?: string | null;
  badge?: string | null;
  selected: boolean;
  disabled?: boolean;
  onPress?: () => void;
}

const DeviceRow: React.FC<DeviceRowProps> = ({
  title,
  subtitle,
  badge,
  selected,
  disabled,
  onPress,
}) => (
  <TouchableOpacity
    style={[styles.row, selected && styles.rowSelected, disabled && styles.rowDisabled]}
    onPress={onPress}
    disabled={disabled || !onPress}
    activeOpacity={0.75}
  >
    <View style={styles.rowTextGroup}>
      <View style={styles.rowTitleLine}>
        <Text style={styles.rowTitle} numberOfLines={1}>
          {title}
        </Text>
        {badge ? (
          <View style={styles.rowBadge}>
            <Text style={styles.rowBadgeText}>{badge}</Text>
          </View>
        ) : null}
      </View>
      {subtitle ? (
        <Text style={styles.rowSubtitle} numberOfLines={2}>
          {subtitle}
        </Text>
      ) : null}
    </View>
    {selected ? <Text style={styles.rowCheck}>✓</Text> : null}
  </TouchableOpacity>
);

/**
 * In-call audio / camera picker.
 *
 * The honest-limits part of this screen is not cosmetic — it is what the
 * platform actually reports:
 *
 *  - `enumerateDevices()` on Android returns video inputs plus exactly ONE
 *    synthetic `{ deviceId: 'audio-1', kind: 'audioinput', label: 'Audio' }`
 *    entry, and NEVER any `audiooutput` entry. There is therefore no output
 *    device list that can be built from enumeration, and no meaningful input
 *    list either — so this renders an earpiece/speaker/Bluetooth route toggle
 *    instead of an empty picker, and states plainly that the microphone cannot
 *    be chosen individually.
 *  - `MeetingWebRTCManager.setAudioRoute()` is deliberately state-only:
 *    react-native-webrtc exposes no routing API and this build ships no native
 *    audio-routing module, so the selection is remembered but the operating
 *    system route is unchanged. Saying so here is better than a control that
 *    silently does nothing.
 */
export const DeviceSettingsModal: React.FC<DeviceSettingsModalProps> = ({
  visible,
  onClose,
  deviceState,
  onSelectMicrophone,
  onSelectCamera,
  onFlipCamera,
  onSelectAudioRoute,
  onRefreshDevices,
}) => {
  const { availableMics, availableCams, availableSpeakers } = deviceState;
  const micPickable = availableMics.length > 1;

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <View style={styles.card}>
          <View style={styles.header}>
            <Text style={styles.title}>Audio &amp; Devices</Text>
            <TouchableOpacity style={styles.closeBtn} onPress={onClose} activeOpacity={0.7}>
              <Text style={styles.closeText}>✕</Text>
            </TouchableOpacity>
          </View>

          <ScrollView
            style={styles.scrollArea}
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
          >
            {/* ── Audio output ─────────────────────────────────────────── */}
            <Text style={styles.sectionLabel}>Audio Output</Text>

            <View style={styles.segmentRow}>
              {AUDIO_ROUTES.map((option) => {
                const active = deviceState.audioRoute === option.route;
                return (
                  <TouchableOpacity
                    key={option.route}
                    style={[styles.segment, active && styles.segmentActive]}
                    onPress={() => onSelectAudioRoute(option.route)}
                    activeOpacity={0.75}
                  >
                    <Text style={styles.segmentIcon}>{option.icon}</Text>
                    <Text style={[styles.segmentText, active && styles.segmentTextActive]}>
                      {option.label}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>

            <View style={styles.noticeCard}>
              <Text style={styles.noticeTitle}>▲ Output routing is not applied yet</Text>
              <Text style={styles.noticeText}>
                {Platform.OS === 'android'
                  ? 'Android never reports audio output devices to WebRTC, so there is no output list to pick from. '
                  : ''}
                This choice is remembered by the app, but switching the operating-system
                route needs a native audio module that this build does not include —
                playback follows the system default for now.
              </Text>
            </View>

            {/* Never populated on Android; rendered only if a platform ever does. */}
            {availableSpeakers.length > 0 ? (
              <View style={styles.list}>
                {availableSpeakers.map((speaker, index) => (
                  <DeviceRow
                    key={speaker.deviceId || `speaker-${index}`}
                    title={deviceLabel(speaker, `Output ${index + 1}`)}
                    selected={deviceState.selectedSpeakerId === speaker.deviceId}
                    onPress={undefined}
                  />
                ))}
              </View>
            ) : null}

            <View style={styles.divider} />

            {/* ── Microphone ───────────────────────────────────────────── */}
            <Text style={styles.sectionLabel}>Microphone</Text>

            {micPickable ? (
              <View style={styles.list}>
                {availableMics.map((mic, index) => (
                  <DeviceRow
                    key={mic.deviceId || `mic-${index}`}
                    title={deviceLabel(mic, `Microphone ${index + 1}`)}
                    subtitle={mic.deviceId}
                    selected={deviceState.selectedMicId === mic.deviceId}
                    onPress={() => onSelectMicrophone(mic.deviceId)}
                  />
                ))}
              </View>
            ) : (
              <View style={styles.list}>
                <DeviceRow
                  title="System microphone"
                  subtitle={
                    availableMics.length === 1
                      ? `Reported as "${deviceLabel(availableMics[0], 'Audio')}" — a single synthetic entry`
                      : 'No microphone has been enumerated yet'
                  }
                  selected
                  disabled
                />
                <Text style={styles.helperText}>
                  Android exposes one synthetic microphone entry to WebRTC, so individual
                  input devices cannot be selected. The mic follows the system input —
                  including a headset when one is plugged in.
                </Text>
              </View>
            )}

            <View style={styles.divider} />

            {/* ── Camera ───────────────────────────────────────────────── */}
            <Text style={styles.sectionLabel}>Camera</Text>

            <TouchableOpacity style={styles.flipBtn} onPress={onFlipCamera} activeOpacity={0.8}>
              <Text style={styles.flipIcon}>🔄</Text>
              <View style={styles.flipTextGroup}>
                <Text style={styles.flipTitle}>Flip Camera</Text>
                <Text style={styles.flipSubtitle}>
                  Currently using the{' '}
                  {deviceState.cameraFacing === 'front' ? 'front' : 'back'} lens
                </Text>
              </View>
            </TouchableOpacity>

            {availableCams.length > 0 ? (
              <View style={styles.list}>
                {availableCams.map((cam, index) => {
                  const selected =
                    deviceState.selectedCamId === cam.deviceId ||
                    (deviceState.selectedCamId === 'default' &&
                      cam.facing === deviceState.cameraFacing);
                  return (
                    <DeviceRow
                      key={cam.deviceId || `cam-${index}`}
                      title={deviceLabel(cam, `Camera ${index + 1}`)}
                      subtitle={`Device id ${cam.deviceId}`}
                      badge={facingLabel(cam)}
                      selected={selected}
                      onPress={() => onSelectCamera(cam.deviceId)}
                    />
                  );
                })}
              </View>
            ) : (
              <Text style={styles.helperText}>
                No cameras enumerated yet. Grant the camera permission and refresh.
              </Text>
            )}

            <Text style={styles.helperText}>
              Flipping switches the lens in place — no track swap and no renegotiation, so
              other participants only see the picture change. Picking a specific camera
              re-acquires the video track instead.
            </Text>
          </ScrollView>

          <View style={styles.actionRow}>
            <TouchableOpacity
              style={styles.secondaryButton}
              onPress={onRefreshDevices}
              activeOpacity={0.7}
            >
              <Text style={styles.secondaryButtonText}>Refresh Devices</Text>
            </TouchableOpacity>

            <TouchableOpacity style={styles.primaryButton} onPress={onClose} activeOpacity={0.8}>
              <Text style={styles.primaryButtonText}>Done</Text>
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
    backgroundColor: 'rgba(5, 7, 11, 0.85)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  card: {
    width: '100%',
    maxWidth: 400,
    maxHeight: '90%',
    backgroundColor: Colors.surface,
    borderRadius: 24,
    padding: 24,
    borderWidth: 1,
    borderColor: Colors.surfaceBorder,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.5,
    shadowRadius: 20,
    elevation: 10,
  },
  scrollArea: {
    flexGrow: 0,
    flexShrink: 1,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 14,
  },
  title: {
    color: Colors.textPrimary,
    fontSize: 18,
    fontWeight: '700',
  },
  closeBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: Colors.surfaceLight,
    alignItems: 'center',
    justifyContent: 'center',
  },
  closeText: {
    color: Colors.textSecondary,
    fontSize: 14,
    fontWeight: '700',
  },
  sectionLabel: {
    color: Colors.textSecondary,
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 0.4,
    textTransform: 'uppercase',
    marginBottom: 10,
  },
  segmentRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 12,
  },
  segment: {
    flex: 1,
    backgroundColor: Colors.surfaceLight,
    borderWidth: 1.5,
    borderColor: Colors.surfaceBorderLight,
    borderRadius: 12,
    paddingVertical: 10,
    alignItems: 'center',
  },
  segmentActive: {
    borderColor: Colors.primary,
    backgroundColor: 'rgba(99, 102, 241, 0.12)',
  },
  segmentIcon: {
    fontSize: 18,
    marginBottom: 3,
  },
  segmentText: {
    color: Colors.textSecondary,
    fontSize: 11.5,
    fontWeight: '600',
  },
  segmentTextActive: {
    color: Colors.textPrimary,
  },
  noticeCard: {
    backgroundColor: 'rgba(245, 158, 11, 0.1)',
    borderWidth: 1,
    borderColor: 'rgba(245, 158, 11, 0.3)',
    borderRadius: 12,
    padding: 12,
    marginBottom: 16,
  },
  noticeTitle: {
    color: Colors.amber,
    fontSize: 12,
    fontWeight: '700',
    marginBottom: 4,
  },
  noticeText: {
    color: Colors.textSecondary,
    fontSize: 11.5,
    lineHeight: 16,
  },
  divider: {
    height: 1,
    backgroundColor: Colors.surfaceBorder,
    marginBottom: 16,
  },
  list: {
    marginBottom: 16,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: Colors.surfaceLight,
    borderWidth: 1.5,
    borderColor: Colors.surfaceBorderLight,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    marginBottom: 8,
  },
  rowSelected: {
    borderColor: Colors.primary,
    backgroundColor: 'rgba(99, 102, 241, 0.12)',
  },
  rowDisabled: {
    opacity: 0.85,
  },
  rowTextGroup: {
    flex: 1,
    paddingRight: 10,
  },
  rowTitleLine: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  rowTitle: {
    color: Colors.textPrimary,
    fontSize: 13.5,
    fontWeight: '600',
    flexShrink: 1,
  },
  rowBadge: {
    backgroundColor: 'rgba(99, 102, 241, 0.15)',
    borderWidth: 1,
    borderColor: 'rgba(99, 102, 241, 0.3)',
    borderRadius: 999,
    paddingHorizontal: 8,
    paddingVertical: 2,
  },
  rowBadgeText: {
    color: Colors.teamsPurpleLight,
    fontSize: 9.5,
    fontWeight: '800',
  },
  rowSubtitle: {
    color: Colors.textMuted,
    fontSize: 11,
    marginTop: 2,
  },
  rowCheck: {
    color: Colors.primary,
    fontSize: 16,
    fontWeight: '800',
  },
  helperText: {
    color: Colors.textMuted,
    fontSize: 11,
    lineHeight: 16,
    marginBottom: 12,
  },
  flipBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.surfaceLight,
    borderWidth: 1.5,
    borderColor: Colors.surfaceBorderLight,
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 12,
    marginBottom: 12,
    gap: 12,
  },
  flipIcon: {
    fontSize: 20,
  },
  flipTextGroup: {
    flex: 1,
  },
  flipTitle: {
    color: Colors.textPrimary,
    fontSize: 13.5,
    fontWeight: '700',
  },
  flipSubtitle: {
    color: Colors.textMuted,
    fontSize: 11,
    marginTop: 2,
  },
  actionRow: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 14,
  },
  secondaryButton: {
    flex: 1,
    backgroundColor: Colors.surfaceLight,
    borderWidth: 1,
    borderColor: Colors.surfaceBorder,
    paddingVertical: 12,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  secondaryButtonText: {
    color: Colors.textPrimary,
    fontSize: 13.5,
    fontWeight: '600',
  },
  primaryButton: {
    flex: 1,
    backgroundColor: Colors.primary,
    paddingVertical: 12,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  primaryButtonText: {
    color: '#FFFFFF',
    fontSize: 13.5,
    fontWeight: '700',
  },
});
