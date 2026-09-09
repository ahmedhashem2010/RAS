import { requireUser } from "@/lib/auth";
import { AdminDashboard } from "@/components/dashboard/admin-dashboard";
import { VolunteerDashboard } from "@/components/dashboard/volunteer-dashboard";

export default async function DashboardPage() {
  const user = await requireUser();

  if (user.isAdmin) {
    return <AdminDashboard />;
  }
  return <VolunteerDashboard user={user} />;
}
