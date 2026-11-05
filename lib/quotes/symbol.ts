import { classify, normalizeTicker } from "@/lib/engine/classify";

const CASH_TICKERS = new Set(["CASH", "MMF", "USD"]);

/** 한국 종목코드. 숫자 6자리 외에 0162Z0처럼 영문이 섞인 신규 코드도 있다. */
export function isKrCode(ticker: string): boolean {
  return /^\d[0-9A-Z]{5}$/.test(normalizeTicker(ticker));
}

/** 보유 티커를 야후 차트 심볼 후보로 바꾼다. 현금과 종목 코드가 아닌 이름은 빈 배열이다. */
export function yahooSymbols(ticker: string): string[] {
  const key = normalizeTicker(ticker);
  if (!key || CASH_TICKERS.has(key)) return [];
  if (key === "BTC") return ["BTC-USD"];
  const known = classify(key);
  if (known.sleeve === "KRW_CASH" || known.sleeve === "USD_CASH") return [];
  if (known.market === "KR" || isKrCode(key)) return [`${key}.KS`, `${key}.KQ`];
  if (known.market === "US" || /^[A-Z][A-Z0-9.-]{0,9}$/.test(key)) return [key];
  return [];
}

export function acceptsAutoQuote(
  holding: { priceSource: string; currency: string; sleeve: string; ticker: string },
  quote: { fresh: boolean; currency: string } | null,
): boolean {
  if (holding.priceSource === "manual") return false;
  if (holding.sleeve === "KRW_CASH" || holding.sleeve === "USD_CASH") return false;
  if (yahooSymbols(holding.ticker).length === 0) return false;
  if (!quote?.fresh) return false;
  return quote.currency === holding.currency;
}
