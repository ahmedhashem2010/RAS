import { requireAdmin } from "@/lib/auth";
import { CreateTeamForm } from "@/components/teams/create-team-form";

export default async function NewTeamPage() {
  await requireAdmin();
  return (
    <div className="mx-auto max-w-2xl">
      <CreateTeamForm />
    </div>
  );
}
