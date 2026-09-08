"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { LogOut } from "lucide-react";
import { leaveTeam } from "@/lib/actions/teams";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import { useToast } from "@/components/ui/toast";

export function LeaveTeamButton({ teamId }: { teamId: string }) {
  const { toast } = useToast();
  const router = useRouter();
  const [open, setOpen] = React.useState(false);
  const [loading, setLoading] = React.useState(false);

  async function handleLeave() {
    setLoading(true);
    const res = await leaveTeam(teamId);
    setLoading(false);
    if (!res.ok) {
      toast("error", "تعذر مغادرة المجموعة", res.error);
      return;
    }
    toast("success", "تمت مغادرة المجموعة");
    setOpen(false);
    router.push("/teams");
    router.refresh();
  }

  return (
    <>
      <Button variant="outline" size="sm" onClick={() => setOpen(true)}>
        <LogOut className="h-4 w-4" />
        مغادرة المجموعة
      </Button>

      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title="مغادرة المجموعة"
        description="هل أنت متأكد من مغادرة هذه المجموعة؟"
        footer={
          <>
            <Button variant="secondary" onClick={() => setOpen(false)}>
              إلغاء
            </Button>
            <Button variant="danger" onClick={handleLeave} loading={loading}>
              <LogOut className="h-4 w-4" />
              مغادرة المجموعة
            </Button>
          </>
        }
      />
    </>
  );
}
