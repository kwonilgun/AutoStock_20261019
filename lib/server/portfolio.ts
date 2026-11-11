import { Prisma } from "@prisma/client";
import { cache } from "react";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { EXAMPLE_B1_HOLDINGS, EXAMPLE_FX } from "@/lib/engine/example";
import {
  applyIncome,
  heldPositions,
  quantityEvents,
  readPositions,
  type IncomeKind,
  type PositionDay,
  type QuantityEvent,
} from "@/lib/engine/history";
import { buildPerformanceReport, marksFromHoldings, type PerformanceReport } from "@/lib/engine/performance";
import { rebalance } from "@/lib/engine/rebalance";
import { targetWeights } from "@/lib/engine/targets";
import type { HoldingInput, Phase, PhaseSource, RebalanceResult, Sleeve } from "@/lib/engine/types";
import { incomeToKrw } from "@/lib/engine/value";
import { currentYearMonth } from "@/lib/format";
import { hydrateFx } from "@/lib/server/fx";
import type { PhaseWhyNote } from "@/lib/engine/phase-why";
import { getPhaseSetting, type PhaseSettingView } from "@/lib/server/phase-setting";
import { hydratePrices } from "@/lib/server/prices";
import { getCurrentUser, type SessionUser } from "@/lib/server/session";
import { cachedViewApplies, readView, shareViewLoad, viewGeneration, writeView } from "@/lib/server/view-cache";
import { syncValuations } from "@/lib/server/valuations";

const include = {
  holdings: { orderBy: { ticker: "asc" as const } },
  incomes: { orderBy: { date: "desc" as const } },
  returnIncomes: { orderBy: [{ date: "desc" as const }, { createdAt: "desc" as const }] },
  snapshots: { where: { releasedAt: null } },
};

export type PortfolioRecord = Awaited<ReturnType<typeof ensurePortfolio>>;

function isIncomeKind(value: string): value is IncomeKind {
  return value === "dividend" || value === "interest" || value === "sale";
}

function isSleeve(value: string): value is Sleeve {
  return ["US_EQUITY", "KR_EQUITY", "BOND_10Y", "BOND_30Y", "GOLD", "BTC", "REIT", "KRW_CASH", "USD_CASH"].includes(value);
}

function migratedHolding(holding: {
  sleeve: string;
  altKind: string | null;
  ticker: string;
  currency: string;
  bondDuration: string | null;
}): { sleeve: string; bondDuration: string | null; altKind: string | null } {
  if (holding.sleeve === "ALT") {
    const sleeve = holding.altKind === "BTC" || ["BTC", "IBIT", "365550"].includes(holding.ticker) ? "BTC" : "GOLD";
    return { sleeve, bondDuration: null, altKind: sleeve };
  }
  if (holding.sleeve === "CASH") {
    return { sleeve: holding.currency === "USD" ? "USD_CASH" : "KRW_CASH", bondDuration: null, altKind: holding.altKind };
  }
  if (holding.sleeve === "BOND" || holding.sleeve === "BOND_10Y" || holding.sleeve === "BOND_30Y") {
    const tenYear =
      holding.sleeve === "BOND_10Y" ||
      (holding.sleeve === "BOND" && (holding.bondDuration === "SHORT" || holding.bondDuration === "Y10"));
    const sleeve = tenYear ? "BOND_10Y" : "BOND_30Y";
    return { sleeve, bondDuration: sleeve === "BOND_10Y" ? "Y10" : "Y30", altKind: null };
  }
  return { sleeve: holding.sleeve, bondDuration: holding.bondDuration, altKind: holding.altKind };
}

export function toHoldingInput(holding: PortfolioRecord["holdings"][number]): HoldingInput {
  return {
    id: holding.id,
    ticker: holding.ticker,
    name: holding.name,
    sleeve: isSleeve(holding.sleeve) ? holding.sleeve : null,
    altKind: holding.altKind === "GOLD" || holding.altKind === "BTC" ? holding.altKind : null,
    bondDuration: holding.bondDuration === "Y10" || holding.bondDuration === "Y30" ? holding.bondDuration : null,
    isCoveredCall: holding.isCoveredCall,
    quantity: holding.quantity,
    currency: holding.currency === "USD" ? "USD" : "KRW",
    price: holding.manualPrice,
    avgPrice: holding.avgPrice,
    priceSource: holding.priceSource === "manual" ? "manual" : "auto",
    priceUpdatedAt: holding.priceUpdatedAt.toISOString(),
  };
}

