"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Trash2 } from "lucide-react";
import { deleteConvoy } from "@/lib/actions/convoys";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import { useToast } from "@/components/ui/toast";

export function DeleteConvoyButton({
  convoyId,
  convoyName,
}: {
  convoyId: string;
  convoyName: string;
}) {
  const { toast } = useToast();
  const router = useRouter();
  const [open, setOpen] = React.useState(false);
  const [loading, setLoading] = React.useState(false);

  async function confirmDelete() {
    setLoading(true);
    const res = await deleteConvoy(convoyId);
    setLoading(false);
    if (!res.ok) {
      toast("error", "تعذر حذف القافلة", res.error);
      return;
    }
    toast("success", "تم حذف القافلة");
    router.push("/convoys");
  }

  return (
    <>
      <Button size="sm" variant="danger" onClick={() => setOpen(true)}>
        <Trash2 className="h-4 w-4" />
        حذف القافلة
      </Button>
      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title="حذف القافلة"
        description="إجراء نهائي لا يمكن التراجع عنه."
        footer={
          <>
            <Button variant="secondary" onClick={() => setOpen(false)}>
              إلغاء
            </Button>
            <Button variant="danger" onClick={confirmDelete} loading={loading}>
              حذف
            </Button>
          </>
        }
      >
        <p className="text-sm text-slate-700">
          هل أنت متأكد من حذف <strong>{convoyName}</strong>؟
        </p>
        <p className="mt-2 text-sm text-slate-500">
          سيتم حذف القافلة مع سجلات الحضور والتقييمات المرتبطة بها نهائياً، وستُفصل جوائزها عن القافلة.
        </p>
      </Modal>
    </>
  );
}