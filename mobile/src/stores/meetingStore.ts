import { apiClient } from '../api/client';

export interface MeetingItem {
  id: string;
  title: string;
  meeting_code: string;
  status: string;
  host_id?: string;
  participant_count?: number;
  created_at?: string;
  // Additional fields the backend's `format_meeting()` already returns and the
  // in-call/lobby surfaces need. All optional so existing callers are unaffected.
  description?: string;
  meeting_type?: string;
  created_by?: string;
  organization_id?: string;
  join_policy?: string;
  lobby_enabled?: boolean;
  is_scheduled?: boolean;
  scheduled_start?: string | null;
  scheduled_end?: string | null;
  actual_start?: string | null;
  actual_end?: string | null;
  meeting_link?: string;
}

export interface MeetingParticipantItem {
  id: string;
  user_id: string;
  role?: string;
  status?: string;
  is_host?: boolean;
  is_muted?: boolean;
  camera_enabled?: boolean;
  screen_sharing?: boolean;
  raised_hand?: boolean;
  joined_at?: string | null;
}

export interface MeetingPolicyItem {
  allow_guests?: boolean;
  allow_lobby?: boolean;
  allow_screen_share?: boolean;
  allow_chat?: boolean;
  allow_reactions?: boolean;
  max_participants?: number;
}

/** Snapshot returned by `GET /meetings/{id}/state`, the reconnection resync. */
export interface MeetingStateSnapshot {
  meeting: MeetingItem;
  participants: MeetingParticipantItem[];
  policy: MeetingPolicyItem;
  /** Advertised by the backend but hardcoded to 'ws://localhost:3010' — it is NOT
   *  usable from a phone. The SFU address comes from the client config instead. */
  sfu_endpoint?: string;
}

/**
 * The API serialises `status` lowercased (`meeting_service.format_meeting` calls
 * `.lower()`), while the enum and every comparison written against it use
 * SCREAMING_CASE. Normalise through this rather than comparing raw, or a
 * lowercase 'in_progress' silently fails every `=== 'IN_PROGRESS'` test.
 */
export const meetingStatusOf = (meeting?: MeetingItem | null): string =>
  String(meeting?.status || '').toUpperCase();

export const isMeetingInProgress = (meeting?: MeetingItem | null): boolean =>
  meetingStatusOf(meeting) === 'IN_PROGRESS';

export const isMeetingEnded = (meeting?: MeetingItem | null): boolean =>
  meetingStatusOf(meeting) === 'ENDED';

interface MeetingState {
  meetings: MeetingItem[];
  isLoading: boolean;
  isCreating: boolean;
  activeMeeting: MeetingItem | null;
  error: string | null;
}

type Listener = () => void;

/** Unwraps the backend's `{success, error:{code, message}}` envelope. */
const apiErrorMessage = (err: any, fallback: string): string =>
  err?.response?.data?.error?.message || err?.message || fallback;

class MeetingStore {
  private state: MeetingState = {
    meetings: [],
    isLoading: false,
    isCreating: false,
    activeMeeting: null,
    error: null,
  };

  private listeners: Set<Listener> = new Set();

