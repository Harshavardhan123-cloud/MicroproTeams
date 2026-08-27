import React, { useState } from 'react';
import { ChevronDown, ChevronRight, Hash, Lock, Plus, Settings } from 'lucide-react';
import { Team, Channel } from '../../types';
import { useUIStore } from '../../stores/uiStore';
import { TeamSettingsModal } from '../modals/TeamSettingsModal';

interface SidebarProps {
  teams: Team[];
  isLoading: boolean;
}

export const Sidebar: React.FC<SidebarProps> = ({ teams, isLoading }) => {
  const { selectedTeam, setSelectedTeam, selectedChannel, setSelectedChannel, setCreateTeamOpen, setCreateChannelOpen } = useUIStore();
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

  return (
    <div className="w-64 bg-[#1F1F1F] border-r border-teams-border flex flex-col h-full select-none">
      {/* Top Header */}
      <div className="h-14 border-b border-teams-border flex items-center justify-between px-4">
        <h2 className="font-bold text-sm text-white">Teams & Channels</h2>
        <button
          onClick={() => setCreateTeamOpen(true)}
          className="p-1 text-teams-muted hover:text-white hover:bg-teams-hover rounded-md transition-colors"
          title="Create Team"
        >
          <Plus className="w-4 h-4" />
        </button>
      </div>

      {/* Teams Navigation Tree */}
      <div className="flex-1 overflow-y-auto p-2 space-y-1">
        {isLoading ? (
          <div className="p-4 text-center text-teams-muted text-xs animate-pulse">Loading workspace teams...</div>
        ) : teams.length === 0 ? (
          <div className="p-4 text-center text-teams-muted text-xs">No teams found. Create your first team!</div>
        ) : (
          teams.map((team) => {
            const isExpanded = expandedTeams[team.id] ?? true;
            const isSelected = selectedTeam?.id === team.id;

            return (
              <div key={team.id} className="space-y-0.5">
                {/* Team Header Row */}
                <div
                  className={`group flex items-center justify-between px-2 py-1.5 rounded-lg cursor-pointer transition-colors ${
                    isSelected ? 'bg-[#292929] text-white font-semibold' : 'text-teams-muted hover:bg-teams-hover hover:text-white'
                  }`}
                  onClick={() => handleSelectTeam(team)}
                >
                  <div className="flex items-center gap-1.5 flex-1 min-w-0">
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        toggleTeam(team.id);
                      }}
                      className="p-0.5 text-teams-muted hover:text-white rounded"
                    >
                      {isExpanded ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
                    </button>
                    <span className="text-xs truncate">{team.name}</span>
                  </div>

                  <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        setSettingsTeam(team);
                      }}
                      className="p-1 text-teams-muted hover:text-white rounded"
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
                      className="p-1 text-teams-muted hover:text-white rounded"
                      title="Create Channel"
                    >
                      <Plus className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>

                {/* Channels List */}
                {isExpanded && (
                  <div className="pl-6 space-y-0.5">
                    {team.channels?.map((channel) => {
                      const isChannelSelected = selectedChannel?.id === channel.id;
                      return (
                        <div
                          key={channel.id}
                          onClick={() => {
                            setSelectedTeam(team);
                            setSelectedChannel(channel);
                          }}
                          className={`flex items-center gap-2 px-2 py-1 rounded-md text-xs cursor-pointer transition-colors ${
                            isChannelSelected
                              ? 'bg-teams-purple/20 text-teams-purple font-bold border-l-2 border-teams-purple'
                              : 'text-teams-muted hover:bg-teams-hover hover:text-white'
                          }`}
                        >
                          {channel.type === 'private' ? (
                            <Lock className="w-3.5 h-3.5 text-amber-400" />
                          ) : (
                            <Hash className="w-3.5 h-3.5" />
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
