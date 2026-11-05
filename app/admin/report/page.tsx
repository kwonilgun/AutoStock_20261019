import { AdminShell, requireAdminPage } from "@/components/admin/AdminShell";
import { ReportEditor } from "@/components/admin/RecommendEditor";
import { formatDay, seoulDay } from "@/lib/format";
import { listAnalysisReports } from "@/lib/server/analysis-reports";

export default async function AdminReportPage() {
  await requireAdminPage();
  const reports = await listAnalysisReports();
  const latest = reports[0] ? `${reports.length}개 · 최근 ${formatDay(reports[0].date)}` : "아직 없음";

  return (
    <AdminShell subtitle={`분석 리포트 · ${latest}`}>
      <ReportEditor reports={reports} today={seoulDay()} />
    </AdminShell>
  );
}
