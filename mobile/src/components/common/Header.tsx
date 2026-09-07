import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { Colors } from '../../theme/colors';
import { getTargetHostUrl, DEFAULT_SERVER, CLOUDFLARE_TUNNEL_URL } from '../../api/client';

interface HeaderProps {
  title: string;
  subtitle?: string;
  onOpenServerConfig?: () => void;
  rightAction?: React.ReactNode;
}

export const Header: React.FC<HeaderProps> = ({
  title,
  subtitle,
  onOpenServerConfig,
  rightAction,
}) => {
  const currentServer = getTargetHostUrl();
  const isTunnel = currentServer.includes('trycloudflare.com');
  const serverLabel = isTunnel ? 'Cloudflare Tunnel' : 'LAN: 192.168.1.147';

  return (
    <View style={styles.container}>
      <View style={styles.titleRow}>
        <View style={styles.branding}>
          <View style={styles.brandLogo}>
            <Text style={styles.brandLogoText}>M</Text>
          </View>
          <View>
            <Text style={styles.title}>{title}</Text>
            {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}
          </View>
        </View>

        <View style={styles.actionsRow}>
          {rightAction}
          {onOpenServerConfig ? (
            <TouchableOpacity
              style={[
                styles.serverPill,
                isTunnel ? styles.serverPillTunnel : styles.serverPillLan,
              ]}
              onPress={onOpenServerConfig}
              activeOpacity={0.7}
            >
              <View
                style={[
                  styles.statusDot,
                  { backgroundColor: isTunnel ? Colors.cyan : Colors.emerald },
                ]}
              />
              <Text style={styles.serverPillText}>{serverLabel}</Text>
            </TouchableOpacity>
          ) : null}
        </View>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 12,
    backgroundColor: Colors.background,
    borderBottomWidth: 1,
    borderBottomColor: Colors.surfaceBorder,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  branding: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  brandLogo: {
    width: 38,
    height: 38,
    borderRadius: 12,
    backgroundColor: Colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: Colors.primary,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.4,
    shadowRadius: 6,
    elevation: 4,
  },
  brandLogoText: {
    color: '#FFFFFF',
    fontSize: 18,
    fontWeight: '800',
  },
  title: {
    color: Colors.textPrimary,
    fontSize: 17,
    fontWeight: '700',
    letterSpacing: -0.2,
  },
  subtitle: {
    color: Colors.textSecondary,
    fontSize: 11,
    marginTop: 1,
  },
  actionsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  serverPill: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 999,
    borderWidth: 1,
    gap: 6,
  },
  serverPillLan: {
    backgroundColor: 'rgba(16, 185, 129, 0.12)',
    borderColor: 'rgba(16, 185, 129, 0.3)',
  },
  serverPillTunnel: {
    backgroundColor: 'rgba(6, 182, 212, 0.12)',
    borderColor: 'rgba(6, 182, 212, 0.3)',
  },
  statusDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  serverPillText: {
    color: Colors.textPrimary,
    fontSize: 10.5,
    fontWeight: '600',
  },
});
