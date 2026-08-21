import { HeartHandshake } from "lucide-react";
import { appSubtitleAr } from "@/lib/i18n";

export default function AuthLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="flex min-h-screen">
      {/* Brand panel */}
      <div className="relative hidden w-1/2 flex-col justify-between overflow-hidden bg-gradient-to-br from-brand-800 via-brand-700 to-brand-900 p-12 lg:flex">
        <div className="absolute -left-20 -top-20 h-72 w-72 rounded-full bg-white/5" />
        <div className="absolute -bottom-24 -right-16 h-96 w-96 rounded-full bg-white/5" />
        <div>
          <div className="flex items-center gap-3">
            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-white/10 ring-1 ring-white/20">
              <HeartHandshake className="h-6 w-6 text-white" />
            </div>
            <div>
              <p className="text-2xl font-extrabold text-white">RAS</p>
              <p className="text-xs font-medium text-brand-100">RESALA ADMINISTRATION SYSTEM</p>
            </div>
          </div>
        </div>

        <div className="relative">
          <h1 className="text-3xl font-extrabold leading-relaxed text-white">
            {appSubtitleAr}
          </h1>
          <p className="mt-3 max-w-md text-sm leading-relaxed text-brand-100">
            منصة إدارة المتطوعين والقوافل الطبية لفريق قوافل طبية — تتبع الحضور،
            والمهام، والتقييمات، والجوائز، والإنذارات في مكان واحد.
          </p>
        </div>

        <p className="relative text-xs text-brand-200">
          قوافل طبية — رسالة
        </p>
      </div>

      {/* Form panel */}
      <div className="flex flex-1 items-center justify-center bg-slate-50 p-6">
        <div className="w-full max-w-md">{children}</div>
      </div>
    </div>
  );
}