  getState(): MeetingState {
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

  async fetchMeetings() {
    this.state.isLoading = true;
    this.state.error = null;
    this.notify();

    try {
      const res = await apiClient.get('/meetings');
      const data = Array.isArray(res.data) ? res.data : res.data.data || [];
      this.state.meetings = data;
      this.state.isLoading = false;
      this.notify();
    } catch (err: any) {
      console.warn('Fetch meetings error:', err);
      this.state.isLoading = false;
      this.notify();
    }
  }

  async createInstantMeeting(title?: string): Promise<MeetingItem | null> {
    this.state.isCreating = true;
    this.state.error = null;
    this.notify();

    try {
      const res = await apiClient.post('/meetings', {
        title: title || 'Instant Video Call',
        meeting_type: 'INSTANT',
      });
      const data: MeetingItem = res.data.data || res.data;
      this.state.activeMeeting = data;
      this.state.isCreating = false;
      this.fetchMeetings();
      this.notify();
      return data;
    } catch (err: any) {
      console.error('Create instant meeting error:', err);
      this.state.error = err.message || 'Failed to start meeting';
      this.state.isCreating = false;
      this.notify();
      return null;
    }
  }

  async getMeetingByCode(code: string): Promise<MeetingItem | null> {
    try {
      const cleanCode = code.trim().replace(/^.*\/meet\//, '');
      const res = await apiClient.get(`/meetings/code/${cleanCode}`);
      return res.data.data || res.data;
    } catch (err) {
      console.warn('Get meeting by code error:', err);
      return null;
    }
  }

  // ───────────────────────────────────────────────────────────────────────────
  // Meeting-room endpoints
  //
  // Deliberately free of any WebSocket involvement: meeting CRUD is orthogonal to
  // media, which lives entirely in meetingWebRTCManager.
  // ───────────────────────────────────────────────────────────────────────────

  /**
   * `GET /meetings/{id}` — used for the lobby card and for the waiting-for-host
   * poll. Intentionally does NOT write `activeMeeting`: at a 4 s poll interval
   * that would notify every subscriber 15 times a minute. Callers that want the
   * result retained call `setActiveMeeting()` explicitly.
   */
  async getMeeting(id: string): Promise<MeetingItem | null> {
    if (!id) return null;
    try {
      const res = await apiClient.get(`/meetings/${id}`);
      const data: MeetingItem = res.data.data || res.data;
      return data && data.id ? data : null;
    } catch (err: any) {
      console.warn('Get meeting error:', err);
      return null;
    }
  }

  /**
   * `POST /meetings/{id}/join` — registers a MeetingParticipant row and, for the
   * host, moves a SCHEDULED meeting to IN_PROGRESS. It does not touch media.
   * Returns false and sets `state.error` on failure (ended meeting, wrong org).
   */
  async joinMeeting(id: string): Promise<boolean> {
    if (!id) return false;
    try {
      await apiClient.post(`/meetings/${id}/join`);
      this.state.error = null;
      this.notify();
      return true;
    } catch (err: any) {
      console.error('Join meeting error:', err);
      this.state.error = apiErrorMessage(err, 'Failed to join meeting');
      this.notify();
      return false;
    }
  }

  /** `POST /meetings/{id}/leave` — releases the participant row. Best effort. */
  async leaveMeeting(id: string): Promise<boolean> {
    if (!id) return false;
    try {
      await apiClient.post(`/meetings/${id}/leave`);
      return true;
    } catch (err: any) {
      console.warn('Leave meeting error:', err);
      return false;
    }
  }

  /**
   * `POST /meetings/{id}/end` — the host's "End meeting for everyone". The
   * backend returns 403 for a non-host, which surfaces here as `state.error`.
   */
  async endMeeting(id: string): Promise<boolean> {
    if (!id) return false;
    try {
      await apiClient.post(`/meetings/${id}/end`);
      this.state.error = null;
      if (this.state.activeMeeting?.id === id) {
        this.state.activeMeeting = null;
      }
      this.notify();
      return true;
    } catch (err: any) {
      console.error('End meeting error:', err);
      this.state.error = apiErrorMessage(err, 'Failed to end meeting');
      this.notify();
      return false;
    }
  }

  /** `GET /meetings/{id}/participants` — the roster, including raised_hand and
   *  per-participant mute flags. Returns [] rather than throwing. */
  async getMeetingParticipants(id: string): Promise<MeetingParticipantItem[]> {
    if (!id) return [];
    try {
      const res = await apiClient.get(`/meetings/${id}/participants`);
      const data = res.data.data || res.data;
      return Array.isArray(data) ? data : [];
    } catch (err: any) {
      console.warn('Get meeting participants error:', err);
      return [];
    }
  }

  /** `GET /meetings/{id}/policy` — 404s when no policy row exists, which is a
   *  normal outcome for an instant meeting, so a null result is not an error. */
  async getMeetingPolicy(id: string): Promise<MeetingPolicyItem | null> {
    if (!id) return null;
    try {
      const res = await apiClient.get(`/meetings/${id}/policy`);
      return res.data.data || res.data || null;
    } catch (err: any) {
      console.warn('Get meeting policy error:', err);
      return null;
    }
  }

  /**
   * `GET /meetings/{id}/state` — one round trip for meeting + participants +
   * policy, meant for resync after a network change or a background/foreground
   * cycle. Accepts a meeting id or a meeting code (the backend falls back to a
   * code lookup).
   */
  async getMeetingStateSnapshot(id: string): Promise<MeetingStateSnapshot | null> {
    if (!id) return null;
    try {
      const res = await apiClient.get(`/meetings/${id}/state`);
      const data = res.data.data || res.data;
      return data && data.meeting ? data : null;
    } catch (err: any) {
      console.warn('Get meeting state error:', err);
      return null;
    }
  }

  setActiveMeeting(meeting: MeetingItem | null) {
    this.state.activeMeeting = meeting;
    this.notify();
  }

  /** `activeMeeting` was previously set by createInstantMeeting and never
   *  cleared, so a stale meeting outlived every session. */
  clearActiveMeeting() {
    if (!this.state.activeMeeting) return;
    this.state.activeMeeting = null;
    this.notify();
  }

  clearError() {
    if (this.state.error === null) return;
    this.state.error = null;
    this.notify();
  }
}

export const meetingStore = new MeetingStore();
