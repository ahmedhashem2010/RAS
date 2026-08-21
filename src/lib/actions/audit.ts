"use server";

import { createClient } from "@/lib/supabase/server";

export async function logAudit(
  action: string,
  targetType?: string | null,
  targetId?: string | null,
  metadata?: Record<string, unknown> | null,
) {
  const supabase = await createClient();
  await supabase.rpc("log_audit", {
    p_action: action,
    p_target_type: targetType ?? null,
    p_target_id: targetId ?? null,
    p_metadata: metadata ?? null,
  });
}
