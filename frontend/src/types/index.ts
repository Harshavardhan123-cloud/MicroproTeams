export type PresenceStatus = 'available' | 'busy' | 'dnd' | 'away' | 'offline';

export interface User {
  id: string;
  organization_id: string;
  email: string;
  username: string;
  first_name: string;
  last_name: string;
  display_name: string;
  avatar_url?: string;
  job_title?: string;
  department?: string;
  organization_unit_id?: string | null;
  organization_unit_name?: string | null;
  timezone: string;
  presence: PresenceStatus;
  status_message?: string;
  is_active: boolean;
  is_superuser: boolean;
  role?: string;
  is_admin?: boolean;
}

export interface Channel {
  id: string;
  team_id: string;
  name: string;
  description?: string;
  type: 'standard' | 'private' | 'shared';
  created_by: string;
  created_at: string;
}

export interface Team {
  id: string;
  organization_id: string;
  name: string;
  description?: string;
  avatar_url?: string;
  owner_id: string;
  privacy: 'public' | 'private';
  created_at: string;
  channels: Channel[];
  member_count: number;
}

export interface MessageReaction {
  id: string;
  emoji: string;
  user_id: string;
  user_name: string;
}

export interface MessageSender {
  id: string;
  display_name: string;
  email: string;
  avatar_url?: string;
  presence?: PresenceStatus;
}

export interface Message {
  id: string;
  channel_id?: string;
  sender_id: string;
  sender_name?: string;
  sender_avatar?: string;
  sender?: MessageSender;
  parent_message_id?: string;
  message_type: 'text' | 'image' | 'video' | 'audio' | 'file' | 'system' | 'meeting';
  content: string;
  is_edited: boolean;
  is_pinned: boolean;
  reactions: MessageReaction[];
  reply_count?: number;
  replies_count?: number;
  created_at: string;
  updated_at?: string;
}

export interface AuthTokens {
  access_token: string;
  refresh_token: string;
  token_type: string;
}

export type UnitType = 'ORGANIZATION' | 'BUSINESS_UNIT' | 'DIVISION' | 'DEPARTMENT' | 'TEAM' | 'UNIT';

export interface ManagerSummary {
  id: string;
  display_name: string;
  email: string;
  avatar_url?: string;
  job_title?: string;
}

export interface UnitEmployeeSummary {
  id: string;
  display_name: string;
  email: string;
  avatar_url?: string;
  job_title?: string;
  department?: string;
  is_active: boolean;
}

export interface OrganizationUnit {
  id: string;
  organization_id: string;
  parent_id?: string | null;
  parent_name?: string | null;
  name: string;
  code?: string | null;
  unit_type: UnitType | string;
  description?: string | null;
  manager_id?: string | null;
  manager?: ManagerSummary | null;
  status: 'ACTIVE' | 'INACTIVE' | string;
  order_index: number;
  direct_employee_count: number;
  total_employee_count: number;
  children_count?: number;
  created_at: string;
  updated_at: string;
  employees?: UnitEmployeeSummary[];
}

export interface HierarchyNode {
  id: string;
  organization_id: string;
  parent_id?: string | null;
  name: string;
  code?: string | null;
  unit_type: UnitType | string;
  description?: string | null;
  manager_id?: string | null;
  manager?: ManagerSummary | null;
  status: 'ACTIVE' | 'INACTIVE' | string;
  order_index: number;
  direct_employee_count: number;
  total_employee_count: number;
  children: HierarchyNode[];
  employees?: UnitEmployeeSummary[];
}
