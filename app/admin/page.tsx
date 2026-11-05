import { AdminShell, formatUpdatedAt, requireAdminPage } from "@/components/admin/AdminShell";
import { PhaseWhyEditor } from "@/components/admin/PhaseWhyEditor";
import { WeightEditor } from "@/components/admin/WeightEditor";
import { EggChart } from "@/components/egg/EggChart";
import { getPhaseSetting } from "@/lib/server/phase-setting";

export default async function AdminPage() {
  await requireAdminPage();
  const setting = await getPhaseSetting();

  return (
    <AdminShell subtitle={`지금 국면 ${setting.phase} · 마지막 변경 ${formatUpdatedAt(setting.updatedAt)}`}>
      <EggChart phase={setting.phase} editable why={setting.whys[setting.phase]} />
      <PhaseWhyEditor notes={setting.whys} customized={setting.whyCustomized} activePhase={setting.phase} />
      <WeightEditor weights={setting.weights} customized={setting.customized} activePhase={setting.phase} />
    </AdminShell>
  );
}
