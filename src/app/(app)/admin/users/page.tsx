import { requireSuperAdmin } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Avatar } from "@/components/ui/avatar";
import { PageHeader } from "@/components/ui/page-header";
import { UsersPanel, RoleSelect } from "@/components/admin/users-panel";
import { ImpersonateButton } from "@/components/admin/impersonate-button";
import { roleLabels, accountStatusLabels } from "@/lib/i18n";
import { formatDate } from "@/lib/utils";

export default async function AdminUsersPage() {
  const user = await requireSuperAdmin();
  const supabase = await createClient();

  const [{ data: profiles }, { data: memberships }, { data: leaders }] = await Promise.all([
    supabase.from("profiles").select("id, full_name, avatar_url, email, role, status, join_date, created_at").order("full_name"),
    supabase
      .from("committee_members")
      .select("committee_id, departments(name), volunteers(profile_id)"),
    supabase
      .from("committee_leaders")
      .select("committee_id, leader_id, departments(name), volunteers(profile_id, full_name)"),
  ]);

  // profileId -> committee names the user belongs to (through the roster)
  const committeesByUser = new Map<string, string[]>();
  for (const m of memberships ?? []) {
    const profileId = (m.volunteers as unknown as { profile_id: string | null } | null)?.profile_id;
    const name = (m.departments as unknown as { name: string } | null)?.name;
    if (!profileId || !name) continue;
    const arr = committeesByUser.get(profileId) ?? [];
    arr.push(name);
    committeesByUser.set(profileId, arr);
  }

  // profileId -> committees the user leads
  const ledCommitteesByUser = new Map<string, { committeeId: string; name: string }[]>();
  for (const l of leaders ?? []) {
    const volunteer = l.volunteers as unknown as { profile_id: string | null; full_name: string } | null;
    const committee = l.departments as unknown as { name: string } | null;
    if (!volunteer?.profile_id || !committee) continue;
    const arr = ledCommitteesByUser.get(volunteer.profile_id) ?? [];
    arr.push({ committeeId: l.committee_id, name: committee.name });
    ledCommitteesByUser.set(volunteer.profile_id, arr);
  }

  const roleTone: Record<string, "gold" | "teal" | "blue"> = {
    super_admin: "gold",
    general_admin: "teal",
    volunteer: "blue",
  };

  return (
    <div>
      <PageHeader
        title="المستخدمون والإدارة"
        description={`${(profiles ?? []).length} مستخدم مسجل`}
        action={<UsersPanel />}
      />

      <Card>
        <CardContent className="p-0">
          <div className="divide-y divide-slate-50">
            {(profiles ?? []).map((p) => {
              const isSelf = p.id === user.id;
              return (
                <div key={p.id} className="flex items-center gap-3 px-4 py-3.5 sm:px-5">
                  <Avatar name={p.full_name} src={p.avatar_url} size="md" />
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-sm font-bold text-slate-800">{p.full_name}</span>
                      {isSelf && <Badge tone="amber">أنت</Badge>}
                      <Badge tone={roleTone[p.role]}>{roleLabels[p.role]}</Badge>
                      <Badge tone={p.status === "active" ? "green" : "red"}>{accountStatusLabels[p.status]}</Badge>
                    </div>
                    <p className="mt-0.5 truncate text-xs text-slate-400" dir="ltr">
                      {p.email}
                    </p>
                    <div className="mt-1 flex flex-wrap items-center gap-2 text-[11px] text-slate-400">
                      {committeesByUser.get(p.id)?.length ? (
                        committeesByUser.get(p.id)!.map((c) => (
                          <span key={c} className="rounded-full bg-slate-100 px-2 py-0.5">{c}</span>
                        ))
                      ) : (
                        <span>بدون لجنة</span>
                      )}
                      <span>· سجل {formatDate(p.created_at)}</span>
                    </div>
                  </div>
                  <div className="flex shrink-0 flex-col items-end gap-1.5">
                    {!isSelf &&
                      ledCommitteesByUser.get(p.id)?.map((c) => (
                        <ImpersonateButton
                          key={c.committeeId}
                          profileId={p.id}
                          committeeId={c.committeeId}
                          committeeName={c.name}
                        />
                      ))}
                    <RoleSelect
                      userId={p.id}
                      currentRole={p.role}
                      disabled={isSelf}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}