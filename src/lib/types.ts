// Shared domain types matching the Supabase schema.

export type UserRole = "volunteer" | "general_admin" | "super_admin";
export type AccountStatus = "active" | "banned";
export type ConvoyType = "normal" | "mini_camp" | "full_camp";
export type ConvoyStatus = "upcoming" | "active" | "completed" | "cancelled";
export type AttendanceStatus = "present" | "excused" | "absent";
export type TaskStatus = "pending" | "in_progress" | "submitted" | "approved" | "rejected";
export type AwardType = "volunteer_of_day" | "best_leader";

export interface Profile {
  id: string;
  full_name: string;
  avatar_url: string | null;
  phone: string | null;
  email: string | null;
  age: number | null;
  join_date: string | null;
  role: UserRole;
  status: AccountStatus;
  must_change_password?: boolean;
  created_at: string;
}

export interface Convoy {
  id: string;
  name: string;
  type: ConvoyType;
  start_date: string;
  end_date: string;
  location: string | null;
  description: string | null;
  instructions: string | null;
  status: ConvoyStatus;
  created_by: string;
  created_at: string;
}

export interface ConvoyAttendance {
  id: string;
  convoy_id: string;
  volunteer_id: string;
  committee_id: string | null;
  status: AttendanceStatus;
  marked_by: string;
  created_at: string;
}

export interface ConvoyEvaluation {
  id: string;
  convoy_id: string;
  volunteer_id: string;
  committee_id: string | null;
  leader_id: string;
  rating: number;
  comment: string | null;
  created_at: string;
}

// A committee leader the super admin marked as attending a convoy.
export interface ConvoyLeaderRow {
  convoy_id: string;
  leader_id: string;
  marked_by: string;
  created_at: string;
}

export interface Task {
  id: string;
  title: string;
  description: string | null;
  deadline: string | null;
  created_by: string;
  created_at: string;
}

export interface TaskAssignment {
  id: string;
  task_id: string;
  volunteer_id: string;
  status: TaskStatus;
  proof_url: string | null;
  submitted_at: string | null;
  reviewed_by: string | null;
  reviewed_at: string | null;
  rating: number | null;
  review_comment: string | null;
  created_at: string;
}

export interface Award {
  id: string;
  type: AwardType;
  recipient_id: string;
  convoy_id: string | null;
  event_name: string | null;
  award_date: string;
  given_by: string;
  reason: string | null;
  created_at: string;
}

export interface Warning {
  id: string;
  volunteer_id: string;
  number: number;
  warning_date: string;
  issued_by: string;
  reason: string;
  convoy_id: string | null;
  task_id: string | null;
  created_at: string;
}

export interface Notification {
  id: string;
  user_id: string;
  type: string;
  title: string;
  body: string | null;
  data: Record<string, unknown> | null;
  read: boolean;
  created_at: string;
}

export interface AuditLog {
  id: number;
  actor_id: string | null;
  action: string;
  target_type: string | null;
  target_id: string | null;
  metadata: Record<string, unknown> | null;
  created_at: string;
}

export interface VolunteerScore {
  volunteer_id: string;
  attendance_opportunities: number;
  present_count: number;
  excused_count: number;
  absent_count: number;
  attendance_points: number;
  approved_tasks: number;
  evaluations: number;
  attendance_percent: number;
  attendance_score: number;
  task_percent: number;
  task_score: number;
  convoy_percent: number;
  convoy_score: number;
  seniority_score: number;
  overall_score: number;
  status: AccountStatus;
  join_date: string | null;
  created_at: string;
}

export interface SessionUser {
  id: string;
  email: string;
  isAdmin: boolean;
  isSuperAdmin: boolean;
  isCommitteeLeader: boolean;
  role: UserRole;
  ledCommitteeIds: string[];
  impersonating?: {
    leaderId: string;
    leaderName: string;
    committeeId: string;
    committeeName: string;
  };
}

// --- Volunteers Management System ---

export type VolunteerStatus = "active" | "inactive";

export interface Department {
  id: string;
  name: string;
  name_en: string;
  description: string | null;
  sort_order: number;
  created_at: string;
  updated_at: string;
}

export interface VolunteerCommitteeRef {
  id: string;
  name: string;
  name_en: string;
}

export interface VolunteerLeadershipRef {
  committee_id: string;
  is_deputy: boolean;
}

export interface RosterVolunteer {
  id: string;
  profile_id: string | null;
  full_name: string;
  search_name: string;
  phone: string | null;
  notes: string | null;
  rating: number | null;
  description: string | null;
  status: VolunteerStatus;
  created_at: string;
  updated_at: string;
  committees: VolunteerCommitteeRef[];
  leadership: VolunteerLeadershipRef[];
}

export interface CommitteeLeaderRow {
  committee_id: string;
  leader_id: string;
  is_deputy: boolean;
  created_at: string;
}

// Committee with its leadership (names resolved) and member count.
export interface CommitteeWithLeaders extends Department {
  leaders: Array<{
    volunteerId: string;
    fullName: string;
    profileId: string | null;
    isDeputy: boolean;
  }>;
  memberCount: number;
}
