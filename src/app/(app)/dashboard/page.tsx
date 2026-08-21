import { requireUser } from "@/lib/auth";
import { AdminDashboard } from "@/components/dashboard/admin-dashboard";
import { LeaderDashboard } from "@/components/dashboard/leader-dashboard";
import { VolunteerDashboard } from "@/components/dashboard/volunteer-dashboard";

export default async function DashboardPage() {
  const user = await requireUser();

  if (user.isAdmin) {
    return <AdminDashboard />;
  }
  if (user.isTeamLeader) {
    return <LeaderDashboard user={user} />;
  }
  return <VolunteerDashboard user={user} />;
}
