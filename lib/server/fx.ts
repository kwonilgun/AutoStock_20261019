import { prisma } from "@/lib/db";
import { parseYahooUsdKrw } from "@/lib/fx/parse";
import { seoulDay } from "@/lib/format";

const PAIR = "USDKRW";
const SOURCE = "KRW=X";
const QUOTE_URL = "https://query1.finance.yahoo.com/v8/finance/chart/KRW=X?interval=1d&range=5d";

export type UsdKrwQuote = {
  rate: number;
  date: string;
  fresh: boolean;
};

type FxPortfolio = {
  id: string;
  fxSource: string;
  usdKrw: number;
  fxUpdatedAt: Date;
};

let fetchDay = "";

function alreadyFetchedToday() {
  return fetchDay === seoulDay();
}

function markFetchedToday() {
  fetchDay = seoulDay();
}

async function previousUsdKrw(): Promise<UsdKrwQuote | null> {
  const previous = await prisma.fxRate
    .findFirst({
      where: { pair: PAIR, rate: { gt: 0 } },
      orderBy: { date: "desc" },
    })
    .catch(() => null);
  if (!previous) return null;
  return { rate: previous.rate, date: previous.date, fresh: false };
}

async function readUsdKrw(retry: boolean, force = false): Promise<UsdKrwQuote | null> {
  const today = seoulDay();
  try {
    if (!force) {
      const cached = await prisma.fxRate.findUnique({
        where: { pair_date: { pair: PAIR, date: today } },
      });
      if (cached && cached.rate > 0) return { rate: cached.rate, date: today, fresh: true };
      if (!retry && alreadyFetchedToday()) return previousUsdKrw();
    }

    markFetchedToday();
    const response = await fetch(QUOTE_URL, {
      headers: { accept: "application/json", "user-agent": "Mozilla/5.0" },
      cache: "no-store",
      signal: AbortSignal.timeout(8000),
    });
    if (!response.ok) throw new Error("환율 응답이 없습니다.");
    const rate = parseYahooUsdKrw(await response.json());
    if (rate == null) throw new Error("환율을 읽지 못했습니다.");
    await prisma.fxRate.upsert({
      where: { pair_date: { pair: PAIR, date: today } },
      create: { pair: PAIR, date: today, rate, source: SOURCE },
      update: { rate, source: SOURCE },
    });
    return { rate, date: today, fresh: true };
  } catch {
    return previousUsdKrw();
  }
}

/** 설정에서 자동 환율을 켤 때처럼, 오늘 시세가 없으면 야후를 다시 받는다. */
export async function latestUsdKrw(): Promise<UsdKrwQuote | null> {
  return readUsdKrw(true);
}

/** 자동 환율인 포트폴리오만 오늘 시세로 바꾼다. 오늘 값이 있으면 야후를 치지 않는다. */
export async function hydrateFx<T extends FxPortfolio>(portfolio: T): Promise<T> {
  if (portfolio.fxSource !== "auto") return portfolio;
  if (seoulDay(portfolio.fxUpdatedAt) === seoulDay()) return portfolio;
  return applyQuote(portfolio, await readUsdKrw(false));
}

/**
 * 원달러 시세를 다시 받는다. freshAfter보다 나중에 받은 값이면 저장값만 쓴다.
 * 직접 고정한 환율은 바꾸지 않는다. 네트워크를 쳤으면 true다.
 */
export async function refreshFx<T extends FxPortfolio>(portfolio: T, freshAfter?: Date): Promise<boolean> {
  if (portfolio.fxSource !== "auto") return false;
  if (freshAfter && portfolio.fxUpdatedAt >= freshAfter) return false;
  const quote = await readUsdKrw(true, true);
  if (!quote?.fresh) return true;
  const next = await applyQuote(portfolio, quote);
  if (next.fxUpdatedAt.getTime() === portfolio.fxUpdatedAt.getTime()) {
    await prisma.portfolio.update({
      where: { id: portfolio.id },
      data: { fxUpdatedAt: new Date() },
    });
  }
  return true;
}

async function applyQuote<T extends FxPortfolio>(portfolio: T, quote: UsdKrwQuote | null): Promise<T> {
  if (!quote?.fresh) return portfolio;
  const sameRate = Math.round(portfolio.usdKrw * 100) === Math.round(quote.rate * 100);
  if (sameRate && seoulDay(portfolio.fxUpdatedAt) === quote.date) return portfolio;
  const updated = await prisma.portfolio.update({
    where: { id: portfolio.id },
    data: { usdKrw: quote.rate, fxUpdatedAt: new Date() },
  });
  return { ...portfolio, usdKrw: updated.usdKrw, fxUpdatedAt: updated.fxUpdatedAt };
}
