import { prisma } from "@/lib/db";
import { normalizeTicker } from "@/lib/engine/classify";
import { seoulDay } from "@/lib/format";
import {
  deutTeuVariants,
  differsByOneDeutTeu,
  parseNaverName,
  parseNaverSearch,
  parseNaverSearchList,
  parseYahooName,
  parseYahooQuote,
  type MarketQuote,
  type SecurityMatch,
} from "@/lib/quotes/parse";
import { acceptsAutoQuote, isKrCode, isPlainCashTicker, yahooSymbols } from "@/lib/quotes/symbol";

export type CloseQuote = MarketQuote & {
  date: string;
  fresh: boolean;
};

type PriceHolding = {
  id: string;
  ticker: string;
  name: string;
  sleeve: string;
  currency: string;
  manualPrice: number | null;
  priceSource: string;
  priceUpdatedAt: Date;
};

function autoQuoteHoldings(holdings: PriceHolding[]) {
  return holdings.filter(
    (holding) =>
      holding.priceSource !== "manual" &&
      !isPlainCashTicker(holding.ticker) &&
      yahooSymbols(holding.ticker).length > 0,
  );
}

/** 오늘 SQLite에 있는 종가만 읽는다. 야후는 치지 않는다. */
export async function storedCloses(tickers: string[]): Promise<Map<string, CloseQuote>> {
  const today = seoulDay();
  const keys = [...new Set(tickers.map((ticker) => normalizeTicker(ticker)).filter(Boolean))];
  const quotes = new Map<string, CloseQuote>();
  if (keys.length === 0) return quotes;
  const rows = await prisma.priceCache.findMany({
    where: { ticker: { in: keys }, date: today, close: { gt: 0 } },
  });
  for (const row of rows) {
    const quote = asQuote(row.currency, row.close);
    if (quote) quotes.set(row.ticker, { ...quote, date: today, fresh: true });
  }
  return quotes;
}

async function previousClose(ticker: string): Promise<CloseQuote | null> {
  const previous = await prisma.priceCache
    .findFirst({
      where: { ticker, close: { gt: 0 } },
      orderBy: { date: "desc" },
    })
    .catch(() => null);
  const quote = asQuote(previous?.currency, previous?.close);
  if (!previous || !quote) return null;
  return { ...quote, date: previous.date, fresh: false };
}

export type QuoteLookup =
  | { status: "ok"; price: number; currency: "KRW" | "USD" }
  | { status: "missing" }
  | { status: "unavailable" };

type QuoteAttempt = { status: "ok"; quote: CloseQuote } | { status: "missing" } | { status: "unavailable" };

/** 서울 날짜 기준으로 하루 한 번 종가를 받는다. 실패하면 마지막 저장값을 돌려주고 fresh는 false다. */
export async function latestClose(ticker: string): Promise<CloseQuote | null> {
  const key = normalizeTicker(ticker);
  const symbols = yahooSymbols(key);
  if (symbols.length === 0) return null;
  const today = seoulDay();
  const cached = await readTodayQuote(key, today);
  if (cached) return cached;
  const fetched = await fetchAndStore(key, symbols);
  if (fetched.status === "ok") return fetched.quote;
  return previousClose(key);
}

/** 추가 전에 종목이 있는지 확인한다. 오늘 시세가 있으면 ok, 상장 심볼이 없으면 missing이다. */
export async function requireQuote(ticker: string): Promise<QuoteLookup> {
  const key = normalizeTicker(ticker);
  const symbols = yahooSymbols(key);
  if (!key || symbols.length === 0) return { status: "missing" };
  const cached = await readTodayQuote(key, seoulDay());
  if (cached) return { status: "ok", price: cached.price, currency: cached.currency };
  const fetched = await fetchAndStore(key, symbols);
  if (fetched.status === "ok") return { status: "ok", price: fetched.quote.price, currency: fetched.quote.currency };
  return { status: fetched.status };
}

async function readTodayQuote(ticker: string, today: string): Promise<CloseQuote | null> {
  const cached = await prisma.priceCache.findUnique({
    where: { ticker_date: { ticker, date: today } },
  });
  const quote = asQuote(cached?.currency, cached?.close);
  if (!quote) return null;
  return { ...quote, date: today, fresh: true };
}

async function fetchAndStore(ticker: string, symbols: string[]): Promise<QuoteAttempt> {
  const today = seoulDay();
  let missing = false;
  let unavailable = false;
  try {
    for (const symbol of symbols) {
      const fetched = await fetchYahooDetailed(symbol);
      if (fetched.status === "missing") {
        missing = true;
        continue;
      }
      if (fetched.status === "unavailable") {
        unavailable = true;
        continue;
      }
      const quote = fetched.quote;
      await prisma.priceCache.upsert({
        where: { ticker_date: { ticker, date: today } },
        create: { ticker, date: today, currency: quote.currency, close: quote.price },
        update: { currency: quote.currency, close: quote.price },
      });
      return { status: "ok", quote: { ...quote, date: today, fresh: true } };
    }
  } catch {
    return { status: "unavailable" };
  }
  if (unavailable) return { status: "unavailable" };
  return { status: missing ? "missing" : "unavailable" };
}

