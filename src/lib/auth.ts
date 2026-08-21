import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import type { Profile, SessionUser, Team } from "@/lib/types";

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

  return {
    id: profile.id,
    email: user.email ?? profile.email ?? "",
    isAdmin: profile.role === "general_admin" || profile.role === "super_admin",
    isSuperAdmin: profile.role === "super_admin",
    isTeamLeader: ledTeamIds.length > 0,
    role: profile.role,
    ledTeamIds,
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
