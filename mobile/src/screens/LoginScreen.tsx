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

type ViewState = 'login' | 'register' | 'register-otp' | 'forgot-email' | 'forgot-reset';

const getErrorMessage = (err: any, fallback: string): string => {
  const detail =
    err?.response?.data?.error?.message ||
    err?.response?.data?.detail ||
    err?.response?.data?.message ||
    err?.message ||
    fallback;
  return typeof detail === 'string' ? detail : JSON.stringify(detail);
};

export const LoginScreen: React.FC<LoginScreenProps> = ({ onLoginSuccess }) => {
  const [view, setView] = useState<ViewState>('login');

  // Shared login fields
  const [email, setEmail] = useState('admin@example.com');
  const [password, setPassword] = useState('password123');

  // Registration fields
  const [organizationName, setOrganizationName] = useState('');
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [username, setUsername] = useState('');
  const [registerOtp, setRegisterOtp] = useState('');
  const [registerDevOtp, setRegisterDevOtp] = useState<string | null>(null);

  // Forgot / reset password fields
  const [forgotEmail, setForgotEmail] = useState('');
  const [resetOtp, setResetOtp] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [resetDevOtp, setResetDevOtp] = useState<string | null>(null);

  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [infoMsg, setInfoMsg] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [serverModalVisible, setServerModalVisible] = useState(false);

  const currentServer = getTargetHostUrl();
  const isTunnel = currentServer.includes('trycloudflare.com');

  const resetTransientMessages = () => {
    setErrorMsg(null);
    setInfoMsg(null);
  };

  const goTo = (next: ViewState) => {
    resetTransientMessages();
    setView(next);
  };

  const handleLogin = async () => {
    resetTransientMessages();
    if (!email.trim() || !password.trim()) {
      setErrorMsg('Please enter both email and password');
      return;
    }

    setLoading(true);
    try {
      await authStore.login(email.trim(), password.trim());
      onLoginSuccess();
    } catch (err: any) {
      setErrorMsg(getErrorMessage(err, 'Authentication failed'));
    } finally {
      setLoading(false);
    }
  };

  const handleSendRegisterOtp = async () => {
    resetTransientMessages();
    if (
      !organizationName.trim() ||
      !firstName.trim() ||
      !lastName.trim() ||
      !username.trim() ||
      !email.trim() ||
      !password.trim()
    ) {
      setErrorMsg('Please fill in all fields to continue');
      return;
    }

    setLoading(true);
    try {
      const res = await authStore.sendOtp(email.trim(), 'REGISTER');
      setInfoMsg(res.message || 'A 6-digit verification code has been sent to your email');
      setRegisterDevOtp(res.dev_otp || null);
      setRegisterOtp('');
      setView('register-otp');
    } catch (err: any) {
      setErrorMsg(getErrorMessage(err, 'Failed to send verification code'));
    } finally {
      setLoading(false);
    }
  };

  const handleResendRegisterOtp = async () => {
    resetTransientMessages();
    setLoading(true);
    try {
      const res = await authStore.sendOtp(email.trim(), 'REGISTER');
      setInfoMsg('A new verification code has been sent to your email');
      setRegisterDevOtp(res.dev_otp || null);
    } catch (err: any) {
      setErrorMsg(getErrorMessage(err, 'Failed to resend verification code'));
    } finally {
      setLoading(false);
    }
  };

  const handleCompleteRegister = async () => {
    resetTransientMessages();
    if (!registerOtp.trim()) {
      setErrorMsg('Please enter the 6-digit verification code');
      return;
    }

    setLoading(true);
    try {
      await authStore.register({
        email: email.trim(),
        password: password.trim(),
        username: username.trim(),
        first_name: firstName.trim(),
        last_name: lastName.trim(),
        organization_name: organizationName.trim(),
        otp_code: registerOtp.trim(),
      });
      onLoginSuccess();
    } catch (err: any) {
      setErrorMsg(getErrorMessage(err, 'Registration failed'));
    } finally {
      setLoading(false);
    }
  };

  const handleSendForgotOtp = async () => {
    resetTransientMessages();
    if (!forgotEmail.trim()) {
      setErrorMsg('Please enter your registered email address');
      return;
    }

    setLoading(true);
    try {
      const res = await authStore.forgotPassword(forgotEmail.trim());
      setInfoMsg(res.message || 'A password reset code has been sent to your email');
      setResetDevOtp(res.dev_otp || null);
      setResetOtp('');
      setNewPassword('');
      setConfirmPassword('');
      setView('forgot-reset');
    } catch (err: any) {
      setErrorMsg(getErrorMessage(err, 'Failed to send reset code'));
    } finally {
      setLoading(false);
    }
  };

  const handleResendForgotOtp = async () => {
    resetTransientMessages();
    setLoading(true);
    try {
      const res = await authStore.forgotPassword(forgotEmail.trim());
      setInfoMsg('A new reset code has been sent to your email');
      setResetDevOtp(res.dev_otp || null);
    } catch (err: any) {
      setErrorMsg(getErrorMessage(err, 'Failed to resend reset code'));
    } finally {
      setLoading(false);
    }
  };

  const handleResetPassword = async () => {
    resetTransientMessages();
    if (!resetOtp.trim() || !newPassword.trim()) {
      setErrorMsg('Please enter the verification code and a new password');
      return;
    }
    if (newPassword !== confirmPassword) {
      setErrorMsg('Passwords do not match');
      return;
    }

    setLoading(true);
    try {
      const res = await authStore.resetPassword(forgotEmail.trim(), resetOtp.trim(), newPassword.trim());
      setEmail(forgotEmail.trim());
      setPassword('');
      setView('login');
      setInfoMsg(res.message || 'Password reset successfully. Please sign in with your new password.');
    } catch (err: any) {
      setErrorMsg(getErrorMessage(err, 'Failed to reset password'));
    } finally {
      setLoading(false);
    }
  };

  const cardTitle = (): string => {
    switch (view) {
      case 'register':
        return 'Create New Account';
      case 'register-otp':
        return 'Verify Your Email';
      case 'forgot-email':
        return 'Reset Password';
      case 'forgot-reset':
        return 'Enter Verification Code';
      default:
        return 'Sign in to Workspace';
    }
  };

  const renderLogin = () => (
    <>
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

      <TouchableOpacity style={styles.submitBtn} onPress={handleLogin} disabled={loading} activeOpacity={0.8}>
        {loading ? <ActivityIndicator color="#FFFFFF" size="small" /> : <Text style={styles.submitBtnText}>Sign In</Text>}
      </TouchableOpacity>

      <TouchableOpacity style={styles.linkBtn} onPress={() => goTo('forgot-email')}>
        <Text style={styles.linkText}>Forgot password?</Text>
      </TouchableOpacity>

      <TouchableOpacity style={styles.switchModeBtn} onPress={() => goTo('register')}>
        <Text style={styles.switchModeText}>Don't have an account? Create one</Text>
      </TouchableOpacity>
    </>
  );

  const renderRegister = () => (
    <>
      <View style={styles.inputGroup}>
        <Text style={styles.label}>Organization Name</Text>
        <TextInput
          style={styles.input}
          placeholder="e.g. Acme Software Solutions"
          placeholderTextColor={Colors.textMuted}
          value={organizationName}
          onChangeText={setOrganizationName}
        />
      </View>

      <View style={styles.row}>
        <View style={[styles.inputGroup, styles.rowItem]}>
          <Text style={styles.label}>First Name</Text>
          <TextInput
            style={styles.input}
            placeholder="Alex"
            placeholderTextColor={Colors.textMuted}
            value={firstName}
            onChangeText={setFirstName}
          />
        </View>
        <View style={[styles.inputGroup, styles.rowItem]}>
          <Text style={styles.label}>Last Name</Text>
          <TextInput
            style={styles.input}
            placeholder="Vance"
            placeholderTextColor={Colors.textMuted}
            value={lastName}
            onChangeText={setLastName}
          />
        </View>
      </View>

      <View style={styles.inputGroup}>
        <Text style={styles.label}>Username</Text>
        <TextInput
          style={styles.input}
          placeholder="e.g. alexv"
          placeholderTextColor={Colors.textMuted}
          value={username}
          onChangeText={(v) => setUsername(v.toLowerCase().replace(/\s+/g, ''))}
          autoCapitalize="none"
        />
      </View>

      <View style={styles.inputGroup}>
        <Text style={styles.label}>Work Email</Text>
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

      <TouchableOpacity style={styles.submitBtn} onPress={handleSendRegisterOtp} disabled={loading} activeOpacity={0.8}>
        {loading ? (
          <ActivityIndicator color="#FFFFFF" size="small" />
        ) : (
          <Text style={styles.submitBtnText}>Send Verification Code</Text>
        )}
      </TouchableOpacity>

      <TouchableOpacity style={styles.switchModeBtn} onPress={() => goTo('login')}>
        <Text style={styles.switchModeText}>Already have an account? Sign In</Text>
      </TouchableOpacity>
    </>
  );

  const renderRegisterOtp = () => (
    <>
      <Text style={styles.stepDescription}>Enter the 6-digit code sent to {email.trim()}</Text>

      {registerDevOtp ? (
        <View style={styles.devOtpBox}>
          <Text style={styles.devOtpLabel}>Local Dev OTP:</Text>
          <Text style={styles.devOtpValue}>{registerDevOtp}</Text>
        </View>
      ) : null}

      <View style={styles.inputGroup}>
        <Text style={styles.label}>Verification Code</Text>
        <TextInput
          style={[styles.input, styles.otpInput]}
          placeholder="123456"
          placeholderTextColor={Colors.textMuted}
          value={registerOtp}
          onChangeText={(v) => setRegisterOtp(v.replace(/\D/g, '').slice(0, 6))}
          keyboardType="number-pad"
          maxLength={6}
        />
      </View>

      <TouchableOpacity style={styles.submitBtn} onPress={handleCompleteRegister} disabled={loading} activeOpacity={0.8}>
        {loading ? (
          <ActivityIndicator color="#FFFFFF" size="small" />
        ) : (
          <Text style={styles.submitBtnText}>Verify & Create Account</Text>
        )}
      </TouchableOpacity>

      <View style={styles.linkRow}>
        <TouchableOpacity onPress={() => goTo('register')}>
          <Text style={styles.linkText}>← Edit Information</Text>
        </TouchableOpacity>
        <TouchableOpacity onPress={handleResendRegisterOtp} disabled={loading}>
          <Text style={styles.linkTextAccent}>Resend Code</Text>
        </TouchableOpacity>
      </View>
    </>
  );

  const renderForgotEmail = () => (
    <>
      <Text style={styles.stepDescription}>Enter your work email to receive a 6-digit recovery code</Text>

      <View style={styles.inputGroup}>
        <Text style={styles.label}>Email Address</Text>
        <TextInput
          style={styles.input}
          placeholder="name@company.com"
          placeholderTextColor={Colors.textMuted}
          value={forgotEmail}
          onChangeText={setForgotEmail}
          autoCapitalize="none"
          keyboardType="email-address"
        />
      </View>

      <TouchableOpacity style={styles.submitBtn} onPress={handleSendForgotOtp} disabled={loading} activeOpacity={0.8}>
        {loading ? (
          <ActivityIndicator color="#FFFFFF" size="small" />
        ) : (
          <Text style={styles.submitBtnText}>Send Reset Code</Text>
        )}
      </TouchableOpacity>

      <TouchableOpacity style={styles.switchModeBtn} onPress={() => goTo('login')}>
        <Text style={styles.switchModeText}>← Back to Sign In</Text>
      </TouchableOpacity>
    </>
  );

  const renderForgotReset = () => (
    <>
      <Text style={styles.stepDescription}>Enter the 6-digit code sent to {forgotEmail.trim()}</Text>

      {resetDevOtp ? (
        <View style={styles.devOtpBox}>
          <Text style={styles.devOtpLabel}>Local Dev OTP:</Text>
          <Text style={styles.devOtpValue}>{resetDevOtp}</Text>
        </View>
      ) : null}

      <View style={styles.inputGroup}>
        <Text style={styles.label}>Verification Code</Text>
        <TextInput
          style={[styles.input, styles.otpInput]}
          placeholder="123456"
          placeholderTextColor={Colors.textMuted}
          value={resetOtp}
          onChangeText={(v) => setResetOtp(v.replace(/\D/g, '').slice(0, 6))}
          keyboardType="number-pad"
          maxLength={6}
        />
      </View>

      <View style={styles.inputGroup}>
        <Text style={styles.label}>New Password</Text>
        <TextInput
          style={styles.input}
          placeholder="••••••••"
          placeholderTextColor={Colors.textMuted}
          value={newPassword}
          onChangeText={setNewPassword}
          secureTextEntry
        />
      </View>

      <View style={styles.inputGroup}>
        <Text style={styles.label}>Confirm New Password</Text>
        <TextInput
          style={styles.input}
          placeholder="••••••••"
          placeholderTextColor={Colors.textMuted}
          value={confirmPassword}
          onChangeText={setConfirmPassword}
          secureTextEntry
        />
      </View>

      <TouchableOpacity style={styles.submitBtn} onPress={handleResetPassword} disabled={loading} activeOpacity={0.8}>
        {loading ? (
          <ActivityIndicator color="#FFFFFF" size="small" />
        ) : (
          <Text style={styles.submitBtnText}>Reset Password</Text>
        )}
      </TouchableOpacity>

      <View style={styles.linkRow}>
        <TouchableOpacity onPress={() => goTo('forgot-email')}>
          <Text style={styles.linkText}>← Change Email</Text>
        </TouchableOpacity>
        <TouchableOpacity onPress={handleResendForgotOtp} disabled={loading}>
          <Text style={styles.linkTextAccent}>Resend Code</Text>
        </TouchableOpacity>
      </View>
    </>
  );

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
          <Text style={styles.cardTitle}>{cardTitle()}</Text>

          {errorMsg ? (
            <View style={styles.errorBox}>
              <Text style={styles.errorText}>{errorMsg}</Text>
            </View>
          ) : null}

          {infoMsg ? (
            <View style={styles.infoBox}>
              <Text style={styles.infoText}>{infoMsg}</Text>
            </View>
          ) : null}

          {view === 'login' && renderLogin()}
          {view === 'register' && renderRegister()}
          {view === 'register-otp' && renderRegisterOtp()}
          {view === 'forgot-email' && renderForgotEmail()}
          {view === 'forgot-reset' && renderForgotReset()}
        </View>

        {/* Quick Demo Credentials Footer */}
        {view === 'login' ? (
          <View style={styles.demoFooter}>
            <Text style={styles.demoTitle}>Demo Credentials Available:</Text>
            <Text style={styles.demoCreds}>admin@example.com / password123</Text>
          </View>
        ) : null}
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
  stepDescription: {
    color: Colors.textSecondary,
    fontSize: 12.5,
    textAlign: 'center',
    marginBottom: 16,
    lineHeight: 18,
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
  infoBox: {
    backgroundColor: 'rgba(16, 185, 129, 0.12)',
    borderWidth: 1,
    borderColor: 'rgba(16, 185, 129, 0.3)',
    borderRadius: 12,
    padding: 12,
    marginBottom: 16,
  },
  infoText: {
    color: Colors.emerald,
    fontSize: 12.5,
    fontWeight: '600',
  },
  devOtpBox: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: Colors.primaryGlow,
    borderWidth: 1,
    borderColor: 'rgba(99, 102, 241, 0.35)',
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 10,
    marginBottom: 16,
  },
  devOtpLabel: {
    color: Colors.textSecondary,
    fontSize: 12,
    fontWeight: '600',
  },
  devOtpValue: {
    color: Colors.textPrimary,
    fontSize: 15,
    fontWeight: '800',
    letterSpacing: 3,
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
  },
  row: {
    flexDirection: 'row',
    gap: 12,
  },
  rowItem: {
    flex: 1,
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
  otpInput: {
    fontSize: 18,
    fontWeight: '700',
    letterSpacing: 6,
    textAlign: 'center',
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
  linkBtn: {
    marginTop: 14,
    alignItems: 'center',
  },
  linkText: {
    color: Colors.textSecondary,
    fontSize: 12.5,
    fontWeight: '600',
  },
  linkTextAccent: {
    color: Colors.primary,
    fontSize: 12.5,
    fontWeight: '700',
  },
  linkRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 18,
    paddingTop: 14,
    borderTopWidth: 1,
    borderTopColor: Colors.surfaceBorder,
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