/** 종목명을 찾는다. 한국 6자리 코드는 네이버 한글명을, 그 밖에는 야후 영문명을 쓴다. 못 찾으면 null이다. */
export async function lookupName(ticker: string): Promise<string | null> {
  const key = normalizeTicker(ticker);
  const symbols = yahooSymbols(key);
  if (symbols.length === 0) return null;
  try {
    if (isKrCode(key)) {
      const naver = await fetchJson(`https://m.stock.naver.com/api/stock/${key}/basic`);
      const name = parseNaverName(naver);
      if (name) return name;
    }
    for (const symbol of symbols) {
      const name = parseYahooName(await fetchJson(yahooChartUrl(symbol)));
      if (name) return name;
    }
  } catch {
    // 이름을 못 찾아도 저장은 계속한다.
  }
  return null;
}

const SUGGEST_LIMIT = 8;
const SUGGEST_TTL_MS = 60_000;
const SUGGEST_CACHE_MAX = 50;

type SuggestSlot = { at: number; rows: SecurityMatch[] };

const suggestCache = new Map<string, SuggestSlot>();

function readSuggestions(key: string): SecurityMatch[] | null {
  const slot = suggestCache.get(key);
  if (!slot) return null;
  if (Date.now() - slot.at > SUGGEST_TTL_MS) {
    suggestCache.delete(key);
    return null;
  }
  return slot.rows;
}

function writeSuggestions(key: string, rows: SecurityMatch[]) {
  if (suggestCache.size >= SUGGEST_CACHE_MAX && !suggestCache.has(key)) {
    const oldest = suggestCache.keys().next().value;
    if (oldest) suggestCache.delete(oldest);
  }
  suggestCache.set(key, { at: Date.now(), rows });
}

/** 입력 중인 종목명·코드의 한국·미국 후보. 두 글자 미만은 검색하지 않고, 같은 검색어는 1분간 기억한다. */
export async function searchSecurities(query: string): Promise<SecurityMatch[]> {
  const text = query.trim();
  if (text.length < 2) return [];
  const key = text.toLocaleLowerCase("ko-KR");
  const cached = readSuggestions(key);
  if (cached) return cached;
  try {
    const direct = parseNaverSearchList(await fetchJson(naverSearchUrl(text)));
    if (direct.length > 0) {
      const rows = direct.slice(0, SUGGEST_LIMIT);
      writeSuggestions(key, rows);
      return rows;
    }
    for (const variant of deutTeuVariants(text)) {
      const matches = parseNaverSearchList(await fetchJson(naverSearchUrl(variant))).filter((match) =>
        differsByOneDeutTeu(match.name, text),
      );
      if (matches.length > 0) {
        const rows = matches.slice(0, SUGGEST_LIMIT);
        writeSuggestions(key, rows);
        return rows;
      }
    }
    writeSuggestions(key, []);
    return [];
  } catch {
    return [];
  }
}

/** 티커 대신 '삼성전자'처럼 종목명을 넣었을 때 한국·미국 종목코드를 찾는다. 이미 티커 꼴이면 null이다. */
export async function searchSecurity(query: string): Promise<SecurityMatch | null> {
  if (yahooSymbols(query).length > 0 || !query.trim()) return null;
  try {
    const direct = parseNaverSearch(await fetchJson(naverSearchUrl(query)), query);
    if (direct) return direct;
    for (const variant of deutTeuVariants(query)) {
      const match = parseNaverSearch(await fetchJson(naverSearchUrl(variant)), variant);
      if (match && differsByOneDeutTeu(match.name, query)) return match;
    }
    return null;
  } catch {
    return null;
  }
}

function naverSearchUrl(query: string) {
  return `https://ac.stock.naver.com/ac?q=${encodeURIComponent(query.trim())}&target=stock`;
}

/** 이름이 비었거나 티커와 같은 보유에 종목명을 채운다. 이름을 하나라도 저장했으면 true다. */
async function fillMissingNames(holdings: PriceHolding[]): Promise<boolean> {
  const targets = holdings.filter((holding) => !holding.name || normalizeTicker(holding.name) === normalizeTicker(holding.ticker));
  if (targets.length === 0) return false;
  let changed = false;
  await Promise.all(
    targets.map(async (holding) => {
      const name = await lookupName(holding.ticker);
      if (!name) return;
      try {
        await prisma.holding.update({ where: { id: holding.id }, data: { name } });
        holding.name = name;
        changed = true;
      } catch {
        // 이름 저장이 실패해도 시세 갱신은 계속한다.
      }
    }),
  );
  return changed;
}

