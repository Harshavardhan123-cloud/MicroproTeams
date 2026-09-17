import React, { useState, useEffect } from 'react';
import {
  SafeAreaView,
  StatusBar,
  StyleSheet,
  View,
  Text,
  ActivityIndicator,
} from 'react-native';
import { NavigationContainer } from '@react-navigation/native';
import { Colors } from './theme/colors';
import { initApiClient } from './api/client';
import { authStore } from './stores/authStore';
import { callStore } from './stores/callStore';
import { ringtoneService } from './services/ringtoneService';
import { Header } from './components/common/Header';
import { LoginScreen } from './screens/LoginScreen';
import { CallScreen } from './screens/CallScreen';
import { IncomingCallModal } from './components/call/IncomingCallModal';
import { ServerConfigModal } from './components/modals/ServerConfigModal';
import { RootNavigator } from './navigation/RootNavigator';
import { linking } from './navigation/linking';

export default function App() {
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
        <Text style={styles.splashSub}>Enterprise Unified Collaboration</Text>
        <ActivityIndicator color={Colors.primary} size="large" style={{ marginTop: 24 }} />
      </View>
    );
  }

  // Not authenticated -> Render Login Screen
  if (!authState.isAuthenticated) {
    return (
      <SafeAreaView style={styles.container}>
        <StatusBar barStyle="light-content" backgroundColor={Colors.background} />
        <LoginScreen onLoginSuccess={() => {}} />
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

      {/* Obsidian Header with Server Indicator & User Presence */}
      <Header
        title="Micropro Commute"
        subtitle={authState.user?.display_name || authState.user?.username || 'Workspace'}
        onOpenServerConfig={() => setServerModalVisible(true)}
      />

      {/* Main Workspace Navigation (tabs + pushed screens like Thread) */}
      <View style={styles.screenContent}>
        <NavigationContainer linking={linking}>
          <RootNavigator />
        </NavigationContainer>
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

      {/* Server Config Modal */}
      <ServerConfigModal
        visible={serverModalVisible}
        onClose={() => setServerModalVisible(false)}
        onServerChanged={() => {
          authStore.checkAuth();
        }}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  screenContent: {
    flex: 1,
  },
  loadingContainer: {
    flex: 1,
    backgroundColor: Colors.background,
    alignItems: 'center',
    justifyContent: 'center',
  },
  splashBrand: {
    width: 72,
    height: 72,
    borderRadius: 22,
    backgroundColor: Colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 18,
    shadowColor: Colors.primary,
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.45,
    shadowRadius: 12,
    elevation: 8,
  },
  splashLogo: {
    color: '#FFFFFF',
    fontSize: 36,
    fontWeight: '900',
  },
  splashText: {
    color: Colors.textPrimary,
    fontSize: 20,
    fontWeight: '800',
    letterSpacing: 2,
    marginBottom: 4,
  },
  splashSub: {
    color: Colors.textSecondary,
    fontSize: 12,
  },
});
