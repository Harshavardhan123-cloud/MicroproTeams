import React, { useState } from 'react';
import { ChevronDown, ChevronRight, Hash, Lock, Plus, Settings, Layers, PanelLeftClose, PanelLeft } from 'lucide-react';
import { Team, Channel } from '../../types';
import { useUIStore } from '../../stores/uiStore';
import { TeamSettingsModal } from '../modals/TeamSettingsModal';

interface SidebarProps {
  teams: Team[];
  isLoading: boolean;
}

export const Sidebar: React.FC<SidebarProps> = ({ teams, isLoading }) => {
  const { 
    selectedTeam, setSelectedTeam, 
    selectedChannel, setSelectedChannel, 
    setCreateTeamOpen, setCreateChannelOpen,
    isSidebarCollapsed, toggleSidebar
  } = useUIStore();
  const [expandedTeams, setExpandedTeams] = useState<Record<string, boolean>>({});
  const [settingsTeam, setSettingsTeam] = useState<Team | null>(null);

  const toggleTeam = (teamId: string) => {
    setExpandedTeams((prev) => ({ ...prev, [teamId]: !prev[teamId] }));
  };

  const handleSelectTeam = (team: Team) => {
    setSelectedTeam(team);
    if (team.channels && team.channels.length > 0) {
      setSelectedChannel(team.channels[0]);
    }
  };

  if (isSidebarCollapsed) {
    return (
      <aside className="w-14 bg-[#11131A] border-r border-white/5 flex flex-col items-center py-3 select-none shrink-0 transition-all duration-300">
        <button
          onClick={toggleSidebar}
          className="p-2 text-indigo-400 hover:text-white hover:bg-white/10 rounded-xl transition-all mb-4 shadow-sm group"
          title="Expand Workspaces Sidebar"
        >
          <PanelLeft className="w-4 h-4 group-hover:scale-110 transition-transform" />
        </button>

        <button
          onClick={() => setCreateTeamOpen(true)}
          className="p-2 text-mc-secondary hover:text-white hover:bg-white/5 rounded-xl transition-colors mb-3"
          title="Create Workspace Team"
        >
          <Plus className="w-4 h-4" />
        </button>

        <div className="w-8 h-px bg-white/10 mb-3" />

        <div className="flex-1 overflow-y-auto space-y-2 w-full px-1">
          {teams.map((team) => {
            const isSelected = selectedTeam?.id === team.id;
            const initials = team.name ? team.name.substring(0, 2).toUpperCase() : 'W';
            return (
              <button
                key={team.id}
                onClick={() => handleSelectTeam(team)}
                className={`w-9 h-9 rounded-xl flex items-center justify-center font-bold text-[11px] transition-all mx-auto ${
                  isSelected
                    ? 'bg-gradient-to-br from-indigo-600/40 to-violet-600/30 text-indigo-300 border border-indigo-500/50 shadow-md ring-1 ring-indigo-500/30'
                    : 'text-mc-secondary hover:text-white hover:bg-white/5'
                }`}
                title={team.name}
              >
                {initials}
              </button>
            );
          })}
        </div>
      </aside>
    );
  }

  return (
    <div className="w-64 bg-[#11131A] border-r border-white/5 flex flex-col h-full select-none shrink-0 transition-all duration-300">
      {/* Top Header */}
      <div className="h-12 border-b border-white/5 flex items-center justify-between px-4">
        <div className="flex items-center gap-2">
          <Layers className="w-4 h-4 text-indigo-400" />
          <h2 className="font-bold text-xs text-white tracking-wide uppercase font-display">Workspaces</h2>
        </div>
        <div className="flex items-center gap-1">
          <button
            onClick={() => setCreateTeamOpen(true)}
            className="p-1 text-mc-secondary hover:text-white hover:bg-white/5 rounded-lg transition-colors"
            title="Create Workspace Team"
          >
            <Plus className="w-4 h-4" />
          </button>
          <button
            onClick={toggleSidebar}
            className="p-1 text-mc-secondary hover:text-white hover:bg-white/5 rounded-lg transition-colors"
            title="Collapse Sidebar (Ctrl+B)"
          >
            <PanelLeftClose className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Teams Navigation Tree */}
      <div className="flex-1 overflow-y-auto p-2 space-y-1">
        {isLoading ? (
          <div className="p-4 text-center text-mc-muted text-xs animate-pulse">Loading channels...</div>
        ) : teams.length === 0 ? (
          <div className="p-4 text-center text-mc-muted text-xs">No workspace teams yet. Create one!</div>
        ) : (
          teams.map((team) => {
            const isExpanded = expandedTeams[team.id] ?? true;
            const isSelected = selectedTeam?.id === team.id;

            return (
              <div key={team.id} className="space-y-0.5">
                {/* Team Header Row */}
                <div
                  className={`group flex items-center justify-between px-2 py-1.5 rounded-xl cursor-pointer transition-all ${
                    isSelected ? 'bg-white/5 text-white font-semibold' : 'text-mc-secondary hover:bg-white/5 hover:text-white'
                  }`}
                  onClick={() => handleSelectTeam(team)}
                >
                  <div className="flex items-center gap-1.5 flex-1 min-w-0">
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        toggleTeam(team.id);
                      }}
                      className="p-0.5 text-mc-muted hover:text-white rounded"
                    >
                      {isExpanded ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
                    </button>
                    <span className="text-xs truncate font-medium">{team.name}</span>
                  </div>

                  <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        setSettingsTeam(team);
                      }}
                      className="p-1 text-mc-muted hover:text-white rounded"
                      title="Team Settings"
                    >
                      <Settings className="w-3.5 h-3.5" />
                    </button>

                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        setSelectedTeam(team);
                        setCreateChannelOpen(true);
                      }}
                      className="p-1 text-mc-muted hover:text-white rounded"
                      title="Create Channel"
                    >
                      <Plus className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>

                {/* Channels List */}
                {isExpanded && (
                  <div className="pl-4 space-y-0.5">
                    {team.channels?.map((channel) => {
                      const isChannelSelected = selectedChannel?.id === channel.id;
                      return (
                        <div
                          key={channel.id}
                          onClick={() => {
                            setSelectedTeam(team);
                            setSelectedChannel(channel);
                          }}
                          className={`flex items-center gap-2 px-2.5 py-1.5 rounded-lg text-xs cursor-pointer transition-all ${
                            isChannelSelected
                              ? 'bg-indigo-600/15 text-indigo-300 font-semibold border-l-2 border-indigo-500'
                              : 'text-mc-secondary hover:bg-white/5 hover:text-white'
                          }`}
                        >
                          {channel.type === 'private' ? (
                            <Lock className="w-3.5 h-3.5 text-amber-400" />
                          ) : (
                            <Hash className="w-3.5 h-3.5 text-mc-muted" />
                          )}
                          <span className="truncate">{channel.name}</span>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>

      <TeamSettingsModal
        isOpen={!!settingsTeam}
        team={settingsTeam}
        onClose={() => setSettingsTeam(null)}
        onSuccess={() => setSettingsTeam(null)}
      />
    </div>
  );
};