async function applyQuotes<T extends { holdings: PriceHolding[] }>(
  portfolio: T,
  quotes: Map<string, CloseQuote>,
  touch: boolean,
): Promise<T> {
  for (const holding of portfolio.holdings) {
    try {
      const quote = quotes.get(normalizeTicker(holding.ticker));
      if (!acceptsAutoQuote(holding, quote ?? null) || !quote) continue;
      const samePrice =
        holding.manualPrice != null && Math.round(holding.manualPrice * 100) === Math.round(quote.price * 100);
      if (samePrice && seoulDay(holding.priceUpdatedAt) === quote.date && !touch) continue;
      const updated = await prisma.holding.update({
        where: { id: holding.id },
        data: { manualPrice: quote.price, priceUpdatedAt: new Date() },
      });
      holding.manualPrice = updated.manualPrice;
      holding.priceUpdatedAt = updated.priceUpdatedAt;
    } catch {
      // 한 종목이 실패해도 나머지 저장값은 유지한다.
    }
  }
  return portfolio;
}

/** 자동 시세 보유 중 가장 오래전에 받은 시각. 받을 종목이 없으면 null이다. */
export function oldestAutoQuoteAt(holdings: PriceHolding[]): number | null {
  const autos = autoQuoteHoldings(holdings);
  if (autos.length === 0) return null;
  return Math.min(...autos.map((holding) => (holding.manualPrice != null ? holding.priceUpdatedAt.getTime() : 0)));
}

/**
 * 주식·채권·자산 시세를 다시 받는다. freshAfter보다 나중에 받은 종목은 저장값을 쓴다.
 * 현금과 직접 입력한 가격은 그대로 둔다. 네트워크를 쳤으면 true다.
 */
export async function refreshPrices<T extends { holdings: PriceHolding[] }>(portfolio: T, freshAfter?: Date): Promise<boolean> {
  const named = await fillMissingNames(portfolio.holdings);
  let autos = autoQuoteHoldings(portfolio.holdings);
  if (freshAfter) {
    autos = autos.filter((holding) => holding.manualPrice == null || holding.priceUpdatedAt < freshAfter);
  }
  if (autos.length === 0) return named;
  const quotes = new Map<string, CloseQuote>();
  const tickers = [...new Set(autos.map((holding) => normalizeTicker(holding.ticker)))];
  await Promise.all(
    tickers.map(async (ticker) => {
      const symbols = yahooSymbols(ticker);
      if (symbols.length === 0) return;
      const fetched = await fetchAndStore(ticker, symbols);
      if (fetched.status === "ok") quotes.set(ticker, fetched.quote);
    }),
  );
  await applyQuotes(portfolio, quotes, true);
  return true;
}

/**
 * 화면용 종가. SQLite에 있는 오늘 종가와 보유에 저장된 마지막 가격만 쓴다.
 * 야후·네이버는 호출하지 않는다. 갱신은 refreshPrices가 응답 뒤에 한다.
 */
export async function hydratePrices<T extends { holdings: PriceHolding[] }>(portfolio: T): Promise<T> {
  const autos = autoQuoteHoldings(portfolio.holdings);
  const today = seoulDay();
  if (autos.length === 0) return portfolio;
  if (autos.every((holding) => holding.manualPrice != null && seoulDay(holding.priceUpdatedAt) === today)) {
    return portfolio;
  }
  const quotes = await storedCloses(autos.map((holding) => holding.ticker));
  if (quotes.size === 0) return portfolio;
  return applyQuotes(portfolio, quotes, false);
}

function asQuote(currency: string | undefined, close: number | undefined): MarketQuote | null {
  if ((currency !== "KRW" && currency !== "USD") || close == null || !(close > 0)) return null;
  return { currency, price: close };
}

function yahooChartUrl(symbol: string) {
  return `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?interval=1d&range=5d`;
}

async function fetchJson(url: string): Promise<unknown> {
  const response = await fetch(url, {
    headers: { accept: "application/json", "user-agent": "Mozilla/5.0" },
    cache: "no-store",
    signal: AbortSignal.timeout(8000),
  });
  if (!response.ok) return null;
  return response.json();
}

async function fetchYahooDetailed(
  symbol: string,
): Promise<{ status: "ok"; quote: MarketQuote } | { status: "missing" } | { status: "unavailable" }> {
  try {
    const response = await fetch(yahooChartUrl(symbol), {
      headers: { accept: "application/json", "user-agent": "Mozilla/5.0" },
      cache: "no-store",
      signal: AbortSignal.timeout(8000),
    });
    if (response.status === 404) return { status: "missing" };
    if (!response.ok) return { status: "unavailable" };
    const quote = parseYahooQuote(await response.json());
    if (!quote) return { status: "unavailable" };
    return { status: "ok", quote };
  } catch {
    return { status: "unavailable" };
  }
}
