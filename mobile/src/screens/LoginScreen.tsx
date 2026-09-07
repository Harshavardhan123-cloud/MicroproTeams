import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  ActivityIndicator,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { Colors } from '../theme/colors';
import { authStore } from '../stores/authStore';
import { getTargetHostUrl, DEFAULT_SERVER, CLOUDFLARE_TUNNEL_URL } from '../api/client';
import { ServerConfigModal } from '../components/modals/ServerConfigModal';

interface LoginScreenProps {
  onLoginSuccess: () => void;
}

export const LoginScreen: React.FC<LoginScreenProps> = ({ onLoginSuccess }) => {
  const [isRegisterMode, setIsRegisterMode] = useState(false);
  const [email, setEmail] = useState('admin@example.com');
  const [password, setPassword] = useState('password123');
  const [username, setUsername] = useState('admin');
  const [displayName, setDisplayName] = useState('Administrator');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [serverModalVisible, setServerModalVisible] = useState(false);

  const currentServer = getTargetHostUrl();
  const isTunnel = currentServer.includes('trycloudflare.com');

  const handleSubmit = async () => {
    setErrorMsg(null);
    if (!email.trim() || !password.trim()) {
      setErrorMsg('Please enter both email and password');
      return;
    }

    setLoading(true);
    try {
      if (isRegisterMode) {
        await authStore.register({
          email: email.trim(),
          password: password.trim(),
          username: username.trim() || email.split('@')[0],
          display_name: displayName.trim() || username.trim(),
        });
      } else {
        await authStore.login(email.trim(), password.trim());
      }
      onLoginSuccess();
    } catch (err: any) {
      const detail =
        err?.response?.data?.detail ||
        err?.response?.data?.message ||
        err.message ||
        'Authentication failed';
      setErrorMsg(typeof detail === 'string' ? detail : JSON.stringify(detail));
    } finally {
      setLoading(false);
    }
  };

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView contentContainerStyle={styles.scrollContent}>
        {/* Server Connection Banner */}
        <TouchableOpacity
          style={[styles.serverBadge, isTunnel ? styles.serverBadgeTunnel : styles.serverBadgeLan]}
          onPress={() => setServerModalVisible(true)}
          activeOpacity={0.8}
        >
          <View
            style={[
              styles.dot,
              { backgroundColor: isTunnel ? Colors.cyan : Colors.emerald },
            ]}
          />
          <Text style={styles.serverBadgeText}>
            Server: {isTunnel ? 'Cloudflare Tunnel' : '192.168.1.147:8000'}
          </Text>
          <Text style={styles.serverBadgeAction}>Change</Text>
        </TouchableOpacity>

        {/* Brand Header */}
        <View style={styles.header}>
          <View style={styles.brandIcon}>
            <Text style={styles.brandIconText}>M</Text>
          </View>
          <Text style={styles.appName}>MICROPRO COMMUTE</Text>
          <Text style={styles.appTagline}>
            Enterprise Unified Collaboration & Real-Time Mesh Calls
          </Text>
        </View>

        {/* Card */}
        <View style={styles.card}>
          <Text style={styles.cardTitle}>
            {isRegisterMode ? 'Create New Account' : 'Sign in to Workspace'}
          </Text>

          {errorMsg ? (
            <View style={styles.errorBox}>
              <Text style={styles.errorText}>{errorMsg}</Text>
            </View>
          ) : null}

          {isRegisterMode ? (
            <>
              <View style={styles.inputGroup}>
                <Text style={styles.label}>Full Display Name</Text>
                <TextInput
                  style={styles.input}
                  placeholder="e.g. John Carter"
                  placeholderTextColor={Colors.textMuted}
                  value={displayName}
                  onChangeText={setDisplayName}
                />
              </View>

              <View style={styles.inputGroup}>
                <Text style={styles.label}>Username</Text>
                <TextInput
                  style={styles.input}
                  placeholder="e.g. jcarter"
                  placeholderTextColor={Colors.textMuted}
                  value={username}
                  onChangeText={setUsername}
                  autoCapitalize="none"
                />
              </View>
            </>
          ) : null}

          <View style={styles.inputGroup}>
            <Text style={styles.label}>Email Address or Username</Text>
            <TextInput
              style={styles.input}
              placeholder="name@company.com"
              placeholderTextColor={Colors.textMuted}
              value={email}
              onChangeText={setEmail}
              autoCapitalize="none"
              keyboardType="email-address"
            />
          </View>

          <View style={styles.inputGroup}>
            <Text style={styles.label}>Password</Text>
            <TextInput
              style={styles.input}
              placeholder="••••••••"
              placeholderTextColor={Colors.textMuted}
              value={password}
              onChangeText={setPassword}
              secureTextEntry
            />
          </View>

          {/* Submit Button */}
          <TouchableOpacity
            style={styles.submitBtn}
            onPress={handleSubmit}
            disabled={loading}
            activeOpacity={0.8}
          >
            {loading ? (
              <ActivityIndicator color="#FFFFFF" size="small" />
            ) : (
              <Text style={styles.submitBtnText}>
                {isRegisterMode ? 'Register Account' : 'Sign In'}
              </Text>
            )}
          </TouchableOpacity>

          {/* Mode Switcher */}
          <TouchableOpacity
            style={styles.switchModeBtn}
            onPress={() => {
              setIsRegisterMode(!isRegisterMode);
              setErrorMsg(null);
            }}
          >
            <Text style={styles.switchModeText}>
              {isRegisterMode
                ? 'Already have an account? Sign In'
                : "Don't have an account? Create one"}
            </Text>
          </TouchableOpacity>
        </View>

        {/* Quick Demo Credentials Footer */}
        <View style={styles.demoFooter}>
          <Text style={styles.demoTitle}>Demo Credentials Available:</Text>
          <Text style={styles.demoCreds}>admin@example.com / password123</Text>
        </View>
      </ScrollView>

      <ServerConfigModal
        visible={serverModalVisible}
        onClose={() => setServerModalVisible(false)}
      />
    </KeyboardAvoidingView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  scrollContent: {
    padding: 24,
    paddingTop: 48,
    alignItems: 'center',
  },
  serverBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 999,
    borderWidth: 1,
    marginBottom: 24,
    gap: 8,
  },
  serverBadgeLan: {
    backgroundColor: 'rgba(16, 185, 129, 0.12)',
    borderColor: 'rgba(16, 185, 129, 0.3)',
  },
  serverBadgeTunnel: {
    backgroundColor: 'rgba(6, 182, 212, 0.12)',
    borderColor: 'rgba(6, 182, 212, 0.3)',
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  serverBadgeText: {
    color: Colors.textPrimary,
    fontSize: 12,
    fontWeight: '600',
  },
  serverBadgeAction: {
    color: Colors.primary,
    fontSize: 12,
    fontWeight: '700',
    textDecorationLine: 'underline',
  },
  header: {
    alignItems: 'center',
    marginBottom: 28,
  },
  brandIcon: {
    width: 64,
    height: 64,
    borderRadius: 20,
    backgroundColor: Colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
    shadowColor: Colors.primary,
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.45,
    shadowRadius: 12,
    elevation: 8,
  },
  brandIconText: {
    color: '#FFFFFF',
    fontSize: 32,
    fontWeight: '900',
  },
  appName: {
    color: Colors.textPrimary,
    fontSize: 22,
    fontWeight: '800',
    letterSpacing: 1.5,
    marginBottom: 6,
  },
  appTagline: {
    color: Colors.textSecondary,
    fontSize: 12,
    textAlign: 'center',
    maxWidth: 280,
    lineHeight: 18,
  },
  card: {
    width: '100%',
    maxWidth: 400,
    backgroundColor: Colors.surface,
    borderRadius: 24,
    borderWidth: 1,
    borderColor: Colors.surfaceBorder,
    padding: 24,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.4,
    shadowRadius: 16,
    elevation: 8,
  },
  cardTitle: {
    color: Colors.textPrimary,
    fontSize: 17,
    fontWeight: '700',
    marginBottom: 16,
    textAlign: 'center',
  },
  errorBox: {
    backgroundColor: 'rgba(239, 68, 68, 0.12)',
    borderWidth: 1,
    borderColor: 'rgba(239, 68, 68, 0.3)',
    borderRadius: 12,
    padding: 12,
    marginBottom: 16,
  },
  errorText: {
    color: Colors.rose,
    fontSize: 12.5,
    fontWeight: '600',
  },
  inputGroup: {
    marginBottom: 14,
  },
  label: {
    color: Colors.textSecondary,
    fontSize: 12,
    fontWeight: '600',
    marginBottom: 6,
  },
  input: {
    backgroundColor: Colors.surfaceLight,
    borderWidth: 1,
    borderColor: Colors.surfaceBorder,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    color: Colors.textPrimary,
    fontSize: 14,
  },
  submitBtn: {
    backgroundColor: Colors.primary,
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 8,
    shadowColor: Colors.primary,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.35,
    shadowRadius: 8,
    elevation: 4,
  },
  submitBtnText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '700',
  },
  switchModeBtn: {
    marginTop: 16,
    alignItems: 'center',
  },
  switchModeText: {
    color: Colors.textSecondary,
    fontSize: 13,
  },
  demoFooter: {
    marginTop: 24,
    alignItems: 'center',
  },
  demoTitle: {
    color: Colors.textMuted,
    fontSize: 11,
    fontWeight: '600',
  },
  demoCreds: {
    color: Colors.textSecondary,
    fontSize: 12,
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
    marginTop: 2,
  },
});
