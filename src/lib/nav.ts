import {
  LayoutDashboard,
  Users,
  Truck,
  ClipboardList,
  Trophy,
  ShieldAlert,
  BarChart3,
  Bell,
  User,
  Medal,
  ScrollText,
  Settings,
  Star,
  type LucideIcon,
} from "lucide-react";
import type { SessionUser } from "@/lib/types";
import { nav } from "@/lib/i18n";

export interface NavItem {
  href: string;
  label: string;
  icon: LucideIcon;
  admin?: boolean;
  leader?: boolean;
  super?: boolean;
}

export function getNavItems(user: SessionUser): NavItem[] {
  const isAdmin = user.isAdmin;
  const isLeader = user.isTeamLeader;
  const isSuper = user.isSuperAdmin;

  const items: NavItem[] = [
    { href: "/dashboard", label: nav.dashboard, icon: LayoutDashboard },
    { href: "/convoys", label: nav.convoys, icon: Truck },
    { href: "/leaderboard", label: nav.leaderboard, icon: Star },
    { href: "/awards", label: nav.awards, icon: Trophy },
    { href: "/notifications", label: nav.notifications, icon: Bell },
    { href: "/profile", label: nav.profile, icon: User },
  ];

  if (isAdmin || isLeader) {
    items.splice(2, 0, { href: "/teams", label: nav.teams, icon: Users });
    items.splice(3, 0, { href: "/tasks", label: nav.tasks, icon: ClipboardList });
  }

  if (isAdmin) {
    items.splice(4, 0,
      { href: "/volunteers", label: nav.volunteers, icon: Users, admin: true },
      { href: "/warnings", label: nav.warnings, icon: ShieldAlert, admin: true },
      { href: "/analytics", label: nav.analytics, icon: BarChart3, admin: true },
    );
  }

  if (isSuper) {
    items.splice(items.length - 1, 0,
      { href: "/admin/users", label: nav.users, icon: Medal, super: true },
      { href: "/admin/audit", label: nav.audit, icon: ScrollText, super: true },
      { href: "/admin/settings", label: nav.settings, icon: Settings, super: true },
    );
  }

  return items;
}

export function mobilePrimaryItems(user: SessionUser): NavItem[] {
  const all = getNavItems(user);
  const order = ["/dashboard", "/convoys", "/leaderboard", "/notifications", "/profile"];
  return order
    .map((href) => all.find((i) => i.href === href))
    .filter(Boolean) as NavItem[];
}
