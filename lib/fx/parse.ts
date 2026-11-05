/** 야후 KRW=X 차트 응답에서 1달러당 원화 가격을 읽는다. 외부 요청은 하지 않는다. */
export function parseYahooUsdKrw(payload: unknown): number | null {
  if (!payload || typeof payload !== "object") return null;
  const chart = (payload as { chart?: unknown }).chart;
  if (!chart || typeof chart !== "object") return null;
  const result = (chart as { result?: unknown }).result;
  const first = Array.isArray(result) ? result[0] : null;
  if (!first || typeof first !== "object") return null;

  const meta = (first as { meta?: unknown }).meta;
  const market =
    meta && typeof meta === "object" ? (meta as { regularMarketPrice?: unknown }).regularMarketPrice : undefined;
  const marketRate = finiteRate(market);
  if (marketRate != null) return marketRate;

  const indicators = (first as { indicators?: unknown }).indicators;
  const quote =
    indicators && typeof indicators === "object" ? (indicators as { quote?: unknown }).quote : undefined;
  const closes =
    Array.isArray(quote) && quote[0] && typeof quote[0] === "object"
      ? (quote[0] as { close?: unknown }).close
      : undefined;
  if (!Array.isArray(closes)) return null;
  for (let index = closes.length - 1; index >= 0; index -= 1) {
    const close = finiteRate(closes[index]);
    if (close != null) return close;
  }
  return null;
}

function finiteRate(value: unknown): number | null {
  if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) return null;
  return Math.round(value * 100) / 100;
}
