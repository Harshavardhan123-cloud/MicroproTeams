import { apiClient } from '../api/client';
import { Recording, Transcript } from '../types/meetingAI';

export const recordingService = {
  startRecording: async (meetingId: string, recordingType = 'FULL_MEETING') => {
    const res = await apiClient.post(`/meetings/${meetingId}/recording/start`, {
      recording_type: recordingType
    });
    return res.data;
  },

  stopRecording: async (meetingId: string, recordingId: string) => {
    const res = await apiClient.post(`/meetings/${meetingId}/recording/stop`, {
      recording_id: recordingId
    });
    return res.data;
  },

  getRecordings: async (meetingId: string): Promise<Recording[]> => {
    const res = await apiClient.get(`/meetings/${meetingId}/recordings`);
    return res.data;
  },

  getPlaybackUrl: async (recordingId: string) => {
    const res = await apiClient.get(`/recordings/${recordingId}/playback-url`);
    return res.data;
  },

  getTranscript: async (recordingId: string): Promise<Transcript> => {
    const res = await apiClient.get(`/recordings/${recordingId}/transcript`);
    return res.data;
  }
};
