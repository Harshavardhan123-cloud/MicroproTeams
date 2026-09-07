import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Modal,
  TouchableOpacity,
  TextInput,
  ActivityIndicator,
} from 'react-native';
import axios from 'axios';
import { Colors } from '../../theme/colors';
import {
  getTargetHostUrl,
  setTargetHostUrl,
  DEFAULT_SERVER,
  CLOUDFLARE_TUNNEL_URL,
} from '../../api/client';

interface ServerConfigModalProps {
  visible: boolean;
  onClose: () => void;
  onServerChanged?: () => void;
}

export const ServerConfigModal: React.FC<ServerConfigModalProps> = ({
  visible,
  onClose,
  onServerChanged,
}) => {
  const [serverUrl, setServerUrl] = useState(getTargetHostUrl());
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<{
    success: boolean;
    message: string;
  } | null>(null);

  const handleTest = async (urlToTest: string) => {
    setTesting(true);
    setTestResult(null);
    const cleanUrl = urlToTest.trim().replace(/\/$/, '');

    try {
      const startTime = Date.now();
      const res = await axios.get(`${cleanUrl}/api/v1/health`, {
        timeout: 5000,
        headers: {
          'Bypass-Tunnel-Reminder': 'true',
          'ngrok-skip-browser-warning': 'true',
        },
      });
      const latency = Date.now() - startTime;
      if (res.status >= 200 && res.status < 300) {
        setTestResult({
          success: true,
          message: `Connected successfully! (${latency}ms latency)`,
        });
      } else {
        setTestResult({
          success: false,
          message: `Server returned status ${res.status}`,
        });
      }
    } catch (err: any) {
      setTestResult({
        success: false,
        message: err.message || 'Connection failed. Check IP & port.',
      });
    } finally {
      setTesting(false);
    }
  };

  const handleSave = async (url: string) => {
    const cleanUrl = url.trim().replace(/\/$/, '');
    await setTargetHostUrl(cleanUrl);
    setServerUrl(cleanUrl);
    if (onServerChanged) onServerChanged();
    onClose();
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <View style={styles.card}>
          <View style={styles.header}>
            <Text style={styles.title}>Backend Server Gateway</Text>
            <TouchableOpacity style={styles.closeBtn} onPress={onClose}>
              <Text style={styles.closeText}>✕</Text>
            </TouchableOpacity>
          </View>

          <Text style={styles.description}>
            Connect your mobile device to the Micropro Commute backend server:
          </Text>

          {/* Preset Buttons */}
          <View style={styles.presetsContainer}>
            <TouchableOpacity
              style={[
                styles.presetBtn,
                serverUrl === DEFAULT_SERVER && styles.presetBtnActive,
              ]}
              onPress={() => {
                setServerUrl(DEFAULT_SERVER);
                handleTest(DEFAULT_SERVER);
              }}
              activeOpacity={0.7}
            >
              <Text style={styles.presetTitle}>LAN Backend</Text>
              <Text style={styles.presetSubtitle}>192.168.1.147:8000</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[
                styles.presetBtn,
                serverUrl === CLOUDFLARE_TUNNEL_URL && styles.presetBtnActive,
              ]}
              onPress={() => {
                setServerUrl(CLOUDFLARE_TUNNEL_URL);
                handleTest(CLOUDFLARE_TUNNEL_URL);
              }}
              activeOpacity={0.7}
            >
              <Text style={styles.presetTitle}>Cloudflare Tunnel</Text>
              <Text style={styles.presetSubtitle}>Internet HTTPS & WebRTC</Text>
            </TouchableOpacity>
          </View>

          {/* Custom URL Input */}
          <Text style={styles.inputLabel}>Custom Host URL</Text>
          <View style={styles.inputRow}>
            <TextInput
              style={styles.input}
              value={serverUrl}
              onChangeText={setServerUrl}
              placeholder="http://192.168.1.147:8000"
              placeholderTextColor={Colors.textMuted}
              autoCapitalize="none"
              autoCorrect={false}
            />
          </View>

          {/* Test Status */}
          {testing ? (
            <View style={styles.testStatusRow}>
              <ActivityIndicator size="small" color={Colors.primary} />
              <Text style={styles.testStatusText}>Testing connection...</Text>
            </View>
          ) : testResult ? (
            <View
              style={[
                styles.resultCard,
                testResult.success ? styles.resultSuccess : styles.resultError,
              ]}
            >
              <Text
                style={[
                  styles.resultText,
                  { color: testResult.success ? Colors.emerald : Colors.rose },
                ]}
              >
                {testResult.success ? '● ' : '▲ '}
                {testResult.message}
              </Text>
            </View>
          ) : null}

          {/* Actions */}
          <View style={styles.actionRow}>
            <TouchableOpacity
              style={styles.testButton}
              onPress={() => handleTest(serverUrl)}
              disabled={testing}
              activeOpacity={0.7}
            >
              <Text style={styles.testButtonText}>Ping Server</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.saveButton}
              onPress={() => handleSave(serverUrl)}
              activeOpacity={0.8}
            >
              <Text style={styles.saveButtonText}>Save & Apply</Text>
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
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
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
  description: {
    color: Colors.textSecondary,
    fontSize: 13,
    marginBottom: 16,
    lineHeight: 18,
  },
  presetsContainer: {
    flexDirection: 'row',
    gap: 10,
    marginBottom: 16,
  },
  presetBtn: {
    flex: 1,
    backgroundColor: Colors.surfaceLight,
    padding: 12,
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: Colors.surfaceBorderLight,
  },
  presetBtnActive: {
    borderColor: Colors.primary,
    backgroundColor: 'rgba(99, 102, 241, 0.12)',
  },
  presetTitle: {
    color: Colors.textPrimary,
    fontSize: 13,
    fontWeight: '700',
    marginBottom: 2,
  },
  presetSubtitle: {
    color: Colors.textMuted,
    fontSize: 10.5,
  },
  inputLabel: {
    color: Colors.textSecondary,
    fontSize: 12,
    fontWeight: '600',
    marginBottom: 6,
  },
  inputRow: {
    marginBottom: 16,
  },
  input: {
    backgroundColor: Colors.surfaceLight,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Colors.surfaceBorder,
    paddingHorizontal: 14,
    paddingVertical: 12,
    color: Colors.textPrimary,
    fontSize: 14,
  },
  testStatusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 12,
  },
  testStatusText: {
    color: Colors.textSecondary,
    fontSize: 12,
  },
  resultCard: {
    padding: 10,
    borderRadius: 10,
    borderWidth: 1,
    marginBottom: 16,
  },
  resultSuccess: {
    backgroundColor: 'rgba(16, 185, 129, 0.1)',
    borderColor: 'rgba(16, 185, 129, 0.3)',
  },
  resultError: {
    backgroundColor: 'rgba(239, 68, 68, 0.1)',
    borderColor: 'rgba(239, 68, 68, 0.3)',
  },
  resultText: {
    fontSize: 12,
    fontWeight: '600',
  },
  actionRow: {
    flexDirection: 'row',
    gap: 12,
  },
  testButton: {
    flex: 1,
    backgroundColor: Colors.surfaceLight,
    borderWidth: 1,
    borderColor: Colors.surfaceBorder,
    paddingVertical: 12,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  testButtonText: {
    color: Colors.textPrimary,
    fontSize: 13.5,
    fontWeight: '600',
  },
  saveButton: {
    flex: 1,
    backgroundColor: Colors.primary,
    paddingVertical: 12,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  saveButtonText: {
    color: '#FFFFFF',
    fontSize: 13.5,
    fontWeight: '700',
  },
});
