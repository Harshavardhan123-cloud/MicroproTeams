/**
 * Curated Avatar Presets & Generator Utilities
 * 
 * Provides vibrant, modern SVG and illustrated avatar presets, DiceBear generators,
 * and gradient profile initializers for Micropro Commute users.
 */

export interface AvatarPreset {
  id: string;
  name: string;
  category: '3D Style' | 'Minimalist' | 'Gradient' | 'Tech';
  url: string;
}

export const AVATAR_PRESETS: AvatarPreset[] = [
  {
    id: 'avatar-aurora',
    name: 'Cosmic Aurora',
    category: 'Gradient',
    url: 'https://api.dicebear.com/7.x/identicon/svg?seed=Aurora&backgroundColor=6366f1,7c3aed'
  },
  {
    id: 'avatar-cyber-fox',
    name: 'Cyber Fox',
    category: 'Tech',
    url: 'https://api.dicebear.com/7.x/bottts/svg?seed=CyberFox&backgroundColor=0f172a'
  },
  {
    id: 'avatar-neon-pulse',
    name: 'Neon Pulse',
    category: 'Gradient',
    url: 'https://api.dicebear.com/7.x/shapes/svg?seed=NeonPulse&backgroundColor=06b6d4,3b82f6'
  },
  {
    id: 'avatar-astro',
    name: 'Astronaut',
    category: '3D Style',
    url: 'https://api.dicebear.com/7.x/avataaars/svg?seed=Astro&backgroundColor=1e1b4b'
  },
  {
    id: 'avatar-zen-lotus',
    name: 'Zen Harmony',
    category: 'Minimalist',
    url: 'https://api.dicebear.com/7.x/shapes/svg?seed=ZenLotus&backgroundColor=10b981,059669'
  },
  {
    id: 'avatar-quantum',
    name: 'Quantum Core',
    category: 'Tech',
    url: 'https://api.dicebear.com/7.x/bottts/svg?seed=Quantum&backgroundColor=312e81'
  },
  {
    id: 'avatar-nova-star',
    name: 'Supernova',
    category: 'Gradient',
    url: 'https://api.dicebear.com/7.x/identicon/svg?seed=Supernova&backgroundColor=f43f5e,fb923c'
  },
  {
    id: 'avatar-solaris',
    name: 'Solaris',
    category: '3D Style',
    url: 'https://api.dicebear.com/7.x/avataaars/svg?seed=Solaris&backgroundColor=18181b'
  },
  {
    id: 'avatar-matrix',
    name: 'Matrix Echo',
    category: 'Tech',
    url: 'https://api.dicebear.com/7.x/bottts/svg?seed=MatrixEcho&backgroundColor=022c22'
  },
  {
    id: 'avatar-prism',
    name: 'Prism Geometry',
    category: 'Minimalist',
    url: 'https://api.dicebear.com/7.x/shapes/svg?seed=PrismGeo&backgroundColor=4c1d95'
  },
  {
    id: 'avatar-vortex',
    name: 'Violet Vortex',
    category: 'Gradient',
    url: 'https://api.dicebear.com/7.x/identicon/svg?seed=Vortex&backgroundColor=8b5cf6,ec4899'
  },
  {
    id: 'avatar-apex',
    name: 'Apex Nomad',
    category: '3D Style',
    url: 'https://api.dicebear.com/7.x/avataaars/svg?seed=ApexNomad&backgroundColor=0c0a09'
  }
];

export function generateRandomAvatarUrl(): string {
  const seed = Math.random().toString(36).substring(2, 10);
  const styles = ['avataaars', 'bottts', 'identicon', 'shapes'];
  const chosenStyle = styles[Math.floor(Math.random() * styles.length)];
  return `https://api.dicebear.com/7.x/${chosenStyle}/svg?seed=${seed}&radius=50`;
}
