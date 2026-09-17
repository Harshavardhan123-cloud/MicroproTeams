import type { LinkingOptions } from '@react-navigation/native';
import type { RootStackParamList } from './types';

/**
 * Deep-link prefixes matching the intent-filters declared in
 * AndroidManifest.xml / Info.plist. The tunnel host here is a placeholder —
 * Phase 6 replaces it with the app's configurable server-host value instead
 * of a hardcoded domain.
 */
export const linking: LinkingOptions<RootStackParamList> = {
  prefixes: ['micropro://', 'https://violin-providers-entries-content.trycloudflare.com'],
  config: {
    screens: {
      MainTabs: {
        screens: {
          Meetings: 'meet/:code',
        },
      },
      Thread: 'thread/:channelId/:messageId',
    },
  },
};
