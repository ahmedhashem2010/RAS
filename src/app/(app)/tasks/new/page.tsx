import { requireUser } from "@/lib/auth";
import { CreateTaskForm } from "@/components/tasks/create-task-form";
import { createClient } from "@/lib/supabase/server";

export default async function NewTaskPage({
  searchParams,
}: {
  searchParams: Promise<{ team?: string }>;
}) {
  const user = await requireUser();
  const { team } = await searchParams;
  const supabase = await createClient();

  let teamIds: string[];
  if (user.isAdmin) {
    const { data } = await supabase.from("teams").select("id");
    teamIds = (data ?? []).map((t) => t.id);
  } else {
    teamIds = user.ledTeamIds;
  }

  const { data: teams } = await supabase.from("teams").select("*").in("id", teamIds);
  const { data: volunteers } = await supabase.rpc("get_active_profiles");

  const preselect = team && teamIds.includes(team) ? team : undefined;

  return (
    <div className="mx-auto max-w-2xl">
      <CreateTaskForm
        teams={teams ?? []}
        volunteers={volunteers ?? []}
        preselectTeamId={preselect}
      />
    </div>
  );
}
