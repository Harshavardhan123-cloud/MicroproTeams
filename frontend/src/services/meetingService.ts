import { apiClient } from '../api/client';

export interface MeetingParticipant {
  id: string;
  user_id: string;
  role: string;
  status: string;
  is_host: boolean;
  is_muted: boolean;
  camera_enabled: boolean;
  screen_sharing: boolean;
  raised_hand: boolean;
  joined_at: string | null;
}

export interface Meeting {
  id: string;
  organization_id: string;
  host_id: string;
  title: string;
  description: string | null;
  meeting_type: string;
  status: string;
  meeting_code: string;
  lobby_enabled: boolean;
  participant_count: number;
  participants: MeetingParticipant[];
}

export interface JoinMeetingResult {
  meeting: Meeting;
  participant_status: string;
  role: string;
  is_in_lobby: boolean;
}

export interface CallHistoryEntry {
  id: string;
  title: string;
  host_name: string;
  status: string;
  started_at: string | null;
  ended_at: string | null;
  participant_count: number;
}

export const meetingService = {
  createInstantMeeting: async (title: string): Promise<Meeting> => {
    const res = await apiClient.post('/meetings', { title, meeting_type: 'INSTANT' });
    return res.data.data || res.data;
  },

  getMeeting: async (meetingId: string): Promise<Meeting> => {
    const res = await apiClient.get(`/meetings/${meetingId}`);
    return res.data.data || res.data;
  },

  joinMeeting: async (meetingId: string): Promise<JoinMeetingResult> => {
    const res = await apiClient.post(`/meetings/${meetingId}/join`);
    return res.data.data || res.data;
  },

  leaveMeeting: async (meetingId: string): Promise<void> => {
    await apiClient.post(`/meetings/${meetingId}/leave`);
  },

  endMeeting: async (meetingId: string): Promise<void> => {
    try {
      await apiClient.post(`/meetings/${meetingId}/end`);
    } catch (e) {
      console.warn('Backend end meeting endpoint not available or error:', e);
    }
  },

  getMeetingState: async (meetingId: string): Promise<{ meeting: Meeting; participants: MeetingParticipant[] }> => {
    const res = await apiClient.get(`/meetings/${meetingId}/state`);
    return res.data.data || res.data;
  },

  getCallHistory: async (): Promise<CallHistoryEntry[]> => {
    const res = await apiClient.get('/calendar/history');
    return res.data.data || res.data;
  },
};
