"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Save } from "lucide-react";
import { saveEvaluation } from "@/lib/actions/convoys";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Avatar } from "@/components/ui/avatar";
import { StarRating } from "@/components/ui/star-rating";
import { Textarea } from "@/components/ui/field";
import { useToast } from "@/components/ui/toast";
import { cn } from "@/lib/utils";

interface Member {
  id: string;
  full_name: string;
  avatar_url: string | null;
  status: string;
}

interface ExistingMap {
  rating: number;
  comment: string | null;
}

export function EvaluationEditor({
  convoyId,
  teamId,
  members,
  existing,
  mediaMode,
}: {
  convoyId: string;
  teamId: string;
  members: Member[];
  existing: Map<string, ExistingMap>;
  mediaMode: boolean;
}) {
  const { toast } = useToast();
  const router = useRouter();
  const [drafts, setDrafts] = React.useState<Record<string, ExistingMap>>(
    () => Object.fromEntries(existing),
  );
  const [saving, setSaving] = React.useState<string | null>(null);

  function setRating(id: string, rating: number) {
    setDrafts((prev) => ({ ...prev, [id]: { rating, comment: prev[id]?.comment ?? "" } }));
  }
  function setComment(id: string, comment: string) {
    setDrafts((prev) => ({ ...prev, [id]: { rating: prev[id]?.rating ?? 0, comment } }));
  }

  async function handleSave(id: string) {
    const d = drafts[id];
    if (!d || !d.rating) {
      toast("warning", "يرجى اختيار تقييم من 1 إلى 5 أولاً");
      return;
    }
    setSaving(id);
    const res = await saveEvaluation(convoyId, teamId, id, d.rating, d.comment?.trim() || null);
    setSaving(null);
    if (!res.ok) {
      toast("error", "حدث خطأ أثناء حفظ التقييم", res.error);
      return;
    }
    toast("success", "تم حفظ التقييم");
    router.refresh();
  }

  return (
    <div className="space-y-4">
      <p className="rounded-xl border border-brand-100 bg-brand-50/60 px-4 py-3 text-sm text-slate-600">
        {mediaMode
          ? "هذا الفريق يتبع نموذج تقييم الأعمال — قيّم الأعضاء حسب الأعمال المنتجة من القافلة."
          : "قيّم أداء المتطوعين الحاضرين في القافلة من 1 إلى 5 مع تعليق مختصر."}
      </p>

      {members.map((m) => {
        const d = drafts[m.id];
        const saved = existing.has(m.id);
        return (
          <Card key={m.id} className={cn(saved && "border-emerald-200")}>
            <CardContent className="space-y-3">
              <div className="flex items-center gap-3">
                <Avatar name={m.full_name} src={m.avatar_url} size="sm" />
                <span className="flex-1 truncate text-sm font-bold text-slate-800">
                  {m.full_name}
                </span>
                {saved && (
                  <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-bold text-emerald-600">
                    تم التقييم
                  </span>
                )}
              </div>

              <div className="flex items-center gap-3 rounded-lg bg-slate-50 px-4 py-3">
                <span className="text-xs font-semibold text-slate-500">الأداء:</span>
                <StarRating value={d?.rating ?? 0} onChange={(v) => setRating(m.id, v)} />
                {d?.rating ? (
                  <span className="text-sm font-extrabold text-gold-600">{d.rating}/5</span>
                ) : (
                  <span className="text-xs text-slate-400">اختر من 1 إلى 5</span>
                )}
              </div>

              <Textarea
                rows={2}
                placeholder="تعليق مختصر عن الأداء (مثال: التزام ممتاز وروح فريق عالية)"
                value={d?.comment ?? ""}
                onChange={(e) => setComment(m.id, e.target.value)}
              />

              <div className="flex justify-end">
                <Button
                  size="sm"
                  onClick={() => handleSave(m.id)}
                  loading={saving === m.id}
                  variant={saved ? "secondary" : "primary"}
                >
                  <Save className="h-4 w-4" />
                  {saved ? "تحديث التقييم" : "حفظ التقييم"}
                </Button>
              </div>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}
