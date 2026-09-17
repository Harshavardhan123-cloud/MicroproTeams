import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  SafeAreaView,
  ActivityIndicator,
} from 'react-native';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { Colors } from '../theme/colors';
import { Avatar } from '../components/common/Avatar';
import { callStore, DEFAULT_CALL_ROOM_ID } from '../stores/callStore';
import { AddPeopleModal } from '../components/call/AddPeopleModal';
import { Toast } from '../components/common/Toast';
import { MeetingRoomScreen } from './MeetingRoomScreen';
import type { RootStackParamList } from '../navigation/types';

/**
 * CallScreen is the *signalling* surface: it owns the outgoing / ringing states
 * of a call-control exchange that runs over the FastAPI WebSocket. Once the call
 * reaches 'active' it hands the whole viewport to MeetingRoomScreen, which owns
 * the mediasoup session, the participant grid and the in-call controls.
 *
 * WHY THE ROOM GETS ITS OWN NAVIGATOR HERE
 * ----------------------------------------
 * `App.tsx` renders CallScreen from a branch that returns BEFORE the app's
 * `<NavigationContainer>` is mounted (whenever callState is 'active' or
 * 'outgoing'), so there is no navigator in scope and no way to
 * `navigation.navigate('MeetingRoom', …)` from here. MeetingRoomScreen is a
 * react-navigation screen that reads `useRoute()` / `useNavigation()`
 * unconditionally, and both of those throw outside a container — so the room is
 * hosted in a dedicated single-screen container instead of being composed in as
 * a plain component.
 *
 * This is safe precisely because of that early return: the app's main container
 * is unmounted for the whole time this one is mounted, so the two never coexist.
 * MeetingRoomScreen is ALSO registered on the main stack (RootNavigator), which
 * is the path meetings take when opened from the Meetings tab; that route is
 * unaffected by this one.
 *
 * The cleaner end state is for App.tsx to stop short-circuiting on 'active' and
 * let the main navigator own the room. This file needs no change when it does.
 */
const CallStack = createNativeStackNavigator<RootStackParamList>();

const formatTime = (secs: number) => {
  const m = Math.floor(secs / 60);
  const s = secs % 60;
  return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
};

// ---------------------------------------------------------------------------
// Failure containment
// ---------------------------------------------------------------------------

/**
 * A render error inside the meeting room would otherwise unmount the whole app
 * (CallScreen is the root element in this branch) and leave the user with a white
 * screen and a live, unhangupable call. The fallback keeps the call controllable.
 */
class MeetingRoomBoundary extends React.Component<
  { children: React.ReactNode; fallback: (error: Error) => React.ReactNode },
  { error: Error | null }
> {
  state: { error: Error | null } = { error: null };

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  componentDidCatch(error: Error) {
    console.error('[CALL] Meeting room failed to render:', error);
  }

  render() {
    if (this.state.error) return this.props.fallback(this.state.error);
    return this.props.children;
  }
}

// ---------------------------------------------------------------------------

