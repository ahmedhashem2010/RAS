import { createClient } from "@/lib/supabase/server";
import { requireAdmin } from "@/lib/auth";
import { getSettings } from "@/lib/actions/settings";
import { Card, CardContent } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";
import { VolunteersList } from "@/components/volunteers/volunteers-list";

export default async function VolunteersPage() {
  const user = await requireAdmin();
  const settings = await getSettings();

  const supabase = await createClient();
  const [{ data: profiles }, { data: warnings }, { data: scores }, { data: memberships }] =
    await Promise.all([
      supabase.from("profiles").select("*").order("full_name"),
      supabase.from("warnings").select("volunteer_id, number"),
      supabase.rpc("get_all_scores"),
      supabase
        .from("team_members")
        .select("volunteer_id, teams(name)"),
    ]);

  const warnCount = new Map<string, number>();
  for (const w of warnings ?? []) warnCount.set(w.volunteer_id, Math.max(warnCount.get(w.volunteer_id) ?? 0, w.number));

  const scoreMap = new Map<string, number>();
  for (const s of scores ?? []) scoreMap.set(s.volunteer_id, s.overall_score);

  const teamsByVolunteer = new Map<string, string[]>();
  for (const m of memberships ?? []) {
    const name = (m.teams as unknown as { name: string } | null)?.name;
    if (!name) continue;
    const arr = teamsByVolunteer.get(m.volunteer_id) ?? [];
    arr.push(name);
    teamsByVolunteer.set(m.volunteer_id, arr);
  }

  const rows = (profiles ?? []).map((p) => ({
    ...p,
    warnings: warnCount.get(p.id) ?? 0,
    score: scoreMap.get(p.id) ?? null,
    teams: teamsByVolunteer.get(p.id) ?? [],
  }));

  const totalVolunteers = (profiles ?? []).length;

  return (
    <div>
      <PageHeader
        title="المتطوعون"
        description={`${totalVolunteers} متطوع مسجل`}
      />

      <Card>
        <CardContent className="p-0">
          <VolunteersList rows={rows} currentUserId={user.id} warningLimit={settings.warning_limit} />
        </CardContent>
      </Card>
    </div>
  );
}
