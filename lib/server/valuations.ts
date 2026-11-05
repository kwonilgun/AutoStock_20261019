import { prisma } from "@/lib/db";
import { externalFlowKrw, readPositions, snapshotValuations, type HeldPosition, type TickerAlias } from "@/lib/engine/history";
import { seoulDay } from "@/lib/format";

const fields = { date: true, totalKrw: true, flowKrw: true, positionsJson: true } as const;

export type StoredDay = {
  date: string;
  totalKrw: number;
  flowKrw: number;
  positionsJson: string;
};

export async function syncValuations(
  portfolioId: string,
  current: { totalKrw: number; positions: HeldPosition[]; usdKrw: number; aliases?: TickerAlias[] },
): Promise<StoredDay[]> {
  const today = seoulDay();
  const snapshots = await prisma.rebalanceSnapshot.findMany({
    where: { portfolioId },
    orderBy: { confirmedAt: "asc" },
    select: { confirmedAt: true, totalKrw: true, booksJson: true },
  });
  const seeds = snapshotValuations(
    snapshots.map((snapshot) => ({
      date: seoulDay(snapshot.confirmedAt),
      totalKrw: snapshot.totalKrw,
      hasBooks: snapshot.booksJson.trim().length > 2,
    })),
    today,
  );

  if (seeds.length > 0) {
    const existing = await prisma.valuation.findMany({
      where: { portfolioId, date: { in: seeds.map((seed) => seed.date) } },
      select: { date: true },
    });
    const have = new Set(existing.map((row) => row.date));
    const missing = seeds
      .filter((seed) => !have.has(seed.date))
      .map((seed) => ({ portfolioId, date: seed.date, totalKrw: seed.totalKrw }));
    if (missing.length > 0) await prisma.valuation.createMany({ data: missing });
  }

  if (!Number.isFinite(current.totalKrw)) {
    return prisma.valuation.findMany({ where: { portfolioId }, orderBy: { date: "asc" }, select: fields });
  }

  const positions = current.totalKrw > 0 ? current.positions : [];
  const positionsJson = JSON.stringify(positions);
  const todayRow = await prisma.valuation.findUnique({
    where: { portfolioId_date: { portfolioId, date: today } },
    select: { totalKrw: true, positionsJson: true },
  });
  const unchanged =
    todayRow != null &&
    Math.round(todayRow.totalKrw) === Math.round(current.totalKrw) &&
    todayRow.positionsJson === positionsJson;
  if (!unchanged) {
    const previous = await prisma.valuation.findFirst({
      where: { portfolioId, date: { lt: today } },
      orderBy: { date: "desc" },
      select: { totalKrw: true, positionsJson: true },
    });
    const flowKrw = Math.round(
      externalFlowKrw({
        previous: previous ? readPositions(previous.positionsJson) : null,
        previousTotalKrw: previous?.totalKrw ?? 0,
        current: positions,
        usdKrw: current.usdKrw,
        aliases: current.aliases,
      }),
    );

    await prisma.valuation.upsert({
      where: { portfolioId_date: { portfolioId, date: today } },
      create: { portfolioId, date: today, totalKrw: current.totalKrw, flowKrw, positionsJson },
      update: { totalKrw: current.totalKrw, flowKrw, positionsJson },
    });
  }

  return reconcileFlows(portfolioId, current.usdKrw, current.aliases);
}

async function reconcileFlows(portfolioId: string, usdKrw: number, aliases?: TickerAlias[]): Promise<StoredDay[]> {
  const rows = await prisma.valuation.findMany({
    where: { portfolioId },
    orderBy: { date: "asc" },
    select: fields,
  });
  const pending: { date: string; flowKrw: number }[] = [];
  for (let index = 0; index < rows.length; index += 1) {
    const current = rows[index];
    const positions = readPositions(current.positionsJson);
    if (positions == null) continue;
    const previous = index > 0 ? rows[index - 1] : null;
    const flowKrw = Math.round(
      externalFlowKrw({
        previous: previous ? readPositions(previous.positionsJson) : null,
        previousTotalKrw: previous?.totalKrw ?? 0,
        current: positions,
        usdKrw,
        aliases,
      }),
    );
    if (flowKrw === Math.round(current.flowKrw)) continue;
    pending.push({ date: current.date, flowKrw });
    current.flowKrw = flowKrw;
  }
  if (pending.length > 0) {
    await prisma.$transaction(
      pending.map((row) =>
        prisma.valuation.update({
          where: { portfolioId_date: { portfolioId, date: row.date } },
          data: { flowKrw: row.flowKrw },
        }),
      ),
    );
  }
  return rows;
}
