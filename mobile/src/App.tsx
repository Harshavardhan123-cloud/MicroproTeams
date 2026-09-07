import React, { useState, useEffect } from 'react';
import {
  SafeAreaView,
  StatusBar,
  StyleSheet,
  View,
  Text,
  TouchableOpacity,
  ActivityIndicator,
} from 'react-native';
import { Colors } from './theme/colors';
import { initApiClient } from './api/client';
import { authStore } from './stores/authStore';
import { callStore } from './stores/callStore';
import { ringtoneService } from './services/ringtoneService';
import { Header } from './components/common/Header';
import { LoginScreen } from './screens/LoginScreen';
import { ChatsScreen } from './screens/ChatsScreen';
import { MeetingsScreen } from './screens/MeetingsScreen';
import { CallScreen } from './screens/CallScreen';
import { ProfileSettingsScreen } from './screens/ProfileSettingsScreen';
import { IncomingCallModal } from './components/call/IncomingCallModal';
import { ServerConfigModal } from './components/modals/ServerConfigModal';

type Tab = 'chats' | 'meetings' | 'settings';

export default function App() {
  const [activeTab, setActiveTab] = useState<Tab>('chats');
  const [authState, setAuthState] = useState(authStore.getState());
  const [callState, setCallState] = useState(callStore.getState());
  const [serverModalVisible, setServerModalVisible] = useState(false);

  useEffect(() => {
    // 1. Initialize API Client & Ringtone Service
    initApiClient().then(() => {
      authStore.checkAuth();
    });
    ringtoneService.init();

    // 2. Subscribe to store changes
    const unsubAuth = authStore.subscribe(() => {
      setAuthState(authStore.getState());
    });
    const unsubCall = callStore.subscribe(() => {
      setCallState(callStore.getState());
    });

    return () => {
      unsubAuth();
      unsubCall();
    };
  }, []);

  if (authState.isLoading) {
    return (
      <View style={styles.loadingContainer}>
        <StatusBar barStyle="light-content" backgroundColor={Colors.background} />
        <View style={styles.splashBrand}>
          <Text style={styles.splashLogo}>M</Text>
        </View>
        <Text style={styles.splashText}>MICROPRO COMMUTE</Text>
        <ActivityIndicator color={Colors.primary} size="large" style={{ marginTop: 24 }} />
      </View>
    );
  }

  // Not authenticated -> Render Login Screen
  if (!authState.isAuthenticated) {
    return (
      <SafeAreaView style={styles.container}>
        <StatusBar barStyle="light-content" backgroundColor={Colors.background} />
        <LoginScreen onLoginSuccess={() => setActiveTab('chats')} />
      </SafeAreaView>
    );
  }

  // Active call -> Render CallScreen (Full Screen HUD)
  if (callState.callState === 'active' || callState.callState === 'outgoing') {
    return (
      <SafeAreaView style={styles.container}>
        <StatusBar barStyle="light-content" backgroundColor={Colors.background} />
        <CallScreen />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor={Colors.background} />

      {/* Obsidian Header with Server Indicator */}
      <Header
        title="Micropro Commute"
        subtitle={authState.user?.display_name || authState.user?.username || 'Workspace'}
        onOpenServerConfig={() => setServerModalVisible(true)}
      />

      {/* Main Tab Screen Content */}
      <View style={styles.screenContent}>
        {activeTab === 'chats' && <ChatsScreen />}
        {activeTab === 'meetings' && <MeetingsScreen />}
        {activeTab === 'settings' && <ProfileSettingsScreen />}
      </View>

      {/* Obsidian Bottom Dock Navigation */}
      <View style={styles.bottomDock}>
        <TouchableOpacity
          style={[styles.dockItem, activeTab === 'chats' && styles.dockItemActive]}
          onPress={() => setActiveTab('chats')}
          activeOpacity={0.7}
        >
          <Text style={styles.dockEmoji}>💬</Text>
          <Text style={[styles.dockLabel, activeTab === 'chats' && styles.dockLabelActive]}>
            Chats
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.dockItem, activeTab === 'meetings' && styles.dockItemActive]}
          onPress={() => setActiveTab('meetings')}
          activeOpacity={0.7}
        >
          <Text style={styles.dockEmoji}>📅</Text>
          <Text style={[styles.dockLabel, activeTab === 'meetings' && styles.dockLabelActive]}>
            Meetings
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.dockItem, activeTab === 'settings' && styles.dockItemActive]}
          onPress={() => setActiveTab('settings')}
          activeOpacity={0.7}
        >
          <Text style={styles.dockEmoji}>⚙️</Text>
          <Text style={[styles.dockLabel, activeTab === 'settings' && styles.dockLabelActive]}>
            Settings
          </Text>
        </TouchableOpacity>
      </View>

      {/* Incoming Call Modal & Multi-device Sync Alert */}
      <IncomingCallModal
        callState={callState.callState}
        callerName={callState.caller?.name || 'Incoming Caller'}
        callerAvatar={callState.caller?.avatar}
        callType={callState.callType}
        otherDeviceMessage={callState.otherDeviceAcceptedMessage}
        onAccept={() => callStore.acceptCall()}
        onDecline={() => callStore.declineCall()}
        onDismissOtherDevice={() => callStore.dismissOtherDeviceAlert()}
      />

      {/* Server Config Gateway Modal */}
      <ServerConfigModal
        visible={serverModalVisible}
        onClose={() => setServerModalVisible(false)}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  loadingContainer: {
    flex: 1,
    backgroundColor: Colors.background,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  splashBrand: {
    width: 72,
    height: 72,
    borderRadius: 24,
    backgroundColor: Colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
    shadowColor: Colors.primary,
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.5,
    shadowRadius: 16,
    elevation: 8,
  },
  splashLogo: {
    color: '#FFFFFF',
    fontSize: 36,
    fontWeight: '900',
  },
  splashText: {
    color: Colors.textPrimary,
    fontSize: 18,
    fontWeight: '800',
    letterSpacing: 2,
  },
  screenContent: {
    flex: 1,
  },
  bottomDock: {
    flexDirection: 'row',
    backgroundColor: Colors.surface,
    borderTopWidth: 1,
    borderTopColor: Colors.surfaceBorder,
    paddingVertical: 10,
    paddingHorizontal: 16,
    justifyContent: 'space-around',
  },
  dockItem: {
    alignItems: 'center',
    paddingVertical: 6,
    paddingHorizontal: 20,
    borderRadius: 14,
  },
  dockItemActive: {
    backgroundColor: 'rgba(99, 102, 241, 0.15)',
  },
  dockEmoji: {
    fontSize: 20,
    marginBottom: 2,
  },
  dockLabel: {
    color: Colors.textMuted,
    fontSize: 11,
    fontWeight: '600',
  },
  dockLabelActive: {
    color: Colors.primary,
    fontWeight: '700',
  },
});
