import { classify, normalizeTicker } from "@/lib/engine/classify";
import { PHASE_META, SLEEVE_LABEL, isFundSleeve } from "@/lib/engine/config";
import type { Currency, HoldingInput, Phase, RebalanceResult, Sleeve, SleeveSnapshot } from "@/lib/engine/types";
import { valueKrw } from "@/lib/engine/value";
import type { PickPrefs } from "@/lib/engine/pick-prefs";
import type { RecommendAddSeed } from "@/lib/recommendations";
import { isKrCode } from "@/lib/quotes/symbol";

/** 한 자산군에서 Claude에 보여주는 보유 종목 상한. */
export const PICK_HOLDING_LIMIT = 8;

/** 자산군마다 받는 추천 종목 상한. */
export const PICK_PER_SLEEVE = 3;

export const SLEEVE_INSTRUMENT: Record<Sleeve, string> = {
  US_EQUITY: "미국 상장 주식 또는 미국 주식 ETF",
  KR_EQUITY: "한국 상장 주식 또는 한국 주식 ETF. 티커는 6자리 종목코드",
  BOND_10Y: "만기 10년 안쪽의 국채 ETF",
  BOND_30Y: "만기 20년 이상의 장기 국채 ETF",
  GOLD: "금 현물 ETF",
  BTC: "비트코인 현물 ETF",
  REIT: "부동산 ETF",
  FUND: "공모펀드",
  KRW_CASH: "원화 MMF 또는 초단기 채권 ETF. 티커는 6자리 종목코드",
  USD_CASH: "달러 단기국채 ETF",
};

export type PickHolding = {
  ticker: string;
  name: string;
  valueKrw: number;
};

export type PickBuy = {
  sleeve: Sleeve;
  label: string;
  instrument: string;
  /** 현재 비중 − 목표 비중(%p). 부족이면 음수. */
  gapPp: number;
  buyKrw: number;
  holdings: PickHolding[];
};

export type PickSell = {
  sleeve: Sleeve;
  label: string;
  /** 현재 비중 − 목표 비중(%p). 넘치면 양수. */
  gapPp: number;
  sellKrw: number;
  holdings: PickHolding[];
};

export type PickSnapshot = {
  phase: { id: Phase; name: string };
  buys: PickBuy[];
  /** 이 추천을 고를 때 쓴 기준. 예전 저장본에는 없다. */
  prefs?: PickPrefs;
};

export function pickSnapshot(
  phase: Phase,
  holdings: HoldingInput[],
  result: RebalanceResult,
  usdKrw: number,
  prefs?: PickPrefs | null,
): PickSnapshot {
  return {
    phase: { id: phase, name: PHASE_META[phase].name },
    buys: pickBuys(holdings, result.sleeves, usdKrw),
    ...(prefs ? { prefs } : {}),
  };
}

/** 2%p를 넘어 부족한 자산군만 남긴다. 살 금액은 엔진의 tradeKrw다. */
export function pickBuys(holdings: HoldingInput[], sleeves: SleeveSnapshot[], usdKrw: number): PickBuy[] {
  return sleeves
    .filter((sleeve) => sleeve.status === "under" && sleeve.tradeKrw > 0 && !isFundSleeve(sleeve.sleeve))
    .map((sleeve) => ({
      sleeve: sleeve.sleeve,
      label: SLEEVE_LABEL[sleeve.sleeve],
      instrument: SLEEVE_INSTRUMENT[sleeve.sleeve],
      gapPp: round1(sleeve.gapPp),
      buyKrw: sleeve.tradeKrw,
      holdings: holdingsInSleeve(holdings, sleeve.sleeve, usdKrw),
    }))
    .sort((a, b) => b.buyKrw - a.buyKrw || a.sleeve.localeCompare(b.sleeve));
}

/** 2%p를 넘어 넘치는 자산군만 남긴다. 줄일 금액은 엔진의 tradeKrw 절대값이다. */
export function pickSells(holdings: HoldingInput[], sleeves: SleeveSnapshot[], usdKrw: number): PickSell[] {
  return sleeves
    .filter((sleeve) => sleeve.status === "over" && sleeve.tradeKrw < 0 && !isFundSleeve(sleeve.sleeve))
    .map((sleeve) => ({
      sleeve: sleeve.sleeve,
      label: SLEEVE_LABEL[sleeve.sleeve],
      gapPp: round1(sleeve.gapPp),
      sellKrw: Math.abs(sleeve.tradeKrw),
      holdings: holdingsInSleeve(holdings, sleeve.sleeve, usdKrw),
    }))
    .sort((a, b) => b.sellKrw - a.sellKrw || a.sleeve.localeCompare(b.sleeve));
}

function holdingsInSleeve(holdings: HoldingInput[], sleeve: Sleeve, usdKrw: number): PickHolding[] {
  const rows: PickHolding[] = [];
  for (const holding of holdings) {
    if (holding.sleeve !== sleeve) continue;
    const value = valueKrw(holding, usdKrw);
    const ticker = normalizeTicker(holding.ticker);
    if (value == null || value <= 0 || !ticker) continue;
    rows.push({ ticker, name: holding.name?.trim() || ticker, valueKrw: value });
  }
  return rows.sort((a, b) => b.valueKrw - a.valueKrw || a.ticker.localeCompare(b.ticker)).slice(0, PICK_HOLDING_LIMIT);
}

export function cleanPickTicker(raw: string): string | null {
  const key = normalizeTicker(raw);
  if (/^\d[0-9A-Z]{5}$/.test(key)) return key;
  if (/^[A-Z][A-Z0-9.-]{0,9}$/.test(key) && !key.endsWith(".") && !key.includes("..")) return key;
  return null;
}

/** 추천 종목을 자산 추가 폼에 넣을 값. 자산군은 괴리에서 산 칸을 유지한다. */
export function pickAddSeed(sleeve: Sleeve, ticker: string): RecommendAddSeed | null {
  const key = cleanPickTicker(ticker);
  if (!key) return null;
  const known = classify(key);
  const currency: Currency = known.market === "US" ? "USD" : known.market === "KR" || isKrCode(key) || sleeve === "KR_EQUITY" || sleeve === "KRW_CASH" ? "KRW" : "USD";
  return { ticker: key, sleeve, currency };
}

function round1(value: number): number {
  return Math.round(value * 10) / 10;
}
