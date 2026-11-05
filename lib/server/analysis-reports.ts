import { prisma } from "@/lib/db";
import { seoulDay } from "@/lib/format";
import { type AnalysisReportView } from "@/lib/reports";

const SETTING_ID = "global";

export async function listAnalysisReports(): Promise<AnalysisReportView[]> {
  await migrateLegacyReport();
  const rows = await prisma.analysisReport.findMany({
    orderBy: [{ date: "desc" }, { createdAt: "desc" }],
    select: { id: true, date: true, title: true, body: true, createdAt: true },
  });
  return rows.map((row) => ({
    id: row.id,
    date: row.date,
    title: row.title,
    body: row.body,
    createdAt: row.createdAt.toISOString(),
  }));
}

/** 예전에 하나만 저장하던 리포트를 그 수정일의 날짜 리포트로 옮긴다. 옮긴 뒤에는 옛 칸을 비워 다시 생기지 않게 한다. */
async function migrateLegacyReport() {
  const count = await prisma.analysisReport.count();
  if (count > 0) return;
  const setting = await prisma.recommendationSetting.findUnique({ where: { id: SETTING_ID } });
  if (!setting) return;
  const title = setting.reportTitle.trim();
  const body = setting.reportBody.trim();
  if (!title && !body) return;
  const date = seoulDay(setting.updatedAt);
  try {
    await prisma.$transaction([
      prisma.analysisReport.create({
        data: { date, title, body, updatedBy: setting.updatedBy },
      }),
      prisma.recommendationSetting.update({
        where: { id: SETTING_ID },
        data: { reportTitle: "", reportBody: "" },
      }),
    ]);
  } catch {
    const existing = await prisma.analysisReport.findFirst({ where: { date } });
    if (!existing) throw new Error("예전 리포트를 날짜별로 옮기지 못했습니다.");
    await prisma.recommendationSetting.update({
      where: { id: SETTING_ID },
      data: { reportTitle: "", reportBody: "" },
    });
  }
}

export async function createAnalysisReport(
  input: { date: string; title: string; body: string },
  updatedBy: string,
) {
  return prisma.analysisReport.create({
    data: { ...input, updatedBy },
    select: { id: true },
  });
}

export async function updateAnalysisReport(
  id: string,
  input: { title: string; body: string },
  updatedBy: string,
) {
  await prisma.analysisReport.update({
    where: { id },
    data: { ...input, updatedBy },
  });
}

export async function deleteAnalysisReport(id: string) {
  await prisma.analysisReport.delete({ where: { id } });
}