function exampleCreates() {
  return EXAMPLE_B1_HOLDINGS.map((holding) => ({
    ticker: holding.ticker,
    name: holding.name ?? holding.ticker,
    sleeve: holding.sleeve ?? "KRW_CASH",
    altKind: holding.altKind ?? null,
    bondDuration: holding.bondDuration ?? null,
    isCoveredCall: holding.isCoveredCall ?? false,
    quantity: holding.quantity,
    currency: holding.currency,
    manualPrice: holding.price,
    priceSource: "manual",
  }));
}

type PortfolioWriter = Prisma.TransactionClient | typeof prisma;

function emptyPortfolioData(userId: string, phase: Phase) {
  return {
    userId,
    name: "내 포트폴리오",
    phase,
    phaseSource: "admin" as const,
    fxSource: "auto",
    fxUpdatedAt: new Date(0),
  };
}

async function starterData(userId: string) {
  const setting = await getPhaseSetting();
  return emptyPortfolioData(userId, setting.phase);
}

export async function createStarterPortfolio(db: PortfolioWriter, userId: string) {
  return db.portfolio.create({ data: await starterData(userId) });
}

export async function ensurePortfolio(userId: string) {
  const existing = await prisma.portfolio.findFirst({
    where: { userId },
    orderBy: { createdAt: "asc" },
    include,
  });
  if (existing) {
    const stale = existing.holdings.filter((holding) => holding.sleeve === "ALT" || holding.sleeve === "CASH" || holding.sleeve === "BOND");
    await Promise.all(
      stale.map(async (holding) => {
        const next = migratedHolding(holding);
        if (next.sleeve === holding.sleeve && next.bondDuration === holding.bondDuration && next.altKind === holding.altKind) return;
        await prisma.holding.update({
          where: { id: holding.id },
          data: {
            sleeve: next.sleeve,
            bondDuration: next.bondDuration,
            altKind: next.altKind,
          },
        });
        holding.sleeve = next.sleeve;
        holding.bondDuration = next.bondDuration;
        holding.altKind = next.altKind;
      }),
    );
    return existing;
  }

  return prisma.portfolio.create({
    data: await starterData(userId),
    include,
  });
}

export async function getOwnedPortfolio() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (user.role === "admin") redirect("/admin");
  return ensurePortfolio(user.id);
}

export type AppView = {
  user: SessionUser;
  portfolio: PortfolioRecord;
  phase: Phase;
  phaseWhy: PhaseWhyNote;
  phaseSource: PhaseSource;
  /** 관리자 비중표에 상한을 적용한 이번 국면 목표 비중 */
  targets: Record<Sleeve, number>;
  holdings: HoldingInput[];
  month: string;
  incomes: PortfolioRecord["incomes"];
  returnIncomes: {
    id: string;
    date: string;
    kind: IncomeKind;
    currency: "KRW" | "USD";
    amount: number;
    amountKrw: number;
    note: string;
  }[];
  result: RebalanceResult;
  snapshot: PortfolioRecord["snapshots"][number] | null;
  performance: PerformanceReport;
  valuations: { date: string; totalKrw: number; flowKrw: number; incomeKrw: number }[];
  /** 날짜별 보유 수량 비교. 종목을 추가·증가·감소·정리한 기록 */
  quantityEvents: QuantityEvent[];
  /** 날짜별 보유 수량과 가격. 성과의 종목·현금 증감을 종목별로 설명한다 */
  positionDays: PositionDay[];
};

export const getView = cache(async (): Promise<AppView> => {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (user.role === "admin") redirect(user.mustChangePassword ? "/admin/password" : "/admin");
  const setting = await getPhaseSetting();
  const cached = readView<AppView>(user.id);
  if (cachedViewApplies(cached, setting.phase)) return cached;
  return shareViewLoad(user.id, () => buildView(user, setting));
});

