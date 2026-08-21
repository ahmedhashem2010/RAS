import { requireAdmin } from "@/lib/auth";
import { CreateConvoyForm } from "@/components/convoys/create-convoy-form";

export default async function NewConvoyPage() {
  await requireAdmin();
  return (
    <div className="mx-auto max-w-2xl">
      <CreateConvoyForm />
    </div>
  );
}
