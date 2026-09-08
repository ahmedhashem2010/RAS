import { requireCommitteeManager } from "@/lib/auth";
import { getAllCommitteesWithLeaders } from "@/lib/queries";
import { PageHeader } from "@/components/ui/page-header";
import { Card } from "@/components/ui/card";
import { CommitteesGrid } from "@/components/committees/committees-grid";

export const metadata = {
  title: "اللجان | RAS",
  description: "اللجان والتخصصات والمتطوعين",
};

export default async function CommitteesPage() {
  const user = await requireCommitteeManager();
  const committees = await getAllCommitteesWithLeaders();

  return (
    <div>
      <PageHeader
        title="اللجان"
        description={`${committees.length} لجنة في النظام`}
      />
      <Card>
        <CommitteesGrid committees={committees} canManage={user.isSuperAdmin} />
      </Card>
    </div>
  );
}