export const CallScreen: React.FC = () => {
  const [callState, setCallState] = useState(callStore.getState());
  const [addPeopleModalVisible, setAddPeopleModalVisible] = useState(false);
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [ringSeconds, setRingSeconds] = useState(0);

  useEffect(() => {
    const unsub = callStore.subscribe(() => {
      setCallState(callStore.getState());
    });
    return () => unsub();
  }, []);

  const isRinging = callState.callState === 'outgoing';

  // Ring elapsed timer — reset whenever a new outgoing call starts.
  useEffect(() => {
    if (!isRinging) {
      setRingSeconds(0);
      return;
    }
    setRingSeconds(0);
    const timer = setInterval(() => setRingSeconds((s) => s + 1), 1000);
    return () => clearInterval(timer);
  }, [isRinging, callState.callId]);

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 3500);
  };

  // ── Active call: the meeting room owns the viewport from here on.
  if (callState.callState === 'active') {
    return (
      <MeetingRoomBoundary
        fallback={(error) => (
          <CallFallback
            message={error.message || 'The meeting room failed to load.'}
            onEnd={() => callStore.endCall(true)}
          />
        )}
      >
        {/* Keyed on the call so a subsequent call remounts with fresh params —
            initialParams are only read on a screen's first mount. `displayName`
            is deliberately omitted: the room resolves it from the signed-in user,
            and the value the SFU wants is this device's own name, not the peer's.
            No `meetingId`, because an accepted call has no lobby to sit in. */}
        <NavigationContainer key={callState.callId || 'call'}>
          <CallStack.Navigator screenOptions={{ headerShown: false }}>
            <CallStack.Screen
              name="MeetingRoom"
              component={MeetingRoomScreen}
              initialParams={{
                roomId: callState.roomId || DEFAULT_CALL_ROOM_ID,
                callType: callState.callType,
                isHost: callState.isCaller,
              }}
            />
          </CallStack.Navigator>
        </NavigationContainer>
      </MeetingRoomBoundary>
    );
  }

  // ── Anything that is not a live outgoing call has no signalling UI to show.
  //    App.tsx only routes 'active' and 'outgoing' here; this is belt and braces.
  if (!isRinging) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.centered}>
          <ActivityIndicator color={Colors.primary} size="large" />
          <Text style={styles.statusLine}>Connecting…</Text>
        </View>
      </SafeAreaView>
    );
  }

  const target = callState.recipient || callState.caller;
  const targetName = target?.name || 'Teammate';

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
          <View style={styles.callTypePill}>
            <Text style={styles.callTypePillText}>
              {callState.callType === 'audio' ? 'Audio' : 'Video'}
            </Text>
          </View>
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

      {/* Media engine failures surface here so a call that will never carry audio
          or video says so instead of ringing silently forever. */}
      {callState.mediaError ? (
        <TouchableOpacity
          style={styles.errorBanner}
          onPress={() => callStore.clearMediaError()}
          activeOpacity={0.8}
        >
          <Text style={styles.errorBannerText}>{callState.mediaError}</Text>
          <Text style={styles.errorBannerDismiss}>Tap to dismiss</Text>
        </TouchableOpacity>
      ) : null}

      {/* Ringing card */}
      <View style={styles.ringingStage}>
        <View style={styles.ringHalo}>
          <Avatar name={targetName} avatarUrl={target?.avatar} size={112} />
        </View>

        <Text style={styles.calleeName}>{targetName}</Text>
        <Text style={styles.statusLine}>
          {callState.mediaState === 'reconnecting' ? 'Reconnecting…' : 'Ringing…'}
        </Text>
        <Text style={styles.ringTimer}>{formatTime(ringSeconds)}</Text>

        {callState.participants.length > 2 ? (
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.invitedRow}
          >
            {callState.participants.map((participant) => (
              <View key={participant.id} style={styles.invitedChip}>
                <Avatar
                  name={participant.name}
                  avatarUrl={participant.avatar}
                  size={26}
                />
                <Text style={styles.invitedName} numberOfLines={1}>
                  {participant.name}
                </Text>
              </View>
            ))}
          </ScrollView>
        ) : null}
      </View>

      {/* Ringing dock — media controls stay in the meeting room; the only action
          that exists before the call is answered is cancelling it. */}
      <View style={styles.hudDock}>
        <TouchableOpacity
          style={[styles.hudButton, styles.hudButtonPrimary]}
          onPress={() => setAddPeopleModalVisible(true)}
          activeOpacity={0.7}
        >
          <Text style={styles.hudEmoji}>👥</Text>
          <Text style={styles.hudLabel}>Add People</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.hudButton, styles.hudButtonEndCall]}
          onPress={() => {
            showToast('Cancelling call…');
            callStore.endCall(true);
          }}
          activeOpacity={0.7}
        >
          <Text style={styles.hudEmoji}>📞</Text>
          <Text style={styles.hudLabel}>Cancel</Text>
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

/** Last-resort in-call UI: the call is live, the room screen is not. */
const CallFallback: React.FC<{ message: string; onEnd: () => void }> = ({ message, onEnd }) => (
  <SafeAreaView style={styles.container}>
    <View style={styles.centered}>
      <Text style={styles.fallbackTitle}>Call connected</Text>
      <Text style={styles.fallbackBody}>{message}</Text>
      <TouchableOpacity
        style={[styles.hudButton, styles.hudButtonEndCall, styles.fallbackEndBtn]}
        onPress={onEnd}
        activeOpacity={0.7}
      >
        <Text style={styles.hudEmoji}>📞</Text>
        <Text style={styles.hudLabel}>End Call</Text>
      </TouchableOpacity>
    </View>
  </SafeAreaView>
);

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  centered: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
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
  errorBanner: {
    marginHorizontal: 16,
    marginTop: 10,
    padding: 10,
    borderRadius: 12,
    backgroundColor: 'rgba(239, 68, 68, 0.14)',
    borderWidth: 1,
    borderColor: 'rgba(239, 68, 68, 0.35)',
  },
  errorBannerText: {
    color: '#FCA5A5',
    fontSize: 12,
    fontWeight: '600',
  },
  errorBannerDismiss: {
    color: Colors.textMuted,
    fontSize: 10,
    marginTop: 2,
  },
  ringingStage: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 24,
  },
  ringHalo: {
    padding: 14,
    borderRadius: 999,
    borderWidth: 2,
    borderColor: 'rgba(99, 102, 241, 0.35)',
    backgroundColor: 'rgba(99, 102, 241, 0.08)',
  },
  calleeName: {
    color: Colors.textPrimary,
    fontSize: 22,
    fontWeight: '800',
    marginTop: 18,
    textAlign: 'center',
  },
  statusLine: {
    color: Colors.textSecondary,
    fontSize: 13,
    marginTop: 8,
  },
  ringTimer: {
    color: Colors.textMuted,
    fontSize: 12,
    fontWeight: '700',
    marginTop: 4,
    letterSpacing: 1,
  },
  invitedRow: {
    gap: 8,
    paddingTop: 22,
    paddingHorizontal: 4,
  },
  invitedChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.surfaceBorder,
    borderRadius: 999,
    paddingVertical: 4,
    paddingHorizontal: 8,
    maxWidth: 150,
  },
  invitedName: {
    color: Colors.textSecondary,
    fontSize: 11,
    fontWeight: '600',
    flexShrink: 1,
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
  hudButtonPrimary: {
    backgroundColor: 'rgba(99, 102, 241, 0.15)',
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
  fallbackTitle: {
    color: Colors.textPrimary,
    fontSize: 18,
    fontWeight: '800',
  },
  fallbackBody: {
    color: Colors.textSecondary,
    fontSize: 12.5,
    textAlign: 'center',
    marginTop: 8,
  },
  fallbackEndBtn: {
    marginTop: 24,
  },
});
