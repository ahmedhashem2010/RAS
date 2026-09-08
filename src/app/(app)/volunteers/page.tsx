import { requireCommitteeManager } from "@/lib/auth";
import { getVolunteerDetails, getDepartments } from "@/lib/queries";
import { PageHeader } from "@/components/ui/page-header";
import { Card } from "@/components/ui/card";
import { VolunteersPanel } from "@/components/volunteers/volunteers-panel";

export const metadata = {
  title: "المتطوعون | RAS",
  description: "إدارة المتطوعين واللجان",
};

export default async function VolunteersPage() {
  const user = await requireCommitteeManager();
  const [volunteers, committees] = await Promise.all([
    getVolunteerDetails(),
    getDepartments(),
  ]);

  const total = volunteers.length;

  return (
    <div>
      <PageHeader
        title="المتطوعون"
        description={
          user.isCommitteeLeader && !user.isAdmin
            ? `${total} متطوع في اللجان المشرف عليها`
            : `${total} متطوع مسجل في النظام`
        }
      />
      <Card>
        <VolunteersPanel
          volunteers={volunteers}
          committees={committees}
          canManage={user.isAdmin}
          canDelete={user.isSuperAdmin}
          canLink={user.isSuperAdmin}
          ledCommitteeIds={user.ledCommitteeIds}
        />
      </Card>
    </div>
  );
}