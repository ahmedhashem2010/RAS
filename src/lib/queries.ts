import { createClient } from "@/lib/supabase/server";
import { cache } from "react";
import type { VolunteerScore, Department, RosterVolunteer, CommitteeWithLeaders } from "@/lib/types";

export interface LeaderboardEntry {
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

// Global ranking of every active profile, visible to all logged-in users.
export const getGlobalLeaderboard = cache(async function getGlobalLeaderboard(): Promise<LeaderboardEntry[]> {
  const supabase = await createClient();
  const { data } = await supabase.rpc("get_global_leaderboard");
  return (data ?? []) as LeaderboardEntry[];
});

export const getScore = cache(async function getScore(volunteerId: string): Promise<VolunteerScore | null> {
  const supabase = await createClient();
  const { data } = await supabase.rpc("get_score", { p_volunteer_id: volunteerId }).maybeSingle();
  return (data as VolunteerScore) ?? null;
});

/** Rank of a volunteer within the global leaderboard (1-based, active members). */
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

// ---------------------------------------------------------------
// Volunteers Management System — shared server reads.
// All reads flow through RLS (volunteer_details is security_invoker),
// so a committee leader only ever sees their own committees' members.
// ---------------------------------------------------------------

export const getDepartments = cache(async function getDepartments(): Promise<Department[]> {
  const supabase = await createClient();
  const { data } = await supabase.from("departments").select("*").order("sort_order");
  return (data ?? []) as Department[];
});

export const getVolunteerDetails = cache(async function getVolunteerDetails(): Promise<RosterVolunteer[]> {
  const supabase = await createClient();
  const { data } = await supabase.from("volunteer_details").select("*").order("full_name");
  return (data ?? []) as RosterVolunteer[];
});

export const getVolunteerById = cache(async function getVolunteerById(id: string): Promise<RosterVolunteer | null> {
  const supabase = await createClient();
  const { data } = await supabase.from("volunteer_details").select("*").eq("id", id).maybeSingle();
  return (data as RosterVolunteer | null) ?? null;
});

function memberMap(volunteers: RosterVolunteer[]) {
  return new Map(volunteers.map((v) => [v.id, v]));
}

export const getDepartmentBySlug = cache(async function getDepartmentBySlug(slug: string): Promise<Department | null> {
  const supabase = await createClient();
  const { data } = await supabase.from("departments").select("*").eq("name_en", slug).maybeSingle();
  return (data as Department | null) ?? null;
});

export const getCommitteeWithLeaders = cache(async function getCommitteeWithLeaders(
  dept: Department,
): Promise<CommitteeWithLeaders> {
  const supabase = await createClient();
  const [leaderRes, volunteerRes] = await Promise.all([
    supabase
      .from("committee_leaders")
      .select("committee_id, leader_id, is_deputy, created_at")
      .eq("committee_id", dept.id),
    supabase.from("volunteer_details").select("*"),
  ]);

  const volunteers = (volunteerRes.data ?? []) as RosterVolunteer[];
  const map = memberMap(volunteers);
  const members = volunteers.filter((v) => v.committees.some((c) => c.id === dept.id));

  const leaders = ((leaderRes.data ?? []) as Array<{
    leader_id: string;
    is_deputy: boolean;
    created_at: string;
  }>)
    .map((l) => ({
      volunteerId: l.leader_id,
      fullName: map.get(l.leader_id)?.full_name ?? "",
      profileId: map.get(l.leader_id)?.profile_id ?? null,
      isDeputy: l.is_deputy,
    }))
    .sort((a, b) => Number(a.isDeputy) - Number(b.isDeputy));

  return {
    ...dept,
    leaders,
    memberCount: members.length,
  };
});

export const getAllCommitteesWithLeaders = cache(async function getAllCommitteesWithLeaders(): Promise<CommitteeWithLeaders[]> {
  const [departments, leaders, volunteers] = await Promise.all([
    getDepartments(),
    (async () => {
      const supabase = await createClient();
      const { data } = await supabase.from("committee_leaders").select("committee_id, leader_id, is_deputy");
      return (data ?? []) as Array<{ committee_id: string; leader_id: string; is_deputy: boolean }>;
    })(),
    getVolunteerDetails(),
  ]);

  const map = memberMap(volunteers);
  const byCommittee = new Map<string, Array<{ volunteerId: string; fullName: string; profileId: string | null; isDeputy: boolean }>>();
  for (const l of leaders) {
    const arr = byCommittee.get(l.committee_id) ?? [];
    arr.push({
      volunteerId: l.leader_id,
      fullName: map.get(l.leader_id)?.full_name ?? "",
      profileId: map.get(l.leader_id)?.profile_id ?? null,
      isDeputy: l.is_deputy,
    });
    byCommittee.set(l.committee_id, arr);
  }

  return departments.map((d) => {
    const members = volunteers.filter((v) => v.committees.some((c) => c.id === d.id));
    return {
      ...d,
      leaders: (byCommittee.get(d.id) ?? []).sort((a, b) => Number(a.isDeputy) - Number(b.isDeputy)),
      memberCount: members.length,
    };
  });
});
