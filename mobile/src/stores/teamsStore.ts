import { apiClient } from '../api/client';
import { wsService } from '../services/websocketService';

export interface Channel {
  id: string;
  team_id: string;
  name: string;
  description?: string;
  type?: 'standard' | 'private' | 'shared';
  is_private?: boolean;
  unread_count?: number;
  last_message?: string;
  created_at?: string;
}

export interface Team {
  id: string;
  name: string;
  description?: string;
  icon_url?: string;
  owner_id?: string;
  channels: Channel[];
  members_count?: number;
  created_at?: string;
}

export interface TeamMemberInfo {
  id: string;
  team_id: string;
  user_id: string;
  role: 'owner' | 'member' | 'guest';
  joined_at?: string;
  user?: {
    id: string;
    display_name?: string;
    email?: string;
    avatar_url?: string;
    presence?: string;
  };
}

export interface ChannelMemberInfo {
  id: string;
  channel_id: string;
  user_id: string;
  role: 'OWNER' | 'MEMBER';
  joined_at?: string;
  user?: {
    id: string;
    display_name?: string;
    email?: string;
    avatar_url?: string;
  };
}

interface TeamsState {
  teams: Team[];
  selectedTeam: Team | null;
  selectedChannel: Channel | null;
  isLoading: boolean;
  error: string | null;

  // Membership management state, keyed by team/channel id.
  teamMembers: Record<string, TeamMemberInfo[]>;
  channelMembers: Record<string, ChannelMemberInfo[]>;
  isLoadingMembers: boolean;
}

type Listener = () => void;
type ActionResult = { success: boolean; error?: string };

// Normalizes a raw channel payload from any teams/channels endpoint into our
// local Channel shape, deriving the convenience `is_private` flag from the
// backend's `type` (standard | private | shared) enum.
function mapChannel(raw: any): Channel {
  return {
    id: String(raw.id),
    team_id: raw.team_id ? String(raw.team_id) : '',
    name: raw.name,
    description: raw.description,
    type: raw.type,
    is_private: raw.type === 'private',
    unread_count: raw.unread_count,
    last_message: raw.last_message,
    created_at: raw.created_at,
  };
}

function mapTeam(raw: any): Team {
  return {
    id: String(raw.id),
    name: raw.name,
    description: raw.description,
    icon_url: raw.avatar_url || raw.icon_url,
    owner_id: raw.owner_id ? String(raw.owner_id) : undefined,
    channels: Array.isArray(raw.channels) ? raw.channels.map(mapChannel) : [],
    members_count: raw.members_count,
    created_at: raw.created_at,
  };
}

function mapTeamMember(raw: any): TeamMemberInfo {
  return {
    id: String(raw.id),
    team_id: String(raw.team_id),
    user_id: String(raw.user_id),
    role: raw.role,
    joined_at: raw.joined_at,
    user: raw.user
      ? {
          id: String(raw.user.id),
          display_name: raw.user.display_name,
          email: raw.user.email,
          avatar_url: raw.user.avatar_url,
          presence: raw.user.presence,
        }
      : undefined,
  };
}

function mapChannelMember(raw: any): ChannelMemberInfo {
  return {
    id: String(raw.id),
    channel_id: String(raw.channel_id),
    user_id: String(raw.user_id),
    role: raw.role,
    joined_at: raw.joined_at,
    user: raw.user
      ? {
          id: String(raw.user.id),
          display_name: raw.user.display_name,
          email: raw.user.email,
          avatar_url: raw.user.avatar_url,
        }
      : undefined,
  };
}

// Extracts a human-readable error message the same way chatStore does,
// matching the backend's { success:false, error:{ code, message } } envelope.
function extractErrorMessage(err: any, fallback: string): string {
  return (
    err?.response?.data?.error?.message ||
    err?.response?.data?.message ||
    err?.message ||
    fallback
  );
}

class TeamsStore {
  private state: TeamsState = {
    teams: [],
    selectedTeam: null,
    selectedChannel: null,
    isLoading: false,
    error: null,
    teamMembers: {},
    channelMembers: {},
    isLoadingMembers: false,
  };

  private listeners: Set<Listener> = new Set();

  constructor() {
    this.setupWebSocket();
  }

  getState(): TeamsState {
    return { ...this.state };
  }

