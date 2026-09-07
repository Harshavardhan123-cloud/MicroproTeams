export type RecordingType = 'AUDIO_ONLY' | 'VIDEO' | 'SCREEN' | 'FULL_MEETING';
export type RecordingStatus = 'STARTING' | 'RECORDING' | 'PROCESSING' | 'READY' | 'FAILED' | 'DELETED';
export type ActionItemStatus = 'OPEN' | 'IN_PROGRESS' | 'COMPLETED' | 'CANCELLED';
export type RetentionResourceType = 'MESSAGES' | 'FILES' | 'MEETINGS' | 'RECORDINGS' | 'TRANSCRIPTS';

export interface Recording {
  id: string;
  meeting_id: string;
  organization_id?: string;
  started_by?: string;
  recording_type?: RecordingType | string;
  status: RecordingStatus | string;
  storage_key?: string;
  mime_type?: string;
  duration?: number;
  size?: number;
  size_bytes?: number;
  started_at?: string;
  ended_at?: string;
  created_at?: string;
  playback_url?: string;
}

export interface TranscriptSegment {
  id: string;
  speaker_id?: string;
  speaker_name: string;
  start_time: number; // Seconds
  end_time: number;
  text: string;
  confidence: number;
  word_timestamps?: string;
}

export interface Transcript {
  id: string;
  meeting_id: string;
  recording_id?: string;
  language: string;
  status: string;
  full_text: string;
  segments: TranscriptSegment[];
}

export interface MeetingSummary {
  id: string;
  meeting_id: string;
  summary: string;
  key_points: string[];
  decisions: string[];
  action_items: any[];
  questions: string[];
  topics: string[];
  risks: string[];
  model: string;
  created_at: string;
}

export interface ActionItem {
  id: string;
  meeting_id: string;
  description: string;
  assignee_id?: string;
  due_date?: string;
  priority: string;
  status: ActionItemStatus;
  created_at: string;
}

export interface AuditLogItem {
  id: string;
  organization_id: string;
  actor_id?: string;
  action: string;
  resource_type: string;
  resource_id?: string;
  ip_address?: string;
  user_agent?: string;
  details?: string;
  created_at: string;
}

export interface OrganizationPolicy {
  id: string;
  allow_external_users: boolean;
  allow_guest_access: boolean;
  allow_file_sharing: boolean;
  allow_external_file_links: boolean;
  allow_recording: boolean;
  allow_transcription: boolean;
  allow_ai_features: boolean;
  max_file_size: number;
  max_meeting_participants: number;
  retention_days: number;
  max_ai_minutes_per_month: number;
}
