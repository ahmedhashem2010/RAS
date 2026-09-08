"use server";

import { createClient } from "@/lib/supabase/server";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { requireSuperAdmin } from "@/lib/auth";
import { logAudit } from "@/lib/actions/audit";

const COOKIE_NAME = "ras_impersonate";
const COOKIE_MAX_AGE = 60 * 60; // 1 hour

export type ImpersonationPayload = {
  leaderId: string; // profile id (auth account) of the impersonated committee leader
  leaderName: string;
  committeeId: string;
  committeeName: string;
};

export type ImpersonationResult = {
  ok: boolean;
  error?: string;
  warning?: string;
};

// Impersonation must fail CLOSED: the audit record must land before the
// session is allowed to start, so a privileged acting-as-user action always
// leaves a trail. This helper propagates any failure.
async function logAuditStrict(
  action: string,
  targetType: string,
  targetId: string,
  metadata: Record<string, unknown>,
) {
  await logAudit(action, targetType, targetId, metadata);
}

export async function startImpersonation(
  profileId: string,
  committeeId: string,
): Promise<ImpersonationResult> {
  await requireSuperAdmin();
  const supabase = await createClient();

  // Resolve the target profile's roster volunteer row(s).
  const { data: volunteers, error: volErr } = await supabase
    .from("volunteers")
    .select("id, full_name, profile_id")
    .eq("profile_id", profileId);
  if (volErr) {
    return { ok: false, error: "تعذر التحقق من بيانات المستخدم." };
  }
  const volunteerIds = (volunteers ?? []).map((v) => v.id);
  if (volunteerIds.length === 0) {
    return { ok: false, error: "هذا المستخدم ليس قائدًا لهذه اللجنة." };
  }

  // Verify one of those roster rows actually leads the committee.
  const { data: leadRows, error: leadErr } = await supabase
    .from("committee_leaders")
    .select("leader_id")
    .eq("committee_id", committeeId)
    .in("leader_id", volunteerIds);
  if (leadErr || !leadRows || leadRows.length === 0) {
    return { ok: false, error: "هذا المستخدم ليس قائدًا لهذه اللجنة." };
  }

  // Resolve the leader's display name and the committee name.
  const matchingVolunteer = (volunteers ?? []).find(
    (v) => v.id === leadRows[0].leader_id,
  );
  const { data: dept } = await supabase
    .from("departments")
    .select("name")
    .eq("id", committeeId)
    .maybeSingle();

  const leaderName = matchingVolunteer?.full_name ?? "قائد اللجنة";
  const committeeName = dept?.name ?? "اللجنة";

  const payload: ImpersonationPayload = {
    leaderId: profileId,
    leaderName,
    committeeId,
    committeeName,
  };

  // FAIL CLOSED: audit must succeed before the impersonation session starts.
  try {
    await logAuditStrict("leader_impersonation_started", "committee", committeeId, {
      impersonated_leader: profileId,
      impersonated_leader_name: leaderName,
      committee_name: committeeName,
    });
  } catch {
    return {
      ok: false,
      error: "تعذر تسجيل بدء التمثيل في سجل العمليات. لم يبدأ التمثيل.",
    };
  }

  const cookieStore = await cookies();
  cookieStore.set(COOKIE_NAME, JSON.stringify(payload), {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: COOKIE_MAX_AGE,
  });

  redirect("/dashboard");
}

export async function stopImpersonation(): Promise<ImpersonationResult> {
  await requireSuperAdmin();

  const cookieStore = await cookies();
  const raw = cookieStore.get(COOKIE_NAME)?.value;
  let warning: string | undefined;

  if (raw) {
    try {
      const payload: ImpersonationPayload = JSON.parse(raw);
      try {
        await logAuditStrict("leader_impersonation_ended", "committee", payload.committeeId, {
          impersonated_leader: payload.leaderId,
          impersonated_leader_name: payload.leaderName,
          committee_name: payload.committeeName,
        });
      } catch {
        warning = "انتهى التمثيل، لكن تعذر تسجيل نهايته في سجل العمليات.";
      }
    } catch {
      // malformed cookie — nothing sensible to audit
    }
  }

  cookieStore.delete(COOKIE_NAME);

  return { ok: true, warning };
}

export async function getImpersonation(): Promise<ImpersonationPayload | null> {
  const cookieStore = await cookies();
  const raw = cookieStore.get(COOKIE_NAME)?.value;
  if (!raw) return null;
  try {
    return JSON.parse(raw) as ImpersonationPayload;
  } catch {
    return null;
  }
}