import { apiClient } from '../api/client';
import { MeetingSummary, ActionItem, TranscriptSegment } from '../types/meetingAI';

const SPEECH_API_BASE = (import.meta as any).env?.VITE_SPEECH_API_BASE || 'http://localhost:8080';

export interface DiarizationSegment {
  start_time: number;
  end_time: number;
  speaker: string;
  text: string;
  confidence?: number;
}

export interface DiarizationResult {
  full_text: string;
  language?: string;
  duration?: number;
  segments: DiarizationSegment[];
  speaker_count?: number;
}

export const meetingAIService = {
  getSummary: async (meetingId: string): Promise<MeetingSummary> => {
    const res = await apiClient.get(`/meetings/${meetingId}/summary`);
    return res.data;
  },

  askAssistant: async (meetingId: string, question: string) => {
    const res = await apiClient.post(`/meetings/${meetingId}/ai/ask`, { question });
    return res.data;
  },

  getActionItems: async (meetingId: string): Promise<ActionItem[]> => {
    const res = await apiClient.get(`/meetings/${meetingId}/action-items`);
    return res.data;
  },

  updateActionItem: async (actionItemId: string, updateData: Partial<ActionItem>) => {
    const res = await apiClient.patch(`/meeting-action-items/${actionItemId}`, updateData);
    return res.data;
  },

  /**
   * Send recording blob to Speech Intelligence API at http://192.168.1.199:8080
   * for transcription + speaker diarization.
   * Expected endpoint: POST /transcribe  (multipart/form-data, field: "audio")
   * Returns: { full_text, segments: [{ start_time, end_time, speaker, text, confidence }] }
   */
  transcribeWithDiarization: async (
    blob: Blob,
    filename: string,
    mimeType: string,
    onProgress?: (status: string) => void
  ): Promise<DiarizationResult> => {
    onProgress?.('Uploading recording to Speech Intelligence API…');

    const formData = new FormData();
    const audioFile = new File([blob], filename, { type: mimeType || 'audio/webm' });
    formData.append('file', audioFile);
    formData.append('tier', 'bakeoff');
    formData.append('consent_ack', 'true');

    let response = await fetch(`${SPEECH_API_BASE}/api/jobs`, {
      method: 'POST',
      body: formData,
    });

    if (!response.ok) {
      // Fallback: try legacy endpoint /transcribe with field "audio"
      const fallbackFormData = new FormData();
      fallbackFormData.append('audio', audioFile);
      fallbackFormData.append('diarize', 'true');
      const fallbackRes = await fetch(`${SPEECH_API_BASE}/transcribe`, {
        method: 'POST',
        body: fallbackFormData,
      });

      if (!fallbackRes.ok) {
        const errText = await response.text().catch(() => 'Unknown error');
        throw new Error(`Speech API error ${response.status}: ${errText}`);
      }
      response = fallbackRes;
    }

    const initialData = await response.json();

    // Handle job_id flow (Multi-Model Speech Intelligence Bake-Off API)
    if (initialData.job_id) {
      const jobId = initialData.job_id;
      onProgress?.('Processing speech recognition & speaker diarization…');

      let attempts = 0;
      while (attempts < 30) {
        attempts++;
        await new Promise((r) => setTimeout(r, 1200));
        try {
          const statusRes = await fetch(`${SPEECH_API_BASE}/api/jobs/${jobId}`);
          if (statusRes.ok) {
            const statusData = await statusRes.json();
            onProgress?.(`Processing speech models (${statusData.status})...`);
            if (statusData.status === 'completed') {
              break;
            } else if (statusData.status === 'failed') {
              throw new Error(`Job failed on Speech API: ${statusData.error || 'Unknown error'}`);
            }
          }
        } catch (e) {
          console.warn('Job poll notice:', e);
        }
      }

      onProgress?.('Fetching diarization transcript report…');
      const exportRes = await fetch(`${SPEECH_API_BASE}/api/jobs/${jobId}/export?format=json`);
      if (exportRes.ok) {
        const exportData = await exportRes.json();
        const convList = exportData.conversation || [];

        const segments: DiarizationSegment[] = convList.map((item: any, idx: number) => ({
          start_time: item.start ?? item.start_time ?? 0,
          end_time: item.end ?? item.end_time ?? 0,
          speaker: item.speaker || item.speaker_name || `Speaker ${idx + 1}`,
          text: item.text || item.transcript || '',
          confidence: item.confidence ?? 95,
        }));

        const fullText = exportData.transcript || exportData.plain_transcript || segments.map(s => s.text).join(' ');

        return {
          full_text: fullText || 'No spoken words detected in recording.',
          language: exportData.transcript_source?.language || 'en',
          duration: exportData.duration_s || null,
          segments,
          speaker_count: exportData.num_speakers || new Set(segments.map(s => s.speaker)).size,
        };
      }
    }

    // Direct response fallback
    const data = initialData;
    const segments: DiarizationSegment[] = (
      data.segments ||
      data.speaker_segments ||
      data.diarization ||
      []
    ).map((seg: any, idx: number) => ({
      start_time: seg.start_time ?? seg.start ?? seg.startTime ?? 0,
      end_time: seg.end_time ?? seg.end ?? seg.endTime ?? 0,
      speaker: seg.speaker ?? seg.speaker_label ?? seg.normalized_speaker ?? `Speaker ${idx + 1}`,
      text: seg.text ?? seg.transcript ?? '',
      confidence: seg.confidence ?? seg.score ?? null,
    }));

    return {
      full_text: data.full_text ?? data.transcript ?? data.text ?? segments.map(s => s.text).join(' '),
      language: data.language ?? data.detected_language ?? 'en',
      duration: data.duration ?? null,
      segments,
      speaker_count: data.speaker_count ?? new Set(segments.map(s => s.speaker)).size,
    };
  },

  /**
   * Convert DiarizationResult segments into TranscriptSegment[] format
   * used by TranscriptView component.
   */
  toTranscriptSegments: (result: DiarizationResult): TranscriptSegment[] => {
    return result.segments.map((seg, idx) => ({
      id: `seg_${idx}`,
      speaker_name: seg.speaker,
      start_time: seg.start_time,
      end_time: seg.end_time,
      text: seg.text,
      confidence: seg.confidence ?? 0,
    }));
  },

  /** Legacy fallback using internal backend route */
  transcribeAudioFile: async (file: File) => {
    const formData = new FormData();
    formData.append('file', file);
    const res = await apiClient.post('/speech-intelligence/transcribe', formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    });
    return res.data;
  },
};
