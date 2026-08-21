import { requireUser } from "@/lib/auth";
import { ToastProvider } from "@/components/ui/toast";
import { Sidebar } from "@/components/layout/sidebar";
import { MobileNav } from "@/components/layout/mobile-nav";
import { NotificationsBell } from "@/components/layout/notifications-bell";
import { HeartHandshake } from "lucide-react";
import Link from "next/link";
import { Avatar } from "@/components/ui/avatar";

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await requireUser();

  return (
    <ToastProvider>
      <div className="min-h-screen">
        <Sidebar user={user} />

        <div className="lg:pr-64">
          {/* Mobile top bar */}
          <header className="sticky top-0 z-20 flex items-center justify-between border-b border-slate-200 bg-white/95 px-4 py-3 backdrop-blur lg:hidden">
            <Link href="/dashboard" className="flex items-center gap-2">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-brand-600 to-brand-800">
                <HeartHandshake className="h-4 w-4 text-white" />
              </div>
              <span className="text-base font-extrabold text-slate-900">RAS</span>
            </Link>
            <div className="flex items-center gap-2">
              <NotificationsBell userId={user.id} />
              <Link href="/profile">
                <Avatar
                  name={user.profile.full_name}
                  src={user.profile.avatar_url}
                  size="sm"
                />
              </Link>
            </div>
          </header>

          <main className="mx-auto max-w-6xl px-4 pb-24 pt-5 sm:px-6 lg:pb-12 lg:pt-8">
            {children}
          </main>
        </div>

        <MobileNav user={user} />
      </div>
    </ToastProvider>
  );
}
