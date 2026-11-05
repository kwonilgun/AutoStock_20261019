export type MarketQuote = {
  price: number;
  currency: "KRW" | "USD";
};

/** 야후 차트 응답에서 종가와 통화를 읽는다. 외부 요청은 하지 않는다. */
export function parseYahooQuote(payload: unknown): MarketQuote | null {
  if (!payload || typeof payload !== "object") return null;
  const chart = (payload as { chart?: unknown }).chart;
  if (!chart || typeof chart !== "object") return null;
  const result = (chart as { result?: unknown }).result;
  const first = Array.isArray(result) ? result[0] : null;
  if (!first || typeof first !== "object") return null;

  const meta = (first as { meta?: unknown }).meta;
  const currency = meta && typeof meta === "object" ? quoteCurrency((meta as { currency?: unknown }).currency) : null;
  if (!currency) return null;

  const market =
    meta && typeof meta === "object" ? (meta as { regularMarketPrice?: unknown }).regularMarketPrice : undefined;
  const marketPrice = finitePrice(market);
  if (marketPrice != null) return { price: marketPrice, currency };

  const indicators = (first as { indicators?: unknown }).indicators;
  const quote =
    indicators && typeof indicators === "object" ? (indicators as { quote?: unknown }).quote : undefined;
  const closes =
    Array.isArray(quote) && quote[0] && typeof quote[0] === "object"
      ? (quote[0] as { close?: unknown }).close
      : undefined;
  if (!Array.isArray(closes)) return null;
  for (let index = closes.length - 1; index >= 0; index -= 1) {
    const close = finitePrice(closes[index]);
    if (close != null) return { price: close, currency };
  }
  return null;
}

/** 야후 차트 응답의 종목명. longName을 먼저 쓴다. */
export function parseYahooName(payload: unknown): string | null {
  const result = (payload as { chart?: { result?: unknown } } | null)?.chart?.result;
  const meta = Array.isArray(result) ? (result[0] as { meta?: unknown } | undefined)?.meta : undefined;
  if (!meta || typeof meta !== "object") return null;
  const { longName, shortName } = meta as { longName?: unknown; shortName?: unknown };
  return cleanName(longName) ?? cleanName(shortName);
}

/** 네이버 증권 basic 응답의 한글 종목명. */
export function parseNaverName(payload: unknown): string | null {
  if (!payload || typeof payload !== "object") return null;
  return cleanName((payload as { stockName?: unknown }).stockName);
}

export type SecurityMatch = { code: string; name: string; market: "KR" | "US" };

/** 네이버 종목 검색 응답에서 한국·미국 종목을 고른다. 이름이 정확히 같은 종목을 먼저 쓴다. */
export function parseNaverSearch(payload: unknown, query: string): SecurityMatch | null {
  const items = (payload as { items?: unknown } | null)?.items;
  if (!Array.isArray(items)) return null;
  const matches: SecurityMatch[] = [];
  for (const item of items) {
    if (!item || typeof item !== "object") continue;
    const { code, name, nationCode } = item as { code?: unknown; name?: unknown; nationCode?: unknown };
    const market = nationCode === "KOR" ? "KR" : nationCode === "USA" ? "US" : null;
    const cleaned = cleanName(name);
    if (!market || typeof code !== "string" || !code.trim() || !cleaned) continue;
    matches.push({ code: code.trim().toUpperCase(), name: cleaned, market });
  }
  const wanted = query.trim().replace(/\s+/g, "").toUpperCase();
  return matches.find((match) => match.name.replace(/\s+/g, "").toUpperCase() === wanted) ?? matches[0] ?? null;
}

function cleanName(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const name = value.trim().replace(/\s+/g, " ");
  return name ? name.slice(0, 80) : null;
}

function quoteCurrency(value: unknown): "KRW" | "USD" | null {
  if (value === "KRW" || value === "USD") return value;
  return null;
}

function finitePrice(value: unknown): number | null {
  if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) return null;
  return Math.round(value * 100) / 100;
}
