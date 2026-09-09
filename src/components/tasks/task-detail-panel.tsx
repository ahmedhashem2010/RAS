"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import {
  Play,
  Upload,
  CheckCircle2,
  XCircle,
  RotateCcw,
  ExternalLink,
} from "lucide-react";
import {
  startTask,
  submitTask,
  reviewTask,
  reopenTask,
} from "@/lib/actions/tasks";
import { uploadTaskProof } from "@/lib/actions/uploads";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge, StatusBadge } from "@/components/ui/badge";
import { Avatar } from "@/components/ui/avatar";
import { Modal } from "@/components/ui/modal";
import { StarRating } from "@/components/ui/star-rating";
import { Textarea } from "@/components/ui/field";
import { useToast } from "@/components/ui/toast";
import { taskStatusLabels } from "@/lib/i18n";
import { formatDateTime } from "@/lib/utils";

interface Assignment {
  id: string;
  volunteer_id: string;
  volunteerName: string;
  reviewerName: string | null;
  avatarUrl: string | null;
  status: "pending" | "in_progress" | "submitted" | "approved" | "rejected";
  proof_url: string | null;
  submitted_at: string | null;
  reviewed_at: string | null;
  rating: number | null;
  review_comment: string | null;
}

export function TaskDetailPanel({
  assignments,
  myAssignmentId,
  myStatus,
  myProofUrl,
  canManage,
}: {
  assignments: Assignment[];
  myAssignmentId: string | null;
  myStatus: Assignment["status"] | null;
  myProofUrl: string | null;
  canManage: boolean;
}) {
  const { toast } = useToast();
  const router = useRouter();
  const [busy, setBusy] = React.useState<string | null>(null);
  const [reviewTarget, setReviewTarget] = React.useState<Assignment | null>(null);
  const [rating, setRating] = React.useState(0);
  const [comment, setComment] = React.useState("");
  const [file, setFile] = React.useState<File | null>(null);

  async function run(action: string, fn: () => Promise<{ ok: boolean; error?: string }>) {
    setBusy(action);
    const res = await fn();
    setBusy(null);
    if (!res.ok) {
      toast("error", "حدث خطأ", res.error);
      return;
    }
    toast("success", "تم التنفيذ");
    router.refresh();
  }

  async function handleSubmit() {
    if (!myAssignmentId) return;
    let proofUrl: string | null = null;
    if (file) {
      const fd = new FormData();
      fd.append("file", file);
      const up = await uploadTaskProof(fd);
      if (!up.ok) {
        toast("error", "تعذر رفع الملف", up.error);
        return;
      }
      proofUrl = (up as unknown as { url: string }).url;
    }
    await run("submit", () => submitTask(myAssignmentId, proofUrl));
  }

  async function handleReview(approve: boolean) {
    if (!reviewTarget) return;
    if (approve && (rating < 1 || rating > 5)) {
      toast("warning", "يرجى تقييم المهمة من 1 إلى 5 عند القبول");
      return;
    }
    const id = reviewTarget.id;
    setReviewTarget(null);
    await run(`review-${id}`, () => reviewTask(id, approve, approve ? rating : null, comment));
    setRating(0);
    setComment("");
  }

  const isRejectedThenReopened = myStatus === "rejected";

  return (
    <Card>
      <CardHeader>
        <CardTitle>المتطوعون المعينون</CardTitle>
        <Badge tone="slate">{assignments.length}</Badge>
      </CardHeader>
      <CardContent className="space-y-3">
        {assignments.map((a) => {
          const isMine = a.id === myAssignmentId;
          return (
            <div key={a.id} className="rounded-xl border border-slate-100 p-4">
              <div className="flex items-center gap-3">
                <Avatar name={a.volunteerName} src={a.avatarUrl} size="sm" />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-bold text-slate-800">
                    {a.volunteerName}
                    {isMine && <span className="mr-1 text-xs font-semibold text-brand-600">(أنت)</span>}
                  </p>
                  <div className="mt-0.5 flex flex-wrap items-center gap-2">
                    <StatusBadge status={a.status} />
                    {a.rating && (
                      <Badge tone="gold">تقييم {a.rating}/5</Badge>
                    )}
                    {a.submitted_at && (
                      <span className="text-[11px] text-slate-400">
                        سُلمت {formatDateTime(a.submitted_at)}
                      </span>
                    )}
                  </div>
                </div>

                {/* Volunteer actions */}
                {isMine && a.status === "pending" && (
                  <Button size="sm" variant="secondary" loading={busy === "start"} onClick={() => run("start", () => startTask(a.id))}>
                    <Play className="h-3.5 w-3.5" />
                    بدء التنفيذ
                  </Button>
                )}
                {isMine && a.status === "rejected" && canManage && (
                  <Button size="sm" variant="secondary" loading={busy === "reopen"} onClick={() => run("reopen", () => reopenTask(a.id))}>
                    <RotateCcw className="h-3.5 w-3.5" />
                    السماح بإعادة التسليم
                  </Button>
                )}

                {/* Leader actions */}
                {canManage && a.status === "submitted" && (
                  <Button
                    size="sm"
                    onClick={() => {
                      setReviewTarget(a);
                      setRating(0);
                      setComment("");
                    }}
                  >
                    مراجعة
                  </Button>
                )}
              </div>

              {/* Proof */}
              {a.proof_url && (
                <a
                  href={a.proof_url}
                  target="_blank"
                  rel="noreferrer"
                  className="mt-3 flex items-center gap-2 rounded-lg bg-slate-50 px-3 py-2 text-xs font-semibold text-brand-700 hover:bg-brand-50"
                >
                  <ExternalLink className="h-3.5 w-3.5" />
                  ملف إثبات الإنجاز
                </a>
              )}
              {a.review_comment && (
                <p className="mt-3 rounded-lg bg-slate-50 px-3 py-2 text-xs text-slate-600">
                  <span className="font-bold">ملاحظة المراجعة: </span>
                  {a.review_comment}
                </p>
              )}

              {/* Volunteer submission UI */}
              {isMine && (a.status === "in_progress" || a.status === "pending") && (
                <div className="mt-3 space-y-3 rounded-lg border border-dashed border-slate-200 p-3">
                  <label className="flex cursor-pointer items-center justify-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-50">
                    <Upload className="h-4 w-4" />
                    {file ? file.name : "إرفاق دليل (اختياري)"}
                    <input
                      type="file"
                      className="hidden"
                      onChange={(e) => setFile(e.target.files?.[0] ?? null)}
                    />
                  </label>
                  {myProofUrl && (
                    <a
                      href={myProofUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="block truncate text-xs font-semibold text-brand-700"
                    >
                      الدليل الحالي
                    </a>
                  )}
                  <Button
                    size="sm"
                    className="w-full"
                    loading={busy === "submit"}
                    onClick={handleSubmit}
                  >
                    <CheckCircle2 className="h-4 w-4" />
                    تسليم المهمة للمراجعة
                  </Button>
                </div>
              )}

              {isMine && a.status === "rejected" && !canManage && (
                <p className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-xs font-semibold text-red-700">
                  رُفضت هذه المهمة — يمكن لمسؤول المهمة السماح بإعادة التسليم.
                </p>
              )}

              {isRejectedThenReopened && isMine && (
                <div className="mt-3 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800">
                  سمح مسؤول المهمة لك بإعادة التسليم — سجّل الدليل واختر تسليم.
                </div>
              )}
            </div>
          );
        })}
      </CardContent>

      {/* Review modal */}
      <Modal
        open={!!reviewTarget}
        onClose={() => setReviewTarget(null)}
        title={`مراجعة مهمة ${reviewTarget?.volunteerName ?? ""}`}
        description="قبول أو رفض التسليم مع تقييم الأداء"
        footer={
          <>
            <Button
              variant="danger"
              onClick={() => handleReview(false)}
              loading={busy === `review-${reviewTarget?.id}`}
            >
              <XCircle className="h-4 w-4" />
              رفض
            </Button>
            <Button onClick={() => handleReview(true)} loading={busy === `review-${reviewTarget?.id}`}>
              <CheckCircle2 className="h-4 w-4" />
              قبول وتقييم
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <div className="flex items-center gap-3">
            <span className="text-sm font-semibold text-slate-600">تقييم الأداء (1–5):</span>
            <StarRating value={rating} onChange={setRating} />
            {rating > 0 && <span className="text-sm font-extrabold text-gold-600">{rating}/5</span>}
          </div>
          <Textarea
            rows={3}
            placeholder="ملاحظة للمتطوع (اختياري)"
            value={comment}
            onChange={(e) => setComment(e.target.value)}
          />
          <p className="text-xs text-slate-400">
            {taskStatusLabels.submitted} — تقييم المهمة يُحتسب في أداء المتطوع.
          </p>
        </div>
      </Modal>
    </Card>
  );
}
