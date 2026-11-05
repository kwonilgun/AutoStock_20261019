import { prisma } from "@/lib/db";
import { parseRecommendItems, type RecommendItems } from "@/lib/recommendations";

const ID = "global";

export type RecommendationView = {
  items: RecommendItems;
  reportTitle: string;
  reportBody: string;
  updatedAt: Date | null;
};

export async function getRecommendationSetting(): Promise<RecommendationView> {
  const row = await prisma.recommendationSetting.findUnique({ where: { id: ID } });
  return {
    items: parseRecommendItems(row?.itemsJson ?? ""),
    reportTitle: row?.reportTitle ?? "",
    reportBody: row?.reportBody ?? "",
    updatedAt: row?.updatedAt ?? null,
  };
}

export async function saveRecommendationSetting(
  data: { items?: RecommendItems; reportTitle?: string; reportBody?: string },
  updatedBy: string,
) {
  const itemsJson = data.items ? JSON.stringify(data.items) : undefined;
  const fields = {
    ...(itemsJson != null ? { itemsJson } : {}),
    ...(data.reportTitle != null ? { reportTitle: data.reportTitle } : {}),
    ...(data.reportBody != null ? { reportBody: data.reportBody } : {}),
  };
  await prisma.recommendationSetting.upsert({
    where: { id: ID },
    create: { id: ID, ...fields, updatedBy },
    update: { ...fields, updatedBy },
  });
}
