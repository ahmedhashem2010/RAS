import { requireSuperAdmin } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Avatar } from "@/components/ui/avatar";
import { PageHeader } from "@/components/ui/page-header";
import { UsersPanel, RoleSelect } from "@/components/admin/users-panel";
import { roleLabels, accountStatusLabels } from "@/lib/i18n";
import { formatDate } from "@/lib/utils";

export default async function AdminUsersPage() {
  const user = await requireSuperAdmin();
  const supabase = await createClient();

  const [{ data: profiles }, { data: memberships }] = await Promise.all([
    supabase.from("profiles").select("id, full_name, avatar_url, email, role, status, join_date, created_at").order("full_name"),
    supabase.from("team_members").select("volunteer_id, teams(name)"),
  ]);

  const teamsByUser = new Map<string, string[]>();
  for (const m of memberships ?? []) {
    const name = (m.teams as unknown as { name: string } | null)?.name;
    if (!name) continue;
    const arr = teamsByUser.get(m.volunteer_id) ?? [];
    arr.push(name);
    teamsByUser.set(m.volunteer_id, arr);
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
                      {teamsByUser.get(p.id)?.length ? (
                        teamsByUser.get(p.id)!.map((t) => (
                          <span key={t} className="rounded-full bg-slate-100 px-2 py-0.5">{t}</span>
                        ))
                      ) : (
                        <span>بدون فريق</span>
                      )}
                      <span>· سجل {formatDate(p.created_at)}</span>
                    </div>
                  </div>
                  <RoleSelect
                    userId={p.id}
                    currentRole={p.role}
                    disabled={isSelf}
                  />
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
