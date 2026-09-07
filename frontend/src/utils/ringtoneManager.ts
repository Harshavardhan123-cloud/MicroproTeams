/**
 * RingtoneManager
 * 
 * Centralized, reusable audio manager for Micropro Commute incoming call ringtones.
 * Features 6 customizable synthesized Web Audio API melodies with instant, zero-latency playback,
 * live preview support, volume control, and single-instance guarantee.
 */

export interface RingtonePreset {
  id: string;
  name: string;
  description: string;
  category: 'Modern' | 'Classic' | 'Futuristic' | 'Minimal';
}

export const RINGTONE_PRESETS: RingtonePreset[] = [
  { id: 'cosmic', name: 'Cosmic Melody', description: 'Harmonic futuristic arpeggio chime', category: 'Futuristic' },
  { id: 'crystal', name: 'Crystal Chime', description: 'Crisp high-definition bell melody', category: 'Modern' },
  { id: 'cyber', name: 'Cyber Pulse', description: 'Energetic digital synth chords', category: 'Modern' },
  { id: 'bell', name: 'Classic Bell', description: 'Warm acoustic telephone cadence', category: 'Classic' },
  { id: 'zen', name: 'Zen Breeze', description: 'Soft ambient gentle chime', category: 'Minimal' },
  { id: 'pulse', name: 'Electric Rhythm', description: 'Dynamic rising polyphonic pulse', category: 'Modern' }
];

class RingtoneManager {
  private audioCtx: AudioContext | null = null;
  private isPlaying = false;
  private ringTimer: any = null;
  private previewTimer: any = null;
  private currentPresetId: string = 'cosmic';

  constructor() {
    if (typeof window !== 'undefined') {
      this.currentPresetId = localStorage.getItem('mc_ringtone') || 'cosmic';
    }
  }

  private initAudioContext(): AudioContext | null {
    if (!this.audioCtx || this.audioCtx.state === 'closed') {
      const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
      if (AudioContextClass) {
        this.audioCtx = new AudioContextClass();
      }
    }
    if (this.audioCtx && this.audioCtx.state === 'suspended') {
      this.audioCtx.resume().catch(() => {});
    }
    return this.audioCtx;
  }

  getVolume(): number {
    if (typeof window === 'undefined') return 0.7;
    const vol = localStorage.getItem('mc_ringtone_vol');
    return vol ? parseFloat(vol) : 0.7;
  }

  setVolume(vol: number) {
    if (typeof window !== 'undefined') {
      localStorage.setItem('mc_ringtone_vol', String(Math.max(0.05, Math.min(1, vol))));
    }
  }

  getSelectedRingtone(): string {
    if (typeof window === 'undefined') return 'cosmic';
    return localStorage.getItem('mc_ringtone') || 'cosmic';
  }

  setSelectedRingtone(presetId: string) {
    this.currentPresetId = presetId;
    if (typeof window !== 'undefined') {
      localStorage.setItem('mc_ringtone', presetId);
    }
  }

