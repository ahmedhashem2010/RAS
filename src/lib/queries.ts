import { createClient } from "@/lib/supabase/server";
import type { Team, VolunteerScore } from "@/lib/types";

export interface LeaderboardEntry {
  team_id: string;
  volunteer_id: string;
  full_name: string;
  avatar_url: string | null;
  status: string;
  overall_score: number | null;
  attendance_percent: number | null;
  task_percent: number | null;
  convoy_percent: number | null;
  seniority_score: number | null;
  attendance_opportunities: number | null;
  attendance_points: number | null;
  approved_tasks: number | null;
  evaluations: number | null;
  joined_at: string | null;
}

export async function getTeamLeaderboard(teamId: string): Promise<LeaderboardEntry[]> {
  const supabase = await createClient();
  const { data } = await supabase.rpc("get_team_leaderboard", { p_team_id: teamId });
  return (data ?? []) as LeaderboardEntry[];
}

export async function getMyTeamIds(userId: string): Promise<string[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("team_members")
    .select("team_id")
    .eq("volunteer_id", userId);
  return (data ?? []).map((r) => r.team_id);
}

export async function getMyTeams(userId: string): Promise<(Team & { joined_at: string })[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("team_members")
    .select("team_id, joined_at, teams(*)")
    .eq("volunteer_id", userId);
  return (data ?? []).map((r) => ({ ...(r.teams as unknown as Team), joined_at: r.joined_at }));
}

export async function getScore(volunteerId: string): Promise<VolunteerScore | null> {
  const supabase = await createClient();
  const { data } = await supabase.rpc("get_score", { p_volunteer_id: volunteerId }).maybeSingle();
  return (data as VolunteerScore) ?? null;
}

/** Rank of a volunteer within a team's leaderboard (1-based, active members). */
export function rankInBoard(
  board: LeaderboardEntry[],
  volunteerId: string,
): number | null {
  const ranked = [...board]
    .filter((e) => e.status === "active")
    .sort((a, b) => (b.overall_score ?? 0) - (a.overall_score ?? 0));
  const idx = ranked.findIndex((e) => e.volunteer_id === volunteerId);
  return idx === -1 ? null : idx + 1;
}
