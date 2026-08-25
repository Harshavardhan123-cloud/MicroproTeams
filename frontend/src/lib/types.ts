/**
 * Shared API types — mirrors the Pydantic response models in backend/schemas
 * and backend/api. Keep in sync when the backend contracts change.
 */

export type PresenceStatus = "online" | "away" | "dnd" | "offline" | "in_meeting" | "busy";

export type ChannelType = "public" | "private" | "dm" | "group_dm" | "announcement";

export interface User {
  id: string;
  email: string;
  display_name: string;
  username: string;
  avatar_url: string | null;
  role: string;
  presence_status: PresenceStatus;
  custom_status: string | null;
  custom_status_emoji: string | null;
  public_key: string | null;
  created_at: string;
}

export interface Workspace {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  logo_url: string | null;
  primary_color: string;
  created_at: string;
}

export interface Channel {
  id: string;
  workspace_id: string;
  team_id: string | null;
  name: string;
  description: string | null;
  type: ChannelType;
  topic: string | null;
  is_archived: boolean;
  message_count: number;
  created_by: string;
  created_at: string;
  member_ids?: string[];
}

export interface Message {
  id: string;
  channel_id: string;
  author_id: string;
  content: string;
  content_encrypted: string | null;
  is_encrypted: boolean;
  thread_id: string | null;
  reply_count: number;
  is_edited: boolean;
  is_deleted: boolean;
  is_pinned: boolean;
  created_at: string;
  edited_at: string | null;
}

export interface LoginResponse {
  access_token: string;
  refresh_token: string;
  token_type: string;
  user: User;
}

/** Payload broadcast over Socket.io for `message:new`. */
export interface MessageBroadcast {
  channel_id: string;
  message_id: string;
  content: string;
  author_id: string;
  created_at: string;
  thread_id?: string | null;
  is_encrypted?: boolean;
}

export interface TypingUpdate {
  channel_id: string;
  user_id: string;
  is_typing: boolean;
}

export interface PresenceChange {
  user_id: string;
  status: PresenceStatus;
}
