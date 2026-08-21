import { Settings } from "lucide-react";
import { requireSuperAdmin } from "@/lib/auth";
import { getSettings } from "@/lib/actions/settings";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";
import { SettingsForm } from "@/components/admin/settings-form";

export default async function AdminSettingsPage() {
  await requireSuperAdmin();
  const settings = await getSettings();

  return (
    <div className="mx-auto max-w-2xl">
      <PageHeader
        title="إعدادات النظام"
        description="تحكم في قواعد العمل والحدود داخل النظام"
      />

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Settings className="h-4 w-4 text-brand-700" />
            قواعد التقييم والإنذارات
          </CardTitle>
        </CardHeader>
        <CardContent>
          <SettingsForm settings={settings} />
        </CardContent>
      </Card>

      <p className="mt-4 text-center text-xs text-slate-400">
        يتم تسجيل أي تغيير في الإعدادات ضمن سجل العمليات.
      </p>
    </div>
  );
}
