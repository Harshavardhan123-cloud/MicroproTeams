import { create } from 'zustand';
import { Team, Channel } from '../types';

export type AppRailTab = 'activity' | 'chat' | 'contacts' | 'teams' | 'calendar' | 'calls' | 'files' | 'admin';

interface UIState {
  activeTab: AppRailTab;
  setActiveTab: (tab: AppRailTab) => void;
  
  selectedTeam: Team | null;
  setSelectedTeam: (team: Team | null) => void;
  
  selectedChannel: Channel | null;
  setSelectedChannel: (channel: Channel | null) => void;
  
  isSidebarCollapsed: boolean;
  toggleSidebar: () => void;

  isAppRailExpanded: boolean;
  toggleAppRail: () => void;

  isCreateTeamOpen: boolean;
  setCreateTeamOpen: (open: boolean) => void;

  isCreateChannelOpen: boolean;
  setCreateChannelOpen: (open: boolean) => void;

  isUserSettingsOpen: boolean;
  setUserSettingsOpen: (open: boolean) => void;

  isShortcutsOpen: boolean;
  setShortcutsOpen: (open: boolean) => void;

  isDocsOpen: boolean;
  setDocsOpen: (open: boolean) => void;

  isAboutOpen: boolean;
  setAboutOpen: (open: boolean) => void;

  isNewChatOpen: boolean;
  setNewChatOpen: (open: boolean) => void;

  activeMeetingId: string | null;
  setActiveMeetingId: (id: string | null) => void;

  isMeetingPoppedOut: boolean;
  setIsMeetingPoppedOut: (popped: boolean) => void;

  poppedOutChatId: string | null;
  setPoppedOutChatId: (id: string | null) => void;
}

export const useUIStore = create<UIState>((set) => ({
  activeTab: 'teams',
  setActiveTab: (tab) => set({ activeTab: tab }),

  selectedTeam: null,
  setSelectedTeam: (team) => set({ selectedTeam: team }),

  selectedChannel: null,
  setSelectedChannel: (channel) => set({ selectedChannel: channel }),

  isSidebarCollapsed: false,
  toggleSidebar: () =>
    set((state) => {
      const next = !state.isSidebarCollapsed;
      localStorage.setItem('mc_sidebar_collapsed', String(next));
      return { isSidebarCollapsed: next };
    }),

  isAppRailExpanded: localStorage.getItem('mc_apprail_expanded') === 'true',
  toggleAppRail: () =>
    set((state) => {
      const next = !state.isAppRailExpanded;
      localStorage.setItem('mc_apprail_expanded', String(next));
      return { isAppRailExpanded: next };
    }),

  isCreateTeamOpen: false,
  setCreateTeamOpen: (open) => set({ isCreateTeamOpen: open }),

  isCreateChannelOpen: false,
  setCreateChannelOpen: (open) => set({ isCreateChannelOpen: open }),

  isUserSettingsOpen: false,
  setUserSettingsOpen: (open) => set({ isUserSettingsOpen: open }),

  isShortcutsOpen: false,
  setShortcutsOpen: (open) => set({ isShortcutsOpen: open }),

  isDocsOpen: false,
  setDocsOpen: (open) => set({ isDocsOpen: open }),

  isAboutOpen: false,
  setAboutOpen: (open) => set({ isAboutOpen: open }),

  isNewChatOpen: false,
  setNewChatOpen: (open) => set({ isNewChatOpen: open }),

  activeMeetingId: null,
  setActiveMeetingId: (id) => set({ activeMeetingId: id }),

  isMeetingPoppedOut: false,
  setIsMeetingPoppedOut: (popped: boolean) => set({ isMeetingPoppedOut: popped }),

  poppedOutChatId: null,
  setPoppedOutChatId: (id) => set({ poppedOutChatId: id }),
}));