  private playToneBurst(presetId: string, ctx: AudioContext, gainLevel: number) {
    const now = ctx.currentTime;

    switch (presetId) {
      case 'crystal': {
        // Crisp high-definition bell (C6 -> E6 -> G6 -> C7)
        const notes = [1046.50, 1318.51, 1567.98, 2093.00];
        notes.forEach((freq, idx) => {
          const osc = ctx.createOscillator();
          const gain = ctx.createGain();
          osc.type = 'sine';
          osc.frequency.setValueAtTime(freq, now + idx * 0.12);

          gain.gain.setValueAtTime(0, now + idx * 0.12);
          gain.gain.linearRampToValueAtTime(gainLevel * 0.35, now + idx * 0.12 + 0.02);
          gain.gain.exponentialRampToValueAtTime(0.001, now + idx * 0.12 + 0.45);

          osc.connect(gain);
          gain.connect(ctx.destination);
          osc.start(now + idx * 0.12);
          osc.stop(now + idx * 0.12 + 0.5);
        });
        break;
      }

      case 'cyber': {
        // Digital synth chords (sawtooth + triangle)
        const osc1 = ctx.createOscillator();
        const osc2 = ctx.createOscillator();
        const filter = ctx.createBiquadFilter();
        const gain = ctx.createGain();

        osc1.type = 'sawtooth';
        osc2.type = 'square';
        filter.type = 'lowpass';
        filter.frequency.setValueAtTime(1400, now);
        filter.frequency.exponentialRampToValueAtTime(400, now + 0.4);

        osc1.frequency.setValueAtTime(440, now);
        osc1.frequency.setValueAtTime(659.25, now + 0.14);
        osc2.frequency.setValueAtTime(330, now);
        osc2.frequency.setValueAtTime(493.88, now + 0.14);

        gain.gain.setValueAtTime(0, now);
        gain.gain.linearRampToValueAtTime(gainLevel * 0.25, now + 0.03);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.5);

        osc1.connect(filter);
        osc2.connect(filter);
        filter.connect(gain);
        gain.connect(ctx.destination);

        osc1.start(now);
        osc2.start(now);
        osc1.stop(now + 0.55);
        osc2.stop(now + 0.55);
        break;
      }

      case 'bell': {
        // Classic European phone cadence (440 Hz + 480 Hz cadence with warble)
        const osc1 = ctx.createOscillator();
        const osc2 = ctx.createOscillator();
        const gain = ctx.createGain();

        osc1.type = 'sine';
        osc2.type = 'sine';
        osc1.frequency.setValueAtTime(440, now);
        osc2.frequency.setValueAtTime(480, now);

        gain.gain.setValueAtTime(0, now);
        gain.gain.linearRampToValueAtTime(gainLevel * 0.3, now + 0.04);
        gain.gain.setValueAtTime(gainLevel * 0.3, now + 0.28);
        gain.gain.linearRampToValueAtTime(0, now + 0.32);
        gain.gain.linearRampToValueAtTime(gainLevel * 0.3, now + 0.38);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.85);

        osc1.connect(gain);
        osc2.connect(gain);
        gain.connect(ctx.destination);

        osc1.start(now);
        osc2.start(now);
        osc1.stop(now + 0.9);
        osc2.stop(now + 0.9);
        break;
      }

      case 'zen': {
        // Minimal ambient chime (Pentatonic soft sine)
        [523.25, 659.25, 783.99].forEach((freq, idx) => {
          const osc = ctx.createOscillator();
          const gain = ctx.createGain();
          osc.type = 'sine';
          osc.frequency.setValueAtTime(freq, now + idx * 0.18);

          gain.gain.setValueAtTime(0, now + idx * 0.18);
          gain.gain.linearRampToValueAtTime(gainLevel * 0.2, now + idx * 0.18 + 0.05);
          gain.gain.exponentialRampToValueAtTime(0.001, now + idx * 0.18 + 0.7);

          osc.connect(gain);
          gain.connect(ctx.destination);
          osc.start(now + idx * 0.18);
          osc.stop(now + idx * 0.18 + 0.75);
        });
        break;
      }

      case 'pulse': {
        // Energetic rising polyphonic pulse
        [392.00, 523.25, 659.25, 880.00].forEach((freq, idx) => {
          const osc = ctx.createOscillator();
          const gain = ctx.createGain();
          osc.type = idx % 2 === 0 ? 'sine' : 'triangle';
          osc.frequency.setValueAtTime(freq, now + idx * 0.1);

          gain.gain.setValueAtTime(0, now + idx * 0.1);
          gain.gain.linearRampToValueAtTime(gainLevel * 0.25, now + idx * 0.1 + 0.03);
          gain.gain.exponentialRampToValueAtTime(0.001, now + idx * 0.1 + 0.4);

          osc.connect(gain);
          gain.connect(ctx.destination);
          osc.start(now + idx * 0.1);
          osc.stop(now + idx * 0.1 + 0.45);
        });
        break;
      }

