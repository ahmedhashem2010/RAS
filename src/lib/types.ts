// Shared domain types matching the Supabase schema.

export type UserRole = "volunteer" | "general_admin" | "super_admin";
export type AccountStatus = "active" | "banned";
export type ConvoyType = "normal" | "mini_camp" | "full_camp";
export type ConvoyStatus = "upcoming" | "active" | "completed" | "cancelled";
export type AttendanceStatus = "present" | "excused" | "absent";
export type TaskStatus = "pending" | "in_progress" | "submitted" | "approved" | "rejected";
export type AwardType = "volunteer_of_day" | "best_leader";
export type TeamEvalMode = "attendance" | "media_work";

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
  created_at: string;
}

export interface Team {
  id: string;
  name: string;
  description: string | null;
  color: string;
  eval_mode: TeamEvalMode;
  created_at: string;
}

export interface TeamMemberRow {
  team_id: string;
  volunteer_id: string;
  joined_at: string;
  teams?: Team;
}

export interface TeamLeaderRow {
  team_id: string;
  leader_id: string;
  created_at: string;
  teams?: Team;
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
  team_id: string;
  status: AttendanceStatus;
  marked_by: string;
  created_at: string;
}

export interface ConvoyEvaluation {
  id: string;
  convoy_id: string;
  volunteer_id: string;
  team_id: string;
  leader_id: string;
  rating: number;
  comment: string | null;
  created_at: string;
}

export interface Task {
  id: string;
  title: string;
  description: string | null;
  team_id: string | null;
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
  isTeamLeader: boolean;
  role: UserRole;
  ledTeamIds: string[];
}
