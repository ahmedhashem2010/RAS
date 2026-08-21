import type { Metadata } from "next";
import { HeartHandshake, ShieldAlert, MessageSquareText } from "lucide-react";
import { AccountBannedActions } from "@/components/auth/account-banned-actions";

export const metadata: Metadata = {
  title: "الحساب موقوف",
};

export default function AccountBannedPage() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-50 p-6">
      <div className="w-full max-w-md">
        <div className="mb-6 flex items-center justify-center gap-2">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-brand-600 to-brand-800">
            <HeartHandshake className="h-5 w-5 text-white" />
          </div>
          <div>
            <p className="text-lg font-extrabold text-slate-900">RAS</p>
            <p className="text-[10px] font-medium text-slate-500">
              RESALA ADMINISTRATION SYSTEM
            </p>
          </div>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-8 text-center shadow-card">
          <div className="mx-auto mb-5 flex h-16 w-16 items-center justify-center rounded-2xl bg-red-50 ring-1 ring-red-100">
            <ShieldAlert className="h-8 w-8 text-red-500" />
          </div>

          <h1 className="text-xl font-extrabold text-slate-900">الحساب موقوف</h1>
          <p className="mt-3 text-sm leading-relaxed text-slate-500">
            تم تعليق حسابك، ولا يمكنك حالياً استخدام المنصة.
            إذا كنت تعتقد أن هذا الإجراء غير صحيح، يرجى التواصل مع إدارة المنظمة.
          </p>

          <div className="mt-6 flex items-center justify-center gap-2 rounded-xl bg-slate-50 px-4 py-4 text-sm font-medium text-slate-600">
            <MessageSquareText className="h-4 w-4 text-brand-600" />
            للاستفسار، يرجى التواصل مع إدارة قوافل طبية — رسالة
          </div>

          <div className="mt-4 flex justify-center">
            <AccountBannedActions />
          </div>
        </div>
      </div>
    </div>
  );
}
