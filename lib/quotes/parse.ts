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

/** 네이버 종목 검색 응답에서 한국·미국 종목을 나온 순서대로 고른다. 같은 코드는 한 번만 둔다. */
export function parseNaverSearchList(payload: unknown): SecurityMatch[] {
  const items = (payload as { items?: unknown } | null)?.items;
  if (!Array.isArray(items)) return [];
  const matches: SecurityMatch[] = [];
  const seen = new Set<string>();
  for (const item of items) {
    if (!item || typeof item !== "object") continue;
    const { code, name, nationCode } = item as { code?: unknown; name?: unknown; nationCode?: unknown };
    const market = nationCode === "KOR" ? "KR" : nationCode === "USA" ? "US" : null;
    const cleaned = cleanName(name);
    const ticker = typeof code === "string" ? code.trim().toUpperCase() : "";
    if (!market || !ticker || !cleaned || seen.has(ticker)) continue;
    seen.add(ticker);
    matches.push({ code: ticker, name: cleaned, market });
  }
  return matches;
}

/** 네이버 종목 검색 응답에서 한국·미국 종목을 고른다. 이름이 정확히 같은 종목을 먼저 쓴다. */
export function parseNaverSearch(payload: unknown, query: string): SecurityMatch | null {
  const matches = parseNaverSearchList(payload);
  const wanted = query.trim().replace(/\s+/g, "").toUpperCase();
  return matches.find((match) => match.name.replace(/\s+/g, "").toUpperCase() === wanted) ?? matches[0] ?? null;
}

/** '커버드콜'을 '커버트콜'로 적은 것처럼, 드와 트가 한 곳만 다른 검색어를 만든다. */
export function deutTeuVariants(query: string): string[] {
  const text = query.trim();
  const chars = [...text];
  const variants: string[] = [];
  const seen = new Set<string>([text]);
  chars.forEach((char, index) => {
    const swap = char === "드" ? "트" : char === "트" ? "드" : null;
    if (!swap || variants.length >= 4) return;
    const next = chars.slice();
    next[index] = swap;
    const value = next.join("");
    if (seen.has(value)) return;
    seen.add(value);
    variants.push(value);
  });
  return variants;
}

/** 공백을 뺀 이름이 드와 트 한 글자만 다르면 true다. */
export function differsByOneDeutTeu(left: string, right: string): boolean {
  const a = left.trim().replace(/\s+/g, "").toUpperCase();
  const b = right.trim().replace(/\s+/g, "").toUpperCase();
  if (a.length !== b.length || a === b) return false;
  let diffs = 0;
  for (let index = 0; index < a.length; index += 1) {
    if (a[index] === b[index]) continue;
    const pair = `${a[index]}${b[index]}`;
    if (pair !== "드트" && pair !== "트드") return false;
    diffs += 1;
    if (diffs > 1) return false;
  }
  return diffs === 1;
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
