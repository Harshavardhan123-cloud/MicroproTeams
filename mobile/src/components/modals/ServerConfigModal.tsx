import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Modal,
  ScrollView,
  TouchableOpacity,
  TextInput,
  ActivityIndicator,
} from 'react-native';
import axios from 'axios';
import { Colors } from '../../theme/colors';
import {
  getTargetHostUrl,
  setTargetHostUrl,
  getSfuHostUrl,
  setSfuHostUrl,
  getDerivedSfuUrl,
  DEFAULT_SERVER,
  LAN_SERVER,
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

  // Explicit SFU override. '' is valid and means "derive from the host above".
  const [sfuUrl, setSfuUrl] = useState(getSfuHostUrl());
  const [sfuTesting, setSfuTesting] = useState(false);
  const [sfuTestResult, setSfuTestResult] = useState<{
    success: boolean;
    message: string;
  } | null>(null);

  // Preview the derivation against what is currently typed, not only what is
  // saved, so editing the host above updates the SFU placeholder live.
  const derivedSfuUrl = getDerivedSfuUrl(serverUrl);
  const proxySfuUrl = `${serverUrl.trim().replace(/\/$/, '')}/sfu`;
  const trimmedSfuUrl = sfuUrl.trim().replace(/\/$/, '');
  const directPresetActive = trimmedSfuUrl === derivedSfuUrl;
  const proxyPresetActive = /\/sfu$/.test(trimmedSfuUrl);

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

  // The SFU exposes no HTTP routes at all (no /health), so this probes the
  // socket.io handshake endpoint instead. It must stay a plain GET: never emit
  // a socket.io *event* as a probe — the SFU invokes ack callbacks unguarded,
  // so an emit without an ack takes the whole media server down.
  const handleSfuTest = async (urlToTest: string) => {
    const clean = (urlToTest || '').trim().replace(/\/$/, '') || derivedSfuUrl;
    setSfuTesting(true);
    setSfuTestResult(null);

    // A host ending in /sfu is the nginx-proxied form and keeps that prefix;
    // anything else talks to the SFU's own origin at the default path.
    const probe = `${clean.replace(/\/sfu\/?$/, '')}${
      /\/sfu\/?$/.test(clean) ? '/sfu' : ''
    }/socket.io/?EIO=4&transport=polling`;

    try {
      const startTime = Date.now();
      const res = await axios.get(probe, {
        timeout: 5000,
        headers: {
          'Bypass-Tunnel-Reminder': 'true',
          'ngrok-skip-browser-warning': 'true',
        },
      });
      const latency = Date.now() - startTime;
      // A socket.io handshake replies 200 with a body starting `0{"sid":`.
      const body =
        typeof res.data === 'string' ? res.data : JSON.stringify(res.data ?? '');
      if (res.status >= 200 && res.status < 300 && body.includes('"sid"')) {
        setSfuTestResult({
          success: true,
          message: `Media server reachable! (${latency}ms latency)`,
        });
      } else if (res.status >= 200 && res.status < 300) {
        setSfuTestResult({
          success: false,
          message: 'Host replied, but no socket.io server answered at that path.',
        });
      } else {
        setSfuTestResult({
          success: false,
          message: `Media server returned status ${res.status}`,
        });
      }
    } catch (err: any) {
      setSfuTestResult({
        success: false,
        message: err.message || 'Media server unreachable. Check host & port 3010.',
      });
    } finally {
      setSfuTesting(false);
    }
  };

  const handleSave = async (url: string, sfu: string) => {
    const cleanUrl = url.trim().replace(/\/$/, '');
    const cleanSfu = (sfu || '').trim().replace(/\/$/, '');
    await setTargetHostUrl(cleanUrl);
    await setSfuHostUrl(cleanSfu);
    setServerUrl(cleanUrl);
    setSfuUrl(cleanSfu);
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

          <ScrollView
            style={styles.scrollArea}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
          >
          <Text style={styles.description}>
            Connect your mobile device to the Micropro Commute backend server:
          </Text>

          {/* Preset Buttons */}
          <View style={styles.presetsContainer}>
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

            <TouchableOpacity
              style={[
                styles.presetBtn,
                serverUrl === LAN_SERVER && styles.presetBtnActive,
              ]}
              onPress={() => {
                setServerUrl(LAN_SERVER);
                handleTest(LAN_SERVER);
              }}
              activeOpacity={0.7}
            >
              <Text style={styles.presetTitle}>LAN Backend</Text>
              <Text style={styles.presetSubtitle}>192.168.1.147:8000</Text>
            </TouchableOpacity>
          </View>

          {/* Custom URL Input */}
          <Text style={styles.inputLabel}>Custom Host URL</Text>
          <View style={styles.inputRow}>
            <TextInput
              style={styles.input}
              value={serverUrl}
              onChangeText={setServerUrl}
              placeholder="https://violin-providers-entries-content.trycloudflare.com"
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

          {/* ── Media Server (SFU) ─────────────────────────────────────── */}
          <View style={styles.divider} />

          <Text style={styles.inputLabel}>Media Server (SFU)</Text>

          <View style={styles.presetsContainer}>
            <TouchableOpacity
              style={[
                styles.presetBtn,
                directPresetActive && styles.presetBtnActive,
              ]}
              onPress={() => {
                setSfuUrl(derivedSfuUrl);
                setSfuTestResult(null);
              }}
              activeOpacity={0.7}
            >
              <Text style={styles.presetTitle}>Direct :3010</Text>
              <Text style={styles.presetSubtitle} numberOfLines={1}>
                {derivedSfuUrl}
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[
                styles.presetBtn,
                proxyPresetActive && styles.presetBtnActive,
              ]}
              onPress={() => {
                setSfuUrl(proxySfuUrl);
                setSfuTestResult(null);
              }}
              activeOpacity={0.7}
            >
              <Text style={styles.presetTitle}>Via Proxy (/sfu)</Text>
              <Text style={styles.presetSubtitle} numberOfLines={1}>
                Backend origin + /sfu
              </Text>
            </TouchableOpacity>
          </View>

          <View style={styles.inputRow}>
            <TextInput
              style={styles.input}
              value={sfuUrl}
              onChangeText={setSfuUrl}
              placeholder={derivedSfuUrl}
              placeholderTextColor={Colors.textMuted}
              autoCapitalize="none"
              autoCorrect={false}
            />
            <Text style={styles.helperText}>
              Leave blank to use {derivedSfuUrl}
            </Text>
          </View>

          <View style={styles.sfuActionRow}>
            <TouchableOpacity
              style={styles.testButton}
              onPress={() => handleSfuTest(sfuUrl)}
              disabled={sfuTesting}
              activeOpacity={0.7}
            >
              <Text style={styles.testButtonText}>Ping Media Server</Text>
            </TouchableOpacity>
          </View>

          {/* SFU Test Status */}
          {sfuTesting ? (
            <View style={styles.testStatusRow}>
              <ActivityIndicator size="small" color={Colors.primary} />
              <Text style={styles.testStatusText}>Testing media server...</Text>
            </View>
          ) : sfuTestResult ? (
            <View
              style={[
                styles.resultCard,
                sfuTestResult.success ? styles.resultSuccess : styles.resultError,
              ]}
            >
              <Text
                style={[
                  styles.resultText,
                  { color: sfuTestResult.success ? Colors.emerald : Colors.rose },
                ]}
              >
                {sfuTestResult.success ? '● ' : '▲ '}
                {sfuTestResult.message}
              </Text>
            </View>
          ) : null}
          </ScrollView>

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
              onPress={() => handleSave(serverUrl, sfuUrl)}
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
    // Cap the height so the (now taller) content scrolls instead of running
    // off small screens; the action row below stays pinned.
    maxHeight: '90%',
  },
  scrollArea: {
    flexGrow: 0,
    flexShrink: 1,
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
  helperText: {
    color: Colors.textMuted,
    fontSize: 11,
    marginTop: 6,
  },
  divider: {
    height: 1,
    backgroundColor: Colors.surfaceBorder,
    marginBottom: 16,
  },
  inputRow: {
    marginBottom: 16,
  },
  sfuActionRow: {
    flexDirection: 'row',
    marginBottom: 12,
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
