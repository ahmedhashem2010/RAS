import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { CreateTaskForm } from "@/components/tasks/create-task-form";
import { createClient } from "@/lib/supabase/server";

export default async function NewTaskPage() {
  const user = await requireUser();
  if (!user.isAdmin && !user.isCommitteeLeader) redirect("/tasks");
  const supabase = await createClient();

  // Scoped by RLS: admins get every active profile, committee leaders get
  // the active volunteers of the committees they lead (plus themselves).
  const { data: volunteers } = await supabase.rpc("get_active_profiles");

  return (
    <div className="mx-auto max-w-2xl">
      <CreateTaskForm volunteers={volunteers ?? []} />
    </div>
  );
}