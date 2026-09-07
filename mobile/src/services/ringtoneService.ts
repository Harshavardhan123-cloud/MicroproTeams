import { Vibration } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';

export interface RingtoneOption {
  id: string;
  name: string;
  description: string;
  pattern: number[]; // Vibration rhythm in ms [delay, vibrate, pause, vibrate, ...]
}

export const RINGTONE_OPTIONS: RingtoneOption[] = [
  {
    id: 'cyber_pulse',
    name: 'Cyber Pulse',
    description: 'Energetic electronic pulses with crisp rhythm',
    pattern: [0, 200, 100, 200, 100, 400, 800],
  },
  {
    id: 'obsidian_chime',
    name: 'Obsidian Chime (Default)',
    description: 'Subtle, elegant melodic pattern tailored for Obsidian',
    pattern: [0, 400, 200, 400, 1000],
  },
  {
    id: 'velvet_echo',
    name: 'Velvet Echo',
    description: 'Smooth and gentle double vibration cascade',
    pattern: [0, 250, 150, 250, 1200],
  },
  {
    id: 'hyper_drive',
    name: 'Hyper Drive',
    description: 'Rapid high-tempo alerts for urgent incoming calls',
    pattern: [0, 150, 80, 150, 80, 150, 600],
  },
  {
    id: 'lofi_sunset',
    name: 'Lofi Sunset',
    description: 'Calm, relaxed long-interval tone pattern',
    pattern: [0, 600, 300, 600, 1500],
  },
  {
    id: 'deep_cosmos',
    name: 'Deep Cosmos',
    description: 'Deep resonant ambient interval pulses',
    pattern: [0, 500, 250, 300, 250, 1000],
  },
];

class RingtoneService {
  private isRinging: boolean = false;
  private currentRingtoneId: string = 'obsidian_chime';
  private ringInterval: any = null;

  async init() {
    try {
      const saved = await AsyncStorage.getItem('mc_mobile_ringtone');
      if (saved) {
        this.currentRingtoneId = saved;
      }
    } catch (e) {
      console.warn('Failed to load ringtone preference:', e);
    }
  }

  getCurrentRingtoneId(): string {
    return this.currentRingtoneId;
  }

  async setRingtone(id: string) {
    this.currentRingtoneId = id;
    await AsyncStorage.setItem('mc_mobile_ringtone', id);
  }

  play() {
    if (this.isRinging) return;
    this.isRinging = true;

    const ringtone = RINGTONE_OPTIONS.find((r) => r.id === this.currentRingtoneId) || RINGTONE_OPTIONS[0];

    // Trigger vibration pattern repeating
    try {
      Vibration.vibrate(ringtone.pattern, true);
    } catch (e) {
      console.warn('Vibration failed:', e);
    }
  }

  preview(id: string) {
    this.stop();
    const ringtone = RINGTONE_OPTIONS.find((r) => r.id === id) || RINGTONE_OPTIONS[0];
    try {
      // Play pattern once for preview
      Vibration.vibrate(ringtone.pattern, false);
    } catch (e) {
      console.warn('Preview vibration error:', e);
    }
  }

  stop() {
    this.isRinging = false;
    if (this.ringInterval) {
      clearInterval(this.ringInterval);
      this.ringInterval = null;
    }
    try {
      Vibration.cancel();
    } catch (e) {
      console.warn('Failed to cancel vibration:', e);
    }
  }
}

export const ringtoneService = new RingtoneService();
