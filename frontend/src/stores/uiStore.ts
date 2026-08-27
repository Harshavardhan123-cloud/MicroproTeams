import { create } from 'zustand';
import { Team, Channel } from '../types';

export type AppRailTab = 'activity' | 'chat' | 'teams' | 'calendar' | 'calls' | 'files' | 'admin';

interface UIState {
  activeTab: AppRailTab;
  setActiveTab: (tab: AppRailTab) => void;
  
  selectedTeam: Team | null;
  setSelectedTeam: (team: Team | null) => void;
  
  selectedChannel: Channel | null;
  setSelectedChannel: (channel: Channel | null) => void;
  
  isSidebarCollapsed: boolean;
  toggleSidebar: () => void;

  isCreateTeamOpen: boolean;
  setCreateTeamOpen: (open: boolean) => void;

  isCreateChannelOpen: boolean;
  setCreateChannelOpen: (open: boolean) => void;

  isUserSettingsOpen: boolean;
  setUserSettingsOpen: (open: boolean) => void;
}

export const useUIStore = create<UIState>((set) => ({
  activeTab: 'teams',
  setActiveTab: (tab) => set({ activeTab: tab }),

  selectedTeam: null,
  setSelectedTeam: (team) => set({ selectedTeam: team }),

  selectedChannel: null,
  setSelectedChannel: (channel) => set({ selectedChannel: channel }),

  isSidebarCollapsed: false,
  toggleSidebar: () => set((state) => ({ isSidebarCollapsed: !state.isSidebarCollapsed })),

  isCreateTeamOpen: false,
  setCreateTeamOpen: (open) => set({ isCreateTeamOpen: open }),

  isCreateChannelOpen: false,
  setCreateChannelOpen: (open) => set({ isCreateChannelOpen: open }),

  isUserSettingsOpen: false,
  setUserSettingsOpen: (open) => set({ isUserSettingsOpen: open }),
}));
