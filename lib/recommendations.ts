import { classify } from "@/lib/engine/classify";
import { isCashSleeve } from "@/lib/engine/config";
import { SLEEVES, type Currency, type Sleeve } from "@/lib/engine/types";
import { isKrCode } from "@/lib/quotes/symbol";

export const RECOMMEND_CATEGORIES = ["US_STOCK", "KR_STOCK", "BOND_ETF", "GOLD_ETF", "REIT_ETF", "CASH_ETF"] as const;

export type RecommendCategory = (typeof RECOMMEND_CATEGORIES)[number];

export const RECOMMEND_LABEL: Record<RecommendCategory, string> = {
  US_STOCK: "미국주식",
  KR_STOCK: "한국주식",
  BOND_ETF: "채권 ETF",
  GOLD_ETF: "금 ETF",
  REIT_ETF: "부동산 ETF",
  CASH_ETF: "현금 ETF",
};

export const RECOMMEND_MAX_ITEMS = 20;

export type RecommendItem = { ticker: string; name: string; note: string };

export type RecommendItems = Record<RecommendCategory, RecommendItem[]>;

const CATEGORY_SLEEVE: Record<RecommendCategory, Sleeve> = {
  US_STOCK: "US_EQUITY",
  KR_STOCK: "KR_EQUITY",
  BOND_ETF: "BOND_10Y",
  GOLD_ETF: "GOLD",
  REIT_ETF: "REIT",
  CASH_ETF: "KRW_CASH",
};

export type RecommendAddSeed = {
  ticker: string;
  sleeve: Sleeve;
  currency: Currency;
};

function recommendCurrency(category: RecommendCategory, item: RecommendItem, ticker: string): Currency {
  const known = classify(ticker);
  if (known.market === "KR") return "KRW";
  if (known.market === "US") return "USD";
  if (category === "KR_STOCK" || isKrCode(ticker)) return "KRW";
  if (category === "CASH_ETF" && /[ㄱ-ㅎ가-힣]/.test(`${item.ticker}${item.name}`)) return "KRW";
  return "USD";
}

/** 추천 종목을 자산 추가 폼에 넣을 값으로 바꾼다. 알려진 티커는 자산군·통화를 그 분류로 덮는다. 현금 ETF는 종목을 유지한 채 현금으로 센다. */
export function recommendAddSeed(category: RecommendCategory, item: RecommendItem): RecommendAddSeed | null {
  const ticker = (item.ticker || item.name).trim();
  if (!ticker) return null;
  const known = classify(ticker);
  const currency = recommendCurrency(category, item, ticker);
  if (category === "CASH_ETF") {
    return { ticker, sleeve: currency === "USD" ? "USD_CASH" : "KRW_CASH", currency };
  }
  const sleeve = known.sleeve && !isCashSleeve(known.sleeve) ? known.sleeve : CATEGORY_SLEEVE[category];
  return { ticker, sleeve, currency };
}

export function recommendAddHref(seed: RecommendAddSeed): string {
  const params = new URLSearchParams({
    ticker: seed.ticker,
    sleeve: seed.sleeve,
    currency: seed.currency,
  });
  return `/portfolio?${params.toString()}`;
}

export function parseRecommendAddSeed(params: {
  ticker?: string | string[];
  sleeve?: string | string[];
  currency?: string | string[];
}): RecommendAddSeed | null {
  const ticker = (Array.isArray(params.ticker) ? params.ticker[0] : params.ticker)?.trim();
  const sleeve = Array.isArray(params.sleeve) ? params.sleeve[0] : params.sleeve;
  const currency = Array.isArray(params.currency) ? params.currency[0] : params.currency;
  if (!ticker || !sleeve || (currency !== "KRW" && currency !== "USD")) return null;
  if (!(SLEEVES as readonly string[]).includes(sleeve)) return null;
  return { ticker, sleeve: sleeve as Sleeve, currency };
}

export function emptyRecommendItems(): RecommendItems {
  return Object.fromEntries(RECOMMEND_CATEGORIES.map((category) => [category, []])) as unknown as RecommendItems;
}

export function parseRecommendItems(json: string): RecommendItems {
  const out = emptyRecommendItems();
  if (!json) return out;
  try {
    const raw = JSON.parse(json) as Record<string, unknown>;
    for (const category of RECOMMEND_CATEGORIES) {
      const rows = raw?.[category];
      if (!Array.isArray(rows)) continue;
      out[category] = rows
        .map((row) => ({
          ticker: String(row?.ticker ?? "").trim(),
          name: String(row?.name ?? "").trim(),
          note: String(row?.note ?? "").trim(),
        }))
        .filter((row) => row.ticker || row.name);
    }
    return out;
  } catch {
    return out;
  }
}
