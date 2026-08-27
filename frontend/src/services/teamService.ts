import { apiClient } from '../api/client';
import { Team } from '../types';

export interface CreateTeamPayload {
  name: string;
  description?: string;
  privacy: 'public' | 'private';
}

export interface UpdateTeamPayload {
  name?: string;
  description?: string;
  privacy?: 'public' | 'private';
}

export interface AddMemberPayload {
  user_id: string;
  role?: 'owner' | 'member' | 'guest';
}

export const teamService = {
  getTeams: async (): Promise<Team[]> => {
    const res = await apiClient.get('/teams');
    return res.data.data || res.data;
  },

  createTeam: async (payload: CreateTeamPayload): Promise<Team> => {
    const res = await apiClient.post('/teams', payload);
    return res.data.data || res.data;
  },

  getTeam: async (teamId: string): Promise<Team> => {
    const res = await apiClient.get(`/teams/${teamId}`);
    return res.data.data || res.data;
  },

  updateTeam: async (teamId: string, payload: UpdateTeamPayload): Promise<Team> => {
    const res = await apiClient.patch(`/teams/${teamId}`, payload);
    return res.data.data || res.data;
  },

  deleteTeam: async (teamId: string): Promise<void> => {
    await apiClient.delete(`/teams/${teamId}`);
  },

  getTeamMembers: async (teamId: string) => {
    const res = await apiClient.get(`/teams/${teamId}/members`);
    return res.data.data || res.data;
  },

  addTeamMember: async (teamId: string, payload: AddMemberPayload) => {
    const res = await apiClient.post(`/teams/${teamId}/members`, payload);
    return res.data.data || res.data;
  },

  removeTeamMember: async (teamId: string, userId: string) => {
    await apiClient.delete(`/teams/${teamId}/members/${userId}`);
  }
};
