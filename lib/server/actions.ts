"use server";

import { revalidatePath } from "next/cache";
import { unstable_rethrow } from "next/navigation";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { buildAdjustmentBooks } from "@/lib/engine/books";
import { classify, normalizeTicker } from "@/lib/engine/classify";
import { isFundSleeve } from "@/lib/engine/config";
import { INCOME_KINDS } from "@/lib/engine/history";
import { emptyMessage } from "@/lib/engine/rebalance";
import { incomeMoney } from "@/lib/engine/value";
import { buildSnapshotPayload } from "@/lib/engine/snapshot";
import { latestUsdKrw } from "@/lib/server/fx";
import { forceRefreshLiveMarks } from "@/lib/server/live-marks";
import { lookupName, requireQuote, searchSecurities, searchSecurity } from "@/lib/server/prices";
import type { SecurityMatch } from "@/lib/quotes/parse";
import { isPlainCashTicker } from "@/lib/quotes/symbol";
import { getCurrentUser } from "@/lib/server/session";
import { getOwnedPortfolio, getView, replaceWithExample } from "@/lib/server/portfolio";
import { forgetViews } from "@/lib/server/view-cache";

const sleeveSchema = z.enum(["US_EQUITY", "KR_EQUITY", "BOND_10Y", "BOND_30Y", "GOLD", "BTC", "REIT", "FUND", "KRW_CASH", "USD_CASH"]);
const currencySchema = z.enum(["KRW", "USD"]);

export type ActionResult = { ok: true; message?: string } | { ok: false; message: string };

function refresh(userId?: string | null) {
  if (userId) forgetViews(userId);
  else forgetViews();
  revalidatePath("/", "layout");
}

function fail(error: unknown): ActionResult {
  unstable_rethrow(error);
  if (error instanceof z.ZodError) return { ok: false, message: "입력값을 다시 확인해 주세요." };
  if (error instanceof Error) return { ok: false, message: error.message };
  return { ok: false, message: "저장하지 못했습니다." };
}

/** 30분마다 현재 화면의 시세와 환율을 다시 받는다. 탭 이동에서는 호출하지 않는다. */
export async function refreshQuotesAndFx(): Promise<ActionResult> {
  try {
    const user = await getCurrentUser();
    if (!user || user.role === "admin") return { ok: true };
    await forceRefreshLiveMarks(user.id);
    refresh(user.id);
    return { ok: true };
  } catch (error) {
    return fail(error);
  }
}

const fxSchema = z.object({
  usdKrw: z.coerce.number().positive(),
});

export async function setFx(input: { usdKrw: number }): Promise<ActionResult> {
  try {
    const parsed = fxSchema.parse(input);
    const portfolio = await getOwnedPortfolio();
    await prisma.portfolio.update({
      where: { id: portfolio.id },
      data: { usdKrw: parsed.usdKrw, fxSource: "manual", fxUpdatedAt: new Date() },
    });
    refresh(portfolio.userId);
    return { ok: true };
  } catch (error) {
    return fail(error);
  }
}

export async function followAutoFx(): Promise<ActionResult> {
  try {
    const portfolio = await getOwnedPortfolio();
    await prisma.portfolio.update({
      where: { id: portfolio.id },
      data: { fxSource: "auto" },
    });
    const quote = await latestUsdKrw();
    if (!quote?.fresh) {
      refresh(portfolio.userId);
      return { ok: false, message: "시세를 받지 못해 기존 환율을 유지합니다." };
    }
    await prisma.portfolio.update({
      where: { id: portfolio.id },
      data: { usdKrw: quote.rate, fxUpdatedAt: new Date() },
    });
    refresh(portfolio.userId);
    return { ok: true };
  } catch (error) {
    return fail(error);
  }
}

const holdingSchema = z.object({
  ticker: z.string().trim().min(1).max(80),
  quantity: z.coerce.number().positive(),
  currency: currencySchema,
  price: z.coerce.number().positive().optional(),
  avgPrice: z.coerce.number().positive().optional(),
  sleeve: sleeveSchema,
  isCoveredCall: z.boolean().optional(),
});

const quoteSchema = z.object({
  ticker: z.string().trim().min(1).max(20),
  price: z.coerce.number().positive(),
  currency: currencySchema,
  sleeve: sleeveSchema,
});