async function buildView(user: SessionUser, setting: PhaseSettingView, attempt = 0): Promise<AppView> {
  const cached = readView<AppView>(user.id);
  if (cachedViewApplies(cached, setting.phase)) return cached;
  const gen = viewGeneration(user.id);
  const portfolio = await hydratePrices(await hydrateFx(await ensurePortfolio(user.id)));
  const phase = setting.phase;
  const phaseSource: PhaseSource = "admin";
  if (portfolio.phase !== phase || portfolio.phaseSource !== "admin") {
    await prisma.portfolio.update({
      where: { id: portfolio.id },
      data: { phase, phaseSource: "admin" },
    });
    portfolio.phase = phase;
    portfolio.phaseSource = "admin";
  }
  const targets = targetWeights(phase, setting.weights).weights;
  const holdings = portfolio.holdings.map(toHoldingInput);
  const month = currentYearMonth();
  const incomes = portfolio.incomes.filter((income) => currentYearMonth(income.date) === month);
  const result = rebalance({
    phase,
    weights: setting.weights,
    holdings,
    fx: { USDKRW: portfolio.usdKrw },
    incomes: incomes.map((income) => ({
      ticker: income.ticker,
      amountKrw: income.currency === "USD" ? Math.round(income.amount * portfolio.usdKrw) : Math.round(income.amount),
    })),
    asOf: new Date().toISOString(),
  });
  const snapshot = portfolio.snapshots.find((item) => item.activeKey === month) ?? null;
  const performance = buildPerformanceReport({
    snapshots: portfolio.snapshots.map((item) => ({
      yearMonth: item.yearMonth,
      phase: item.phase,
      booksJson: item.booksJson,
      totalKrw: item.totalKrw,
    })),
    marks: marksFromHoldings(holdings),
    fx: portfolio.usdKrw,
    currentTotalKrw: result.totalKrw,
  });
  const stored = await syncValuations(portfolio.id, {
    totalKrw: result.totalKrw,
    positions: heldPositions(holdings),
    usdKrw: portfolio.usdKrw,
    aliases: holdings,
  });
  const returnIncomes = portfolio.returnIncomes.flatMap((income) => {
    if (!isIncomeKind(income.kind)) return [];
    const currency: "KRW" | "USD" = income.currency === "USD" ? "USD" : "KRW";
    const amount = currency === "USD" ? income.amount : income.amount || income.amountKrw;
    const amountKrw = incomeToKrw(amount, currency, portfolio.usdKrw, income.amountKrw);
    return [{ id: income.id, date: income.date, kind: income.kind, currency, amount, amountKrw, note: income.note }];
  });
  const valuations = applyIncome(
    stored.map((day) => ({ date: day.date, totalKrw: day.totalKrw, flowKrw: day.flowKrw })),
    returnIncomes,
  );
  const positionDays: PositionDay[] = stored.map((day) => ({
    date: day.date,
    totalKrw: day.totalKrw,
    flowKrw: day.flowKrw,
    positions: readPositions(day.positionsJson),
  }));
  const changes = quantityEvents(
    positionDays.map((day) => ({
      date: day.date,
      positions: day.positions?.map((position) => ({
        ticker: position.ticker,
        quantity: position.quantity,
      })) ?? null,
    })),
    holdings,
  );
  const view = {
    user,
    portfolio,
    phase,
    phaseWhy: setting.whys[phase],
    phaseSource,
    targets,
    holdings,
    month,
    incomes,
    returnIncomes,
    result,
    snapshot,
    performance,
    valuations,
    quantityEvents: changes,
    positionDays,
  };
  if (attempt < 2 && gen !== viewGeneration(user.id)) return buildView(user, await getPhaseSetting(), attempt + 1);
  writeView(user.id, view, gen);
  return view;
}

export async function replaceWithExample(portfolioId: string) {
  const setting = await getPhaseSetting();
  await prisma.$transaction([
    prisma.holding.deleteMany({ where: { portfolioId } }),
    prisma.incomeEvent.deleteMany({ where: { portfolioId } }),
    prisma.returnIncome.deleteMany({ where: { portfolioId } }),
    prisma.portfolio.update({
      where: { id: portfolioId },
      data: {
        name: "예시 포트폴리오",
        phase: setting.phase,
        phaseSource: "admin",
        usdKrw: EXAMPLE_FX,
        fxSource: "manual",
        fxUpdatedAt: new Date(),
        holdings: { create: exampleCreates() },
      },
    }),
  ]);
}
