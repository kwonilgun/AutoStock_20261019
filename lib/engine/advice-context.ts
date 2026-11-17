import { PHASE_META, SLEEVE_LABEL } from "./config";
import { PHASE_STORY } from "./phase-story";
import type { HoldingInput, OrderAction, Phase, RebalanceResult, Sleeve, SleeveSnapshot } from "./types";
import { holdingGain, valueKrw } from "./value";

/** 모델에 넘기는 종목 줄의 상한. 자산군 합계는 이 상한과 상관없이 모두 넣는다. */
export const ADVICE_HOLDING_LIMIT = 12;

export type AdviceSleeve = {
  sleeve: Sleeve;
  label: string;
  currentWeight: number;
  targetWeight: number;
  gapPp: number;
  status: SleeveSnapshot["status"];
  gapKrw: number;
  tradeKrw: number;
};

export type AdviceHolding = {
  ticker: string;
  name: string;
  sleeve: Sleeve;
  /** 총자산 대비 비중. 0~1. */
  weight: number;
  valueKrw: number;
  /** 평균가 대비 수익률(%). 평균가가 없으면 null. */
  returnPct: number | null;
};

export type AdviceOrder = {
  action: OrderAction;
  sleeve: Sleeve;
  label: string;
  ticker: string;
  name: string;
  amountKrw: number;
};

export type AdviceHold = {
  sleeve: Sleeve;
  label: string;
  gapPp: number;
  reason: string;
};

export type AdviceDeferred = {
  sleeve: Sleeve;
  label: string;
  ticker: string;
  name: string;
  amountKrw: number;
  reason: string;
};

/** 자문 모델에 넘기는 스냅샷. 계좌 번호, 이메일, 이름은 넣지 않는다. */
export type AdviceContext = {
  asOf: string;
  phase: {
    id: Phase;
    name: string;
    environment: string;
    why: string;
    stance: string;
  };
  fx: { USDKRW: number };
  fedTarget: { low: number | null; high: number | null };
  /** 펀드를 포함한 총자산. */
  totalKrw: number;
  /**
   * 자산군 비중은 펀드를 뺀 배분 자산 기준이다.
   * gapPp는 현재 비중 − 목표 비중(%p). status가 hold 또는 match이면 매매하지 않는다.
   */
  sleeves: AdviceSleeve[];
  /** 보유 weight는 총자산 기준이다. */
  holdings: AdviceHolding[];
  orders: AdviceOrder[];
  holds: AdviceHold[];
  deferred: AdviceDeferred[];
};

export type AdviceSource = {
  asOf: string;
  phase: Phase;
  why?: string;
  stance?: string;
  usdKrw: number;
  fedLow: number | null;
  fedHigh: number | null;
  holdings: HoldingInput[];
  result: RebalanceResult;
};

export function adviceContext(source: AdviceSource): AdviceContext {
  const meta = PHASE_META[source.phase];
  const story = PHASE_STORY[source.phase];
  const totalKrw = source.result.totalKrw;
  const active = new Set(
    source.result.sleeves.filter((sleeve) => sleeve.status === "over" || sleeve.status === "under").map((sleeve) => sleeve.sleeve),
  );

  return {
    asOf: source.asOf,
    phase: {
      id: source.phase,
      name: meta.name,
      environment: meta.environment,
      why: source.why?.trim() || story.why,
      stance: source.stance?.trim() || story.stance,
    },
    fx: { USDKRW: source.usdKrw },
    fedTarget: { low: source.fedLow, high: source.fedHigh },
    totalKrw,
    sleeves: source.result.sleeves.map(sleeveLine),
    holdings: selectHoldings(pricedHoldings(source.holdings, source.usdKrw, totalKrw), active),
    orders: source.result.orders.map((order) => ({
      action: order.action,
      sleeve: order.sleeve,
      label: SLEEVE_LABEL[order.sleeve],
      ticker: order.ticker,
      name: order.name,
      amountKrw: order.amountKrw,
    })),
    holds: source.result.holds.map((hold) => ({
      sleeve: hold.sleeve,
      label: SLEEVE_LABEL[hold.sleeve],
      gapPp: round1(hold.gapPp),
      reason: hold.reason,
    })),
    deferred: source.result.deferred.map((line) => ({
      sleeve: line.sleeve,
      label: SLEEVE_LABEL[line.sleeve],
      ticker: line.ticker,
      name: line.name,
      amountKrw: line.amountKrw,
      reason: line.reason,
    })),
  };
}

function sleeveLine(sleeve: SleeveSnapshot): AdviceSleeve {
  return {
    sleeve: sleeve.sleeve,
    label: SLEEVE_LABEL[sleeve.sleeve],
    currentWeight: round4(sleeve.currentWeight),
    targetWeight: round4(sleeve.targetWeight),
    gapPp: round1(sleeve.gapPp),
    status: sleeve.status,
    gapKrw: sleeve.gapKrw,
    tradeKrw: sleeve.tradeKrw,
  };
}

function pricedHoldings(holdings: HoldingInput[], usdKrw: number, totalKrw: number): AdviceHolding[] {
  if (totalKrw <= 0) return [];
  const rows: AdviceHolding[] = [];
  for (const holding of holdings) {
    if (!holding.sleeve) continue;
    const value = valueKrw(holding, usdKrw);
    if (value == null || value <= 0) continue;
    const gain = holdingGain(holding, usdKrw);
    rows.push({
      ticker: holding.ticker.trim(),
      name: holding.name?.trim() ?? "",
      sleeve: holding.sleeve,
      weight: round4(value / totalKrw),
      valueKrw: value,
      returnPct: gain ? round1(gain.rate * 100) : null,
    });
  }
  return rows;
}

/** 평가액이 큰 종목을 남기고, 과다·부족 자산군의 대표 종목은 상한 안에서는 빠지지 않게 한다. */
function selectHoldings(rows: AdviceHolding[], active: Set<Sleeve>): AdviceHolding[] {
  const byValue = [...rows].sort((a, b) => b.valueKrw - a.valueKrw || a.ticker.localeCompare(b.ticker));
  const required: AdviceHolding[] = [];
  const seenSleeve = new Set<Sleeve>();
  for (const row of byValue) {
    if (!active.has(row.sleeve) || seenSleeve.has(row.sleeve)) continue;
    seenSleeve.add(row.sleeve);
    required.push(row);
  }
  const picked: AdviceHolding[] = [];
  const seen = new Set<AdviceHolding>();
  const push = (row: AdviceHolding) => {
    if (seen.has(row) || picked.length >= ADVICE_HOLDING_LIMIT) return;
    seen.add(row);
    picked.push(row);
  };
  for (const row of required) push(row);
  for (const row of byValue) push(row);
  return picked;
}

function round4(value: number): number {
  return Math.round(value * 10000) / 10000;
}

function round1(value: number): number {
  return Math.round(value * 10) / 10;
}
