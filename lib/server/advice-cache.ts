import type { AdviceEngine } from "@/lib/advice-model";
import { prisma } from "@/lib/db";
import type { AdviceBrief } from "@/lib/server/advice";

const SOURCES = new Set(["spark", "openai", "anthropic", "google", "draft"]);

export async function readAdviceCache(userId: string, engine: AdviceEngine): Promise<AdviceBrief | null> {
  const row = await prisma.adviceCache.findUnique({
    where: { userId_engine: { userId, engine } },
  });
  if (!row || !SOURCES.has(row.source)) return null;
  return {
    phase: row.phase,
    portfolio: row.portfolio,
    actions: row.actions,
    leave: row.leave,
    source: row.source as AdviceBrief["source"],
    notice: row.notice,
    cachedAt: row.updatedAt.toISOString(),
  };
}

export async function writeAdviceCache(userId: string, engine: AdviceEngine, brief: AdviceBrief): Promise<string> {
  const row = await prisma.adviceCache.upsert({
    where: { userId_engine: { userId, engine } },
    create: {
      userId,
      engine,
      source: brief.source,
      phase: brief.phase,
      portfolio: brief.portfolio,
      actions: brief.actions,
      leave: brief.leave,
      notice: brief.notice,
    },
    update: {
      source: brief.source,
      phase: brief.phase,
      portfolio: brief.portfolio,
      actions: brief.actions,
      leave: brief.leave,
      notice: brief.notice,
    },
  });
  return row.updatedAt.toISOString();
}