export async function saveQuotePrice(input: z.input<typeof quoteSchema>): Promise<ActionResult> {
  try {
    const parsed = quoteSchema.parse(input);
    const ticker = normalizeTicker(parsed.ticker);
    const known = classify(ticker);
    const portfolio = await getOwnedPortfolio();
    const existing = await prisma.holding.findUnique({
      where: { portfolioId_ticker: { portfolioId: portfolio.id, ticker } },
    });
    const sleeve = parsed.sleeve;
    const data = {
      name: known.name ?? existing?.name ?? ticker,
      sleeve,
      altKind: sleeve === "GOLD" ? "GOLD" : sleeve === "BTC" ? "BTC" : null,
      bondDuration: sleeve === "BOND_10Y" ? "Y10" : sleeve === "BOND_30Y" ? "Y30" : null,
      isCoveredCall: existing?.isCoveredCall ?? false,
      currency: parsed.currency,
      manualPrice: parsed.price,
      priceUpdatedAt: new Date(),
    };
    if (existing && existing.quantity > 0) {
      await prisma.holding.update({ where: { id: existing.id }, data });
    } else {
      await prisma.holding.upsert({
        where: { portfolioId_ticker: { portfolioId: portfolio.id, ticker } },
        create: { ...data, ticker, quantity: 0, portfolioId: portfolio.id },
        update: data,
      });
    }
    refresh(portfolio.userId);
    return { ok: true };
  } catch (error) {
    return fail(error);
  }
}

/** 종목 추가 입력칸의 후보. 로그인하지 않았거나 검색이 비면 빈 목록이다. */
export async function suggestSecurities(query: string): Promise<SecurityMatch[]> {
  const text = query.trim();
  if (text.length < 2 || text.length > 40) return [];
  const user = await getCurrentUser();
  if (!user || user.role === "admin") return [];
  return searchSecurities(text);
}

export async function saveHolding(input: z.input<typeof holdingSchema>): Promise<ActionResult> {
  try {
    const parsed = holdingSchema.parse(input);
    const typed = normalizeTicker(parsed.ticker);
    const sleeve = parsed.sleeve;
    const portfolio = await getOwnedPortfolio();
    const fund = isFundSleeve(sleeve);
    const cash = !fund && (sleeve === "KRW_CASH" || sleeve === "USD_CASH") && isPlainCashTicker(parsed.ticker);
    const adding = parsed.price == null;
    if (fund && !(parsed.price && parsed.price > 0)) {
      return { ok: false, message: "평가금액을 입력해 주세요." };
    }
    if (fund && !(parsed.avgPrice && parsed.avgPrice > 0)) {
      return { ok: false, message: "손익은 평가금액보다 작아야 합니다." };
    }
    if (!cash && !fund && adding && !(parsed.avgPrice && parsed.avgPrice > 0)) {
      return { ok: false, message: "평균단가를 입력해 주세요." };
    }
    const match = cash || fund || classify(typed).sleeve ? null : await searchSecurity(parsed.ticker);
    const ticker = match ? normalizeTicker(match.code) : typed;
    const known = classify(ticker);
    if (match && ticker !== typed) {
      const duplicate = await prisma.holding.findUnique({
        where: { portfolioId_ticker: { portfolioId: portfolio.id, ticker } },
        select: { id: true },
      });
      if (duplicate) {
        return { ok: false, message: `이미 있는 종목입니다(${match.name}-${ticker}). 목록의 수정으로 바꿔 주세요.` };
      }
    }
    let currency: "KRW" | "USD" = fund ? "KRW" : match && adding ? (match.market === "US" ? "USD" : "KRW") : parsed.currency;
    let price: number | null = cash ? 1 : (parsed.price ?? null);
    if (!cash && !fund && price == null) {
      const quote = await requireQuote(ticker);
      if (quote.status !== "ok") {
        return {
          ok: false,
          message:
            quote.status === "missing"
              ? "없는 종목입니다. 티커나 종목명을 다시 확인해 주세요."
              : "시세를 확인하지 못했습니다. 잠시 후 다시 추가해 주세요.",
        };
      }
      price = quote.price;
      currency = quote.currency;
    }
    const existing = await prisma.holding.findUnique({
      where: { portfolioId_ticker: { portfolioId: portfolio.id, ticker } },
      select: { name: true },
    });
    const savedName = existing?.name && existing.name !== ticker ? existing.name : null;
    const name = fund ? parsed.ticker : (known.name ?? match?.name ?? savedName ?? (cash ? null : await lookupName(ticker)) ?? ticker);
    const data = {
      ticker,
      name,
      sleeve,
      altKind: sleeve === "GOLD" ? "GOLD" : sleeve === "BTC" ? "BTC" : null,
      bondDuration: sleeve === "BOND_10Y" ? "Y10" : sleeve === "BOND_30Y" ? "Y30" : null,
      isCoveredCall: sleeve === "US_EQUITY" ? (parsed.isCoveredCall ?? known.isCoveredCall) : false,
      quantity: fund ? 1 : parsed.quantity,
      currency,
      avgPrice: cash ? null : (parsed.avgPrice ?? (adding ? null : undefined)),
      manualPrice: price,
      priceUpdatedAt: new Date(),
      ...(fund ? { priceSource: "manual" as const } : {}),
    };
    await prisma.holding.upsert({
      where: { portfolioId_ticker: { portfolioId: portfolio.id, ticker } },
      create: { ...data, portfolioId: portfolio.id },
      update: data,
    });
    if (ticker !== typed) {
      await prisma.holding.deleteMany({ where: { portfolioId: portfolio.id, ticker: typed } });
    }
    refresh(portfolio.userId);
    if (match && ticker !== typed) return { ok: true, message: `${match.name}-${ticker}(으)로 저장했습니다.` };
    return { ok: true };
  } catch (error) {
    return fail(error);
  }
}