  subscribe(listener: Listener) {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  private notify() {
    this.listeners.forEach((l) => l());
  }

  private setupWebSocket() {
    wsService.on((event: any) => {
      if (
        event.type === 'team.created' ||
        event.type === 'team.updated' ||
        event.type === 'channel.created' ||
        event.type === 'channel.deleted'
      ) {
        this.fetchTeams();
      }
    });
  }

  async fetchTeams() {
    this.state.isLoading = true;
    this.state.error = null;
    this.notify();

    try {
      const res = await apiClient.get('/teams');
      const raw = Array.isArray(res.data) ? res.data : res.data.data || [];
      const data: Team[] = raw.map(mapTeam);

      this.state.teams = data;
      this.state.isLoading = false;

      // Automatically select first team & first channel if none selected
      if (data.length > 0) {
        if (!this.state.selectedTeam || !data.some((t) => t.id === this.state.selectedTeam?.id)) {
          this.state.selectedTeam = data[0];
        } else {
          // Refresh selected team reference
          const updated = data.find((t) => t.id === this.state.selectedTeam?.id);
          if (updated) this.state.selectedTeam = updated;
        }

        if (this.state.selectedTeam?.channels && this.state.selectedTeam.channels.length > 0) {
          if (!this.state.selectedChannel || !this.state.selectedTeam.channels.some((c) => c.id === this.state.selectedChannel?.id)) {
            this.state.selectedChannel = this.state.selectedTeam.channels[0];
          } else {
            // Refresh selected channel reference too, so is_private/description edits show up.
            const updatedChannel = this.state.selectedTeam.channels.find((c) => c.id === this.state.selectedChannel?.id);
            if (updatedChannel) this.state.selectedChannel = updatedChannel;
          }
        } else {
          this.state.selectedChannel = null;
        }
      } else {
        this.state.selectedTeam = null;
        this.state.selectedChannel = null;
      }
      this.notify();
    } catch (err: any) {
      console.warn('Teams fetch error:', err);
      this.state.error = err.message || 'Failed to load teams';
      this.state.isLoading = false;
      this.notify();
    }
  }

  selectTeam(team: Team) {
    this.state.selectedTeam = team;
    if (team.channels && team.channels.length > 0) {
      this.state.selectedChannel = team.channels[0];
    } else {
      this.state.selectedChannel = null;
    }
    this.notify();
  }

  selectChannel(channel: Channel) {
    this.state.selectedChannel = channel;
    this.notify();
  }

  // -------------------------------------------------------------
  // Team CRUD
  // -------------------------------------------------------------

  async createTeam(payload: { name: string; description?: string }): Promise<ActionResult> {
    try {
      await apiClient.post('/teams', {
        name: payload.name.trim(),
        description: payload.description?.trim() || undefined,
      });
      await this.fetchTeams();
      return { success: true };
    } catch (err: any) {
      const message = extractErrorMessage(err, 'Failed to create team.');
      console.warn('Create team error:', err);
      this.state.error = message;
      this.notify();
      return { success: false, error: message };
    }
  }

  async updateTeam(teamId: string, payload: { name?: string; description?: string }): Promise<ActionResult> {
    try {
      await apiClient.patch(`/teams/${teamId}`, payload);
      await this.fetchTeams();
      return { success: true };
    } catch (err: any) {
      const message = extractErrorMessage(err, 'Failed to update team.');
      console.warn('Update team error:', err);
      this.state.error = message;
      this.notify();
      return { success: false, error: message };
    }
  }

  async deleteTeam(teamId: string): Promise<ActionResult> {
    try {
      await apiClient.delete(`/teams/${teamId}`);
      if (this.state.selectedTeam?.id === teamId) {
        this.state.selectedTeam = null;
        this.state.selectedChannel = null;
      }
      await this.fetchTeams();
      return { success: true };
    } catch (err: any) {
      const message = extractErrorMessage(err, 'Failed to delete team.');
      console.warn('Delete team error:', err);
      this.state.error = message;
      this.notify();
      return { success: false, error: message };
    }
  }

  async transferOwnership(teamId: string, newOwnerId: string): Promise<ActionResult> {
    try {
      await apiClient.post(`/teams/${teamId}/transfer-ownership`, { new_owner_id: newOwnerId });
      await this.fetchTeamMembers(teamId);
      await this.fetchTeams();
      return { success: true };
    } catch (err: any) {
      const message = extractErrorMessage(err, 'Failed to transfer ownership.');
      console.warn('Transfer ownership error:', err);
      this.state.error = message;
      this.notify();
      return { success: false, error: message };
    }
  }

  // -------------------------------------------------------------
  // Team Membership
  // -------------------------------------------------------------

  async fetchTeamMembers(teamId: string): Promise<void> {
    this.state.isLoadingMembers = true;
    this.notify();

    try {
      const res = await apiClient.get(`/teams/${teamId}/members`);
      const raw = Array.isArray(res.data) ? res.data : res.data.data || [];
      this.state.teamMembers = { ...this.state.teamMembers, [teamId]: raw.map(mapTeamMember) };
      this.state.isLoadingMembers = false;
      this.notify();
    } catch (err: any) {
      console.warn('Fetch team members error:', err);
      this.state.error = extractErrorMessage(err, 'Failed to load team members.');
      this.state.isLoadingMembers = false;
      this.notify();
    }
  }

  async addTeamMember(teamId: string, userId: string, role: 'owner' | 'member' | 'guest' = 'member'): Promise<ActionResult> {
    try {
      await apiClient.post(`/teams/${teamId}/members`, { user_id: userId, role });
      await this.fetchTeamMembers(teamId);
      await this.fetchTeams();
      return { success: true };
    } catch (err: any) {
      const message = extractErrorMessage(err, 'Failed to add team member.');
      console.warn('Add team member error:', err);
      this.state.error = message;
      this.notify();
      return { success: false, error: message };
    }
  }

  async updateTeamMemberRole(teamId: string, userId: string, role: 'owner' | 'member' | 'guest'): Promise<ActionResult> {
    try {
      await apiClient.patch(`/teams/${teamId}/members/${userId}`, { role });
      await this.fetchTeamMembers(teamId);
      return { success: true };
    } catch (err: any) {
      const message = extractErrorMessage(err, 'Failed to update member role.');
      console.warn('Update team member role error:', err);
      this.state.error = message;
      this.notify();
      return { success: false, error: message };
    }
  }

  async removeTeamMember(teamId: string, userId: string): Promise<ActionResult> {
    try {
      await apiClient.delete(`/teams/${teamId}/members/${userId}`);
      await this.fetchTeamMembers(teamId);
      await this.fetchTeams();
      return { success: true };
    } catch (err: any) {
      const message = extractErrorMessage(err, 'Failed to remove team member.');
      console.warn('Remove team member error:', err);
      this.state.error = message;
      this.notify();
      return { success: false, error: message };
    }
  }

  // -------------------------------------------------------------
  // Channel CRUD
  // -------------------------------------------------------------

  async createChannel(
    teamId: string,
    payload: { name: string; description?: string; is_private?: boolean }
  ): Promise<ActionResult> {
    try {
      await apiClient.post(`/teams/${teamId}/channels`, {
        name: payload.name.trim(),
        description: payload.description?.trim() || undefined,
        channel_type: payload.is_private ? 'private' : 'standard',
      });
      await this.fetchTeams();
      return { success: true };
    } catch (err: any) {
      const message = extractErrorMessage(err, 'Failed to create channel.');
      console.warn('Create channel error:', err);
      this.state.error = message;
      this.notify();
      return { success: false, error: message };
    }
  }

  async updateChannel(channelId: string, payload: { name?: string; description?: string }): Promise<ActionResult> {
    try {
      await apiClient.patch(`/channels/${channelId}`, payload);
      await this.fetchTeams();
      return { success: true };
    } catch (err: any) {
      const message = extractErrorMessage(err, 'Failed to update channel.');
      console.warn('Update channel error:', err);
      this.state.error = message;
      this.notify();
      return { success: false, error: message };
    }
  }

  async deleteChannel(channelId: string): Promise<ActionResult> {
    try {
      await apiClient.delete(`/channels/${channelId}`);
      if (this.state.selectedChannel?.id === channelId) {
        this.state.selectedChannel = null;
      }
      await this.fetchTeams();
      return { success: true };
    } catch (err: any) {
      const message = extractErrorMessage(err, 'Failed to delete channel.');
      console.warn('Delete channel error:', err);
      this.state.error = message;
      this.notify();
      return { success: false, error: message };
    }
  }

  // -------------------------------------------------------------
  // Private Channel Membership
  // -------------------------------------------------------------

  async fetchChannelMembers(channelId: string): Promise<void> {
    this.state.isLoadingMembers = true;
    this.notify();

    try {
      const res = await apiClient.get(`/channels/${channelId}/members`);
      const raw = Array.isArray(res.data) ? res.data : res.data.data || [];
      this.state.channelMembers = { ...this.state.channelMembers, [channelId]: raw.map(mapChannelMember) };
      this.state.isLoadingMembers = false;
      this.notify();
    } catch (err: any) {
      console.warn('Fetch channel members error:', err);
      this.state.error = extractErrorMessage(err, 'Failed to load channel members.');
      this.state.isLoadingMembers = false;
      this.notify();
    }
  }

  async addChannelMember(channelId: string, userId: string): Promise<ActionResult> {
    try {
      await apiClient.post(`/channels/${channelId}/members`, { user_id: userId });
      await this.fetchChannelMembers(channelId);
      return { success: true };
    } catch (err: any) {
      const message = extractErrorMessage(err, 'Failed to add channel member.');
      console.warn('Add channel member error:', err);
      this.state.error = message;
      this.notify();
      return { success: false, error: message };
    }
  }

  async removeChannelMember(channelId: string, userId: string): Promise<ActionResult> {
    try {
      await apiClient.delete(`/channels/${channelId}/members/${userId}`);
      await this.fetchChannelMembers(channelId);
      return { success: true };
    } catch (err: any) {
      const message = extractErrorMessage(err, 'Failed to remove channel member.');
      console.warn('Remove channel member error:', err);
      this.state.error = message;
      this.notify();
      return { success: false, error: message };
    }
  }
}

export const teamsStore = new TeamsStore();