      case 'cosmic':
      default: {
        // Harmonic futuristic chime: 523.25 Hz [C5] -> 659.25 Hz [E5] -> 783.99 Hz [G5]
        const osc1 = ctx.createOscillator();
        const osc2 = ctx.createOscillator();
        const gain = ctx.createGain();

        osc1.type = 'sine';
        osc2.type = 'triangle';

        osc1.frequency.setValueAtTime(523.25, now);
        osc1.frequency.exponentialRampToValueAtTime(659.25, now + 0.15);
        osc1.frequency.exponentialRampToValueAtTime(783.99, now + 0.3);

        osc2.frequency.setValueAtTime(261.63, now);
        osc2.frequency.exponentialRampToValueAtTime(329.63, now + 0.3);

        gain.gain.setValueAtTime(0, now);
        gain.gain.linearRampToValueAtTime(gainLevel * 0.28, now + 0.05);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.65);

        osc1.connect(gain);
        osc2.connect(gain);
        gain.connect(ctx.destination);

        osc1.start(now);
        osc2.start(now);
        osc1.stop(now + 0.7);
        osc2.stop(now + 0.7);
        break;
      }
    }
  }

  /**
   * Start playing the ringtone for incoming calls.
   */
  play(callType: 'video' | 'audio' = 'video', explicitPreset?: string) {
    this.stop();

    this.isPlaying = true;
    const ctx = this.initAudioContext();
    if (!ctx) return;

    const preset = explicitPreset || this.getSelectedRingtone();
    const volume = this.getVolume();

    const burst = () => {
      if (!this.isPlaying || !this.audioCtx || this.audioCtx.state === 'closed') return;
      try {
        this.playToneBurst(preset, this.audioCtx, volume);
      } catch (err) {
        console.warn('[RingtoneManager] Ringtone burst error:', err);
      }
    };

    burst();
    this.ringTimer = setInterval(burst, 1800);
  }

  /**
   * Preview a selected ringtone preset in User Settings.
   */
  previewRingtone(presetId: string) {
    this.stop();
    const ctx = this.initAudioContext();
    if (!ctx) return;

    const volume = this.getVolume();
    try {
      this.playToneBurst(presetId, ctx, volume);
      this.previewTimer = setTimeout(() => {
        if (ctx.state !== 'closed') {
          this.playToneBurst(presetId, ctx, volume);
        }
      }, 1200);
    } catch (err) {
      console.warn('[RingtoneManager] Preview error:', err);
    }
  }

  stopPreview() {
    if (this.previewTimer) {
      clearTimeout(this.previewTimer);
      this.previewTimer = null;
    }
  }

  playMessageSound() {
    const soundNotifsEnabled = localStorage.getItem('mc_sound_notifs') !== 'false';
    if (!soundNotifsEnabled) return;

    const ctx = this.initAudioContext();
    if (!ctx) return;

    const playBeep = () => {
      try {
        const now = ctx.currentTime;
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();

        osc.type = 'sine';
        osc.frequency.setValueAtTime(587.33, now); // D5
        osc.frequency.exponentialRampToValueAtTime(880, now + 0.08); // A5

        gain.gain.setValueAtTime(0, now);
        gain.gain.linearRampToValueAtTime(this.getVolume() * 0.25, now + 0.02);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.25);

        osc.connect(gain);
        gain.connect(ctx.destination);

        osc.start(now);
        osc.stop(now + 0.25);
      } catch (err) {
        console.warn('[RingtoneManager] Message sound error:', err);
      }
    };

    if (ctx.state === 'suspended') {
      ctx.resume().then(playBeep).catch(playBeep);
    } else {
      playBeep();
    }
  }

  stop() {
    this.isPlaying = false;
    if (this.ringTimer) {
      clearInterval(this.ringTimer);
      this.ringTimer = null;
    }
    if (this.previewTimer) {
      clearTimeout(this.previewTimer);
      this.previewTimer = null;
    }
  }

  unlock() {
    if (this.audioCtx && this.audioCtx.state === 'suspended') {
      this.audioCtx.resume().catch(() => {});
    }
  }
}

export const ringtoneManager = new RingtoneManager();

if (typeof window !== 'undefined') {
  const unlockEvents = ['click', 'keydown', 'touchstart'];
  const handleUnlock = () => {
    ringtoneManager.unlock();
    unlockEvents.forEach((ev) => window.removeEventListener(ev, handleUnlock));
  };
  unlockEvents.forEach((ev) => window.addEventListener(ev, handleUnlock, { once: true }));
}