export async function deleteHolding(id: string): Promise<ActionResult> {
  try {
    const portfolio = await getOwnedPortfolio();
    await prisma.holding.deleteMany({ where: { id, portfolioId: portfolio.id } });
    refresh(portfolio.userId);
    return { ok: true };
  } catch (error) {
    return fail(error);
  }
}

const incomeSchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  ticker: z.string().trim().min(1).max(20),
  amount: z.coerce.number().positive(),
  currency: currencySchema,
});

export async function addIncome(input: z.input<typeof incomeSchema>): Promise<ActionResult> {
  try {
    const parsed = incomeSchema.parse(input);
    const portfolio = await getOwnedPortfolio();
    await prisma.incomeEvent.create({
      data: {
        portfolioId: portfolio.id,
        date: new Date(`${parsed.date}T12:00:00+09:00`),
        ticker: normalizeTicker(parsed.ticker),
        amount: parsed.amount,
        currency: parsed.currency,
      },
    });
    refresh(portfolio.userId);
    return { ok: true };
  } catch (error) {
    return fail(error);
  }
}

const returnIncomeSchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  kind: z.enum(INCOME_KINDS),
  currency: currencySchema,
  amount: z.coerce.number().finite(),
  note: z.string().trim().max(40).optional(),
});

const updateReturnIncomeSchema = returnIncomeSchema.extend({
  id: z.string().min(1),
});

function returnIncomeMoney(
  parsed: z.infer<typeof returnIncomeSchema>,
  usdKrw: number,
): { ok: true; amount: number; amountKrw: number } | { ok: false; message: string } {
  if (parsed.amount === 0) return { ok: false, message: "0이 아닌 금액을 입력해 주세요." };
  if (parsed.kind !== "sale" && parsed.amount < 0) {
    return { ok: false, message: "배당과 이자는 0보다 큰 금액만 입력할 수 있습니다." };
  }
  const money = incomeMoney(parsed.amount, parsed.currency, usdKrw);
  if (!money) {
    if (parsed.currency === "USD" && !(usdKrw > 0)) {
      return { ok: false, message: "달러는 현재 환율이 있어야 원화로 바꿀 수 있습니다." };
    }
    return { ok: false, message: "금액을 다시 확인해 주세요." };
  }
  return { ok: true, amount: money.amount, amountKrw: money.amountKrw };
}

export async function addReturnIncome(input: z.input<typeof returnIncomeSchema>): Promise<ActionResult> {
  try {
    const parsed = returnIncomeSchema.parse(input);
    const portfolio = await getOwnedPortfolio();
    const money = returnIncomeMoney(parsed, portfolio.usdKrw);
    if (!money.ok) return money;
    await prisma.returnIncome.create({
      data: {
        portfolioId: portfolio.id,
        date: parsed.date,
        kind: parsed.kind,
        currency: parsed.currency,
        amount: money.amount,
        amountKrw: money.amountKrw,
        note: parsed.note ?? "",
      },
    });
    refresh(portfolio.userId);
    return { ok: true };
  } catch (error) {
    return fail(error);
  }
}

