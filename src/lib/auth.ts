import { createClient } from "@/lib/supabase/server";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import type { Profile, SessionUser, Team } from "@/lib/types";
import type { ImpersonationPayload } from "@/lib/actions/impersonate";

export interface AuthedUser extends SessionUser {
  profile: Profile;
  teams: Team[];
}

export async function getSessionUser(): Promise<AuthedUser | null> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return null;

  const [{ data: profile }, { data: teamRows }] = await Promise.all([
    supabase.from("profiles").select("*").eq("id", user.id).maybeSingle(),
    supabase
      .from("team_members")
      .select("team_id, teams(*)")
      .eq("volunteer_id", user.id),
  ]);

  if (!profile) return null;

  // Banned accounts are blocked at the session layer: every protected page and
  // every protected server action funnels through getSessionUser, so a banned
  // user is redirected to the suspension notice instead of reaching any data.
  if (profile.status === "banned") redirect("/account-banned");

  const { data: ledRows } = await supabase
    .from("team_leaders")
    .select("team_id")
    .eq("leader_id", user.id);

  const ledTeamIds = (ledRows ?? []).map((r) => r.team_id);

  const { data: ledCommitteeRows } = await supabase.rpc("led_committee_ids");
  const ledCommitteeIds = ((ledCommitteeRows ?? []) as unknown[]).map((id) => String(id));

  // Check for leader impersonation cookie (super_admin only). Impersonation
  // targets the LIVE committee leadership structure (committee_leaders).
  let impersonating: SessionUser["impersonating"] = undefined;
  if (profile.role === "super_admin") {
    const cookieStore = await cookies();
    const raw = cookieStore.get("ras_impersonate")?.value;
    if (raw) {
      try {
        const payload: ImpersonationPayload = JSON.parse(raw);
        impersonating = {
          leaderId: payload.leaderId,
          leaderName: payload.leaderName,
          committeeId: payload.committeeId,
          committeeName: payload.committeeName,
        };
      } catch {
        // invalid cookie, ignore
      }
    }
  }

  return {
    id: profile.id,
    email: user.email ?? profile.email ?? "",
    isAdmin: profile.role === "general_admin" || profile.role === "super_admin",
    isSuperAdmin: profile.role === "super_admin",
    isTeamLeader: ledTeamIds.length > 0,
    isCommitteeLeader: ledCommitteeIds.length > 0 || !!impersonating,
    role: profile.role,
    ledTeamIds,
    ledCommitteeIds: impersonating
      ? [...new Set([...ledCommitteeIds, impersonating.committeeId])]
      : ledCommitteeIds,
    impersonating,
    profile,
    teams: (teamRows ?? []).map((r) => r.teams as unknown as Team).filter(Boolean),
  };
}

export async function requireUser(): Promise<AuthedUser> {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  return user;
}

export async function requireAdmin(): Promise<AuthedUser> {
  const user = await requireUser();
  if (!user.isAdmin) redirect("/dashboard");
  return user;
}

export async function requireSuperAdmin(): Promise<AuthedUser> {
  const user = await requireUser();
  if (!user.isSuperAdmin) redirect("/dashboard");
  return user;
}

// Admins (super/general) and committee leaders/deputies can reach the
// volunteers committee management screens. Leaders only ever see their own
// committees' members through RLS.
export async function requireCommitteeManager(): Promise<AuthedUser> {
  const user = await requireUser();
  if (!user.isAdmin && !user.isCommitteeLeader) redirect("/dashboard");
  return user;
}
