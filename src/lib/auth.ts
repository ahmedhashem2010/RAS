import { createClient } from "@/lib/supabase/server";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { cache } from "react";
import type { Profile, SessionUser } from "@/lib/types";
import type { ImpersonationPayload } from "@/lib/actions/impersonate";

export interface AuthedUser extends SessionUser {
  profile: Profile;
}

export const getSessionUser = cache(async function getSessionUser(): Promise<AuthedUser | null> {
  const supabase = await createClient();

  // Middleware validates/refreshes the token once per request, so reading the
  // stored session locally (no Auth round-trip) is safe here. Only fall back
  // to getUser() when the access token is missing or near expiry.
  const {
    data: { session },
  } = await supabase.auth.getSession();

  if (!session) return null;

  const stale =
    !session.expires_at ||
    session.expires_at - 30 < Math.floor(Date.now() / 1000);
  let user: import("@supabase/supabase-js").User | null = session.user ?? null;
  if (stale) {
    const { data: fresh } = await supabase.auth.getUser();
    user = fresh.user;
  }
  if (!user) return null;

  let profile: Profile | null = null;
  let ledCommitteeIds: string[] = [];

  // Prefer the single get_my_context() round-trip; fall back to the two
  // individual queries until migration 0019 is applied.
  const ctxRes = await supabase.rpc("get_my_context").maybeSingle();
  if (!ctxRes.error && ctxRes.data) {
    const ctx = ctxRes.data as { profile: Profile; led_committee_ids: unknown[] };
    profile = ctx.profile;
    ledCommitteeIds = ctx.led_committee_ids.map((id) => String(id));
  } else {
    const [profileRes, ledgerRes] = await Promise.all([
      supabase.from("profiles").select("*").eq("id", user.id).maybeSingle(),
      supabase.rpc("led_committee_ids"),
    ]);
    profile = (profileRes.data as Profile | null) ?? null;
    ledCommitteeIds = ((ledgerRes.data ?? []) as unknown[]).map((id) => String(id));
  }

  if (!profile) return null;

  // Banned accounts are blocked at the session layer: every protected page and
  // every protected server action funnels through getSessionUser, so a banned
  // user is redirected to the suspension notice instead of reaching any data.
  if (profile.status === "banned") redirect("/account-banned");

  // Leaders bootstrapped with a temporary password must set a personal one
  // before using the system. The (app) layout redirects any other page here;
  // /update-password and /logout live outside that layout.
  if (profile.must_change_password) redirect("/update-password?required=1");

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
    isCommitteeLeader: ledCommitteeIds.length > 0 || !!impersonating,
    role: profile.role,
    ledCommitteeIds: impersonating
      ? [...new Set([...ledCommitteeIds, impersonating.committeeId])]
      : ledCommitteeIds,
    impersonating,
    profile,
  };
});

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