export async function updateReturnIncome(input: z.input<typeof updateReturnIncomeSchema>): Promise<ActionResult> {
  try {
    const parsed = updateReturnIncomeSchema.parse(input);
    const portfolio = await getOwnedPortfolio();
    const money = returnIncomeMoney(parsed, portfolio.usdKrw);
    if (!money.ok) return money;
    const result = await prisma.returnIncome.updateMany({
      where: { id: parsed.id, portfolioId: portfolio.id },
      data: {
        date: parsed.date,
        kind: parsed.kind,
        currency: parsed.currency,
        amount: money.amount,
        amountKrw: money.amountKrw,
        note: parsed.note ?? "",
      },
    });
    if (result.count === 0) return { ok: false, message: "기록을 찾지 못했습니다." };
    refresh(portfolio.userId);
    return { ok: true };
  } catch (error) {
    return fail(error);
  }
}

export async function deleteReturnIncome(id: string): Promise<ActionResult> {
  try {
    const portfolio = await getOwnedPortfolio();
    await prisma.returnIncome.deleteMany({ where: { id, portfolioId: portfolio.id } });
    refresh(portfolio.userId);
    return { ok: true };
  } catch (error) {
    return fail(error);
  }
}

export async function deleteIncome(id: string): Promise<ActionResult> {
  try {
    const portfolio = await getOwnedPortfolio();
    await prisma.incomeEvent.deleteMany({ where: { id, portfolioId: portfolio.id } });
    refresh(portfolio.userId);
    return { ok: true };
  } catch (error) {
    return fail(error);
  }
}

export async function confirmMonth(): Promise<ActionResult> {
  try {
    const view = await getView();
    if (view.snapshot) return { ok: false, message: "이번 달은 이미 기록되어 있습니다." };
    const blocked = emptyMessage(view.result);
    if (blocked) return { ok: false, message: blocked };
    const books = buildAdjustmentBooks({
      holdings: view.holdings,
      incomeKrw: view.result.incomeKrw,
      orders: view.result.orders,
      usdKrw: view.portfolio.usdKrw,
    });
    const payload = buildSnapshotPayload(
      view.result,
      {
        yearMonth: view.month,
        phase: view.phase,
        phaseSource: view.phaseSource,
      },
      books,
    );
    await prisma.rebalanceSnapshot.create({
      data: {
        portfolioId: view.portfolio.id,
        yearMonth: payload.yearMonth,
        activeKey: payload.yearMonth,
        phase: payload.phase,
        phaseSource: payload.phaseSource,
        totalKrw: payload.totalKrw,
        sleevesJson: payload.sleevesJson,
        targetsJson: payload.targetsJson,
        linesJson: payload.linesJson,
        booksJson: payload.booksJson,
        incomeKrw: payload.incomeKrw,
      },
    });
    refresh(view.user.id);
    return { ok: true };
  } catch (error) {
    return fail(error);
  }
}

export async function releaseMonth(): Promise<ActionResult> {
  try {
    const view = await getView();
    if (!view.snapshot) return { ok: false, message: "해제할 기록이 없습니다." };
    await prisma.rebalanceSnapshot.update({
      where: { id: view.snapshot.id },
      data: { activeKey: null, releasedAt: new Date() },
    });
    refresh(view.user.id);
    return { ok: true };
  } catch (error) {
    return fail(error);
  }
}

export async function loadExample(): Promise<ActionResult> {
  try {
    const portfolio = await getOwnedPortfolio();
    await replaceWithExample(portfolio.id);
    refresh(portfolio.userId);
    return { ok: true };
  } catch (error) {
    return fail(error);
  }
}

export async function clearHoldings(): Promise<ActionResult> {
  try {
    const portfolio = await getOwnedPortfolio();
    await prisma.$transaction([
      prisma.holding.deleteMany({ where: { portfolioId: portfolio.id } }),
      prisma.incomeEvent.deleteMany({ where: { portfolioId: portfolio.id } }),
      prisma.returnIncome.deleteMany({ where: { portfolioId: portfolio.id } }),
      prisma.portfolio.update({
        where: { id: portfolio.id },
        data: { name: "내 포트폴리오" },
      }),
    ]);
    refresh(portfolio.userId);
    return { ok: true };
  } catch (error) {
    return fail(error);
  }
}
