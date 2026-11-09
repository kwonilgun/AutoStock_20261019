import { classify, normalizeTicker } from "@/lib/engine/classify";

const CASH_TICKERS = new Set(["CASH", "MMF", "USD"]);

/** 금액만 넣는 현금. 초단기 ETF처럼 종목이 있는 현금은 여기 넣지 않는다. */
export function isPlainCashTicker(ticker: string): boolean {
  return CASH_TICKERS.has(normalizeTicker(ticker));
}

/** 한국 종목코드. 숫자 6자리 외에 0162Z0처럼 영문이 섞인 신규 코드도 있다. */
export function isKrCode(ticker: string): boolean {
  return /^\d[0-9A-Z]{5}$/.test(normalizeTicker(ticker));
}

/** 보유 티커를 야후 차트 심볼 후보로 바꾼다. 현금과 종목 코드가 아닌 이름은 빈 배열이다. */
export function yahooSymbols(ticker: string): string[] {
  const key = normalizeTicker(ticker);
  if (!key || isPlainCashTicker(key)) return [];
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
  if (isPlainCashTicker(holding.ticker)) return false;
  if (yahooSymbols(holding.ticker).length === 0) return false;
  if (!quote?.fresh) return false;
  return quote.currency === holding.currency;
}
