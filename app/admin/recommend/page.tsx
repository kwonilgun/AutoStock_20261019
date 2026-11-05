import { AdminShell, formatUpdatedAt, requireAdminPage } from "@/components/admin/AdminShell";
import { RecommendEditor } from "@/components/admin/RecommendEditor";
import { getRecommendationSetting } from "@/lib/server/recommendation-setting";

export default async function AdminRecommendPage() {
  await requireAdminPage();
  const recommendation = await getRecommendationSetting();

  return (
    <AdminShell subtitle={`추천 종목 · 마지막 변경 ${formatUpdatedAt(recommendation.updatedAt)}`}>
      <RecommendEditor items={recommendation.items} />
    </AdminShell>
  );
}
