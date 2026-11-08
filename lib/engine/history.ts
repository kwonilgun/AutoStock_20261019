import { normalizeTicker } from "./classify";
import type { Currency, HoldingInput } from "./types";
import { portfolioHoldingGain, valueKrw } from "./value";

export type Grain = "day" | "month" | "year";

export const INCOME_KINDS = ["dividend", "interest", "sale"] as const;

export type IncomeKind = (typeof INCOME_KINDS)[number];

export const INCOME_KIND_LABEL: Record<IncomeKind, string> = {
  dividend: "배당",
  interest: "이자",
  sale: "판매 수익",
};

export type AssetPoint = {
  date: string;
  totalKrw: number;
  flowKrw?: number;
  /** 이 평가일에 더할 배당·이자·판매 수익 */
  incomeKrw?: number;
};

export type HeldPosition = {
  ticker: string;
  quantity: number;
  price: number;
  currency: Currency;
  /** 매입 평균단가. 없으면 현재가로 원금을 본다. */
  avgPrice?: number | null;
};

export type SeriesPoint = {
  key: string;
  label: string;
  axisLabel: string;
  /** 이 구간의 마지막 평가일 */
  asOf: string;
  totalKrw: number;
  /** 수량 변화로 늘거나 준 금액을 뺀 손익 */
  changeKrw: number | null;
  flowKrw: number;
  /** 이 구간 수익률에 더한 배당·이자·판매 수익 */
  incomeKrw: number;
  returnRate: number | null;
  /** 평균가가 있는 종목의 평가금 합. 없으면 0 */
  holdingGainKrw: number;
  /** 평균가 원금. 있으면 누적은 종목 평가금 + 배당·이자·판매 */
  costKrw: number | null;
  /** 이 날짜까지 수익 메뉴에 적힌 배당·이자·판매 합 */
  cumulativeIncomeKrw: number;
  /** 첫 기록부터 더한 손익. 수익률은 이 손익을 그날 자산으로 나눈 값이다. */
  cumulativeKrw: number | null;
  cumulativeRate: number | null;
};

/** 누적 수익률을 종목 평가금 + 수익 메뉴 합으로 계산할 때 넘긴다. */
export type SeriesHoldings = {
  positionDays?: PositionDay[];
  current?: HeldPosition[];
  incomes?: { date: string; amountKrw: number }[];
  usdKrw?: number;
};

export type AssetSeries = {
  grain: Grain;
  points: SeriesPoint[];
  changeKrw: number | null;
  returnRate: number | null;
};

const DATE = /^\d{4}-\d{2}-\d{2}$/;

export type SnapshotMark = {
  date: string;
  totalKrw: number;
  hasBooks: boolean;
};

export function snapshotValuations(marks: SnapshotMark[], today: string): AssetPoint[] {
  const last = new Map<string, number>();
  for (const mark of marks) {
    if (!DATE.test(mark.date) || mark.date >= today || !mark.hasBooks) continue;
    if (!Number.isFinite(mark.totalKrw) || mark.totalKrw <= 0) continue;
    last.set(mark.date, mark.totalKrw);
  }
  return [...last.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, totalKrw]) => ({ date, totalKrw }));
}

export function heldPositions(holdings: HoldingInput[]): HeldPosition[] {
  return holdings.flatMap((holding) => {
    if (holding.sleeve == null || holding.price == null || valueKrw(holding, 1) == null || holding.quantity <= 0) return [];
    return [
      {
        ticker: holding.ticker,
        quantity: holding.quantity,
        price: holding.price,
        currency: holding.currency,
        avgPrice: costPrice(holding.avgPrice),
      },
    ];
  });
}

function costPrice(avgPrice: number | null | undefined): number | null {
  if (avgPrice == null || !Number.isFinite(avgPrice) || avgPrice <= 0) return null;
  return avgPrice;
}

function investedPrice(position: HeldPosition, market: number): number {
  return costPrice(position.avgPrice) ?? market;
}

function markedValue(quantity: number, price: number, currency: Currency, usdKrw: number): number {
  return valueKrw({ quantity, price, currency }, usdKrw) ?? 0;
}

function compactTicker(ticker: string): string {
  return normalizeTicker(ticker).replace(/\s+/g, "");
}

export type TickerAlias = { ticker: string; name?: string | null };

/** 종목 코드와 이름을 같은 키로 본다. 예전에 종목명으로 저장된 수량을 코드와 이어 준다. */
export function tickerAliases(holdings?: TickerAlias[]): Map<string, string> {
  const aliases = new Map<string, string>();
  if (!holdings) return aliases;
  for (const holding of holdings) {
    const code = compactTicker(holding.ticker);
    if (!code) continue;
    aliases.set(normalizeTicker(holding.ticker), code);
    aliases.set(code, code);
    const name = holding.name?.trim();
    if (name) {
      aliases.set(normalizeTicker(name), code);
      aliases.set(compactTicker(name), code);
    }
  }
  return aliases;
}

function canonicalTicker(ticker: string, aliases: Map<string, string>): string {
  const raw = normalizeTicker(ticker);
  const compact = compactTicker(ticker);
  return aliases.get(raw) ?? aliases.get(compact) ?? compact;
}

/** 수량이 늘었으면 늘어난 수량만 평균가(없으면 현재가)로 넣고, 줄었으면 줄어든 수량만 현재가로 뺀다. */
function tickerFlowKrw(was: HeldPosition | undefined, now: HeldPosition | undefined, usdKrw: number): number {
  const before = was?.quantity ?? 0;
  const after = now?.quantity ?? 0;
  const mark = now ?? was;
  if (!mark) return 0;
  const market = mark.price;
  if (!(market > 0)) return 0;
  const delta = after - before;
  if (Math.abs(delta) < 1e-9) return 0;
  if (delta > 0) {
    const price = now ? investedPrice(now, now.price) : market;
    return markedValue(delta, price, mark.currency, usdKrw);
  }
  return -markedValue(-delta, market, mark.currency, usdKrw);
}

function tickerUsedAvg(was: HeldPosition | undefined, now: HeldPosition | undefined): boolean {
  const before = was?.quantity ?? 0;
  const after = now?.quantity ?? 0;
  if (after + 1e-9 < before) return false;
  return costPrice(now?.avgPrice) != null || costPrice(was?.avgPrice) != null;
}

export function readPositions(json: string): HeldPosition[] | null {
  if (!json) return null;
  try {
    const parsed = JSON.parse(json) as HeldPosition[];
    return Array.isArray(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

export const QUANTITY_EVENT_KINDS = ["start", "add", "increase", "decrease", "remove"] as const;

export type QuantityEventKind = (typeof QUANTITY_EVENT_KINDS)[number];

export const QUANTITY_EVENT_LABEL: Record<QuantityEventKind, string> = {
  start: "첫 기록",
  add: "추가",
  increase: "늘림",
  decrease: "줄임",
  remove: "정리",
};

/** 하루 보유 수량. positions가 null이면 그날 수량을 모르는 날이라 비교에서 뺀다. */
export type QuantityDay = {
  date: string;
  positions: { ticker: string; quantity: number }[] | null;
};

export type QuantityEvent = {
  date: string;
  ticker: string;
  kind: QuantityEventKind;
  before: number;
  after: number;
};

function sameQuantity(left: number, right: number): boolean {
  return Math.abs(left - right) < 1e-6;
}

/**
 * 날짜별 보유 수량을 비교해 종목을 추가·증가·감소·정리한 날을 뽑는다.
 * 수량을 아는 첫날은 변화 이전이 없어 첫 기록으로 남긴다.
 */
export function quantityEvents(days: QuantityDay[], holdings?: TickerAlias[]): QuantityEvent[] {
  const aliases = tickerAliases(holdings);
  const sorted = [...days]
    .filter((day) => DATE.test(day.date))
    .sort((left, right) => left.date.localeCompare(right.date));
  const events: QuantityEvent[] = [];
  let seen = false;
  const previous = new Map<string, number>();

  for (const day of sorted) {
    if (day.positions == null) continue;
    const today = new Map<string, number>();
    for (const position of day.positions) {
      const ticker = canonicalTicker(position.ticker, aliases);
      if (!ticker || !(position.quantity > 0) || !Number.isFinite(position.quantity)) continue;
      today.set(ticker, (today.get(ticker) ?? 0) + position.quantity);
    }

    if (!seen) {
      for (const [ticker, quantity] of today) {
        events.push({ date: day.date, ticker, kind: "start", before: 0, after: quantity });
      }
      seen = true;
    } else {
      const tickers = new Set([...previous.keys(), ...today.keys()]);
      for (const ticker of tickers) {
        const before = previous.get(ticker) ?? 0;
        const after = today.get(ticker) ?? 0;
        if (sameQuantity(before, after)) continue;
        const kind: QuantityEventKind =
          before <= 0 && after > 0 ? "add" : after <= 0 && before > 0 ? "remove" : after > before ? "increase" : "decrease";
        events.push({ date: day.date, ticker, kind, before, after });
      }
    }

    previous.clear();
    for (const [ticker, quantity] of today) previous.set(ticker, quantity);
  }

  return events;
}

function investedKrw(positions: HeldPosition[], usdKrw: number): number {
  return positions.reduce((sum, position) => {
    if (!(position.quantity > 0)) return sum;
    return sum + markedValue(position.quantity, investedPrice(position, position.price), position.currency, usdKrw);
  }, 0);
}

/**
 * 직전 기록 이후 넣은 돈. 새로 늘린 수량은 평균가(없으면 현재가)로 보고, 줄인 수량은 현재가로 본다.
 * 직전 수량을 모르면 직전 평가액이 0일 때만 오늘 원금을 유입으로 본다.
 */
export function externalFlowKrw(input: {
  previous: HeldPosition[] | null;
  previousTotalKrw: number;
  current: HeldPosition[];
  usdKrw: number;
  aliases?: TickerAlias[];
}): number {
  if (input.previous == null) return input.previousTotalKrw > 0 ? 0 : investedKrw(input.current, input.usdKrw);
  const aliases = tickerAliases(input.aliases);
  const today = lastPosition(input.current, aliases);
  const prior = lastPosition(input.previous, aliases);
  let flow = 0;
  for (const ticker of new Set([...prior.keys(), ...today.keys()])) {
    flow += tickerFlowKrw(prior.get(ticker), today.get(ticker), input.usdKrw);
  }
  return flow;
}

export type FlowKind = "start" | "add" | "increase" | "decrease" | "remove";

/** 한 종목의 수량 변화가 수익률에서 빠지는 금액 */
export type FlowLine = {
  ticker: string;
  kind: FlowKind;
  before: number;
  after: number;
  amountKrw: number;
  currency: Currency;
  price: number;
  /** 넣은 돈을 평균가로 계산했으면 true */
  usedAvg?: boolean;
};

export type PositionDay = {
  date: string;
  totalKrw: number;
  flowKrw: number;
  positions: HeldPosition[] | null;
};

export type DatedFlow = {
  date: string;
  flowKrw: number;
  /** 그날 보유 수량을 몰라 종목별로 나누지 못했다 */
  unknown: boolean;
  lines: FlowLine[];
};

export type HostedIncome = {
  date: string;
  hostDate: string;
  kind: IncomeKind;
  amountKrw: number;
  note: string;
};

const FLOW_RANK: Record<FlowKind, number> = { start: 0, add: 1, increase: 2, decrease: 3, remove: 4 };

function lastPosition(positions: HeldPosition[], aliases: Map<string, string> = new Map()): Map<string, HeldPosition> {
  const map = new Map<string, HeldPosition>();
  for (const position of positions) {
    const key = canonicalTicker(position.ticker, aliases);
    if (!key) continue;
    const prev = map.get(key);
    map.set(key, {
      ...position,
      ticker: key,
      quantity: (prev?.quantity ?? 0) + position.quantity,
    });
  }
  return map;
}

/**
 * 직전 기록과 비교해 수량이 바뀐 종목만 남긴다.
 * 금액은 externalFlowKrw와 같은 가격으로 계산하므로, 종목별 합이 그날의 유입액과 같다.
 */
function startOrAddLines(
  current: HeldPosition[],
  usdKrw: number,
  aliases: Map<string, string>,
  kind: "start" | "add",
): FlowLine[] {
  return [...lastPosition(current, aliases).values()]
    .filter((position) => position.quantity > 0)
    .map((position) => ({
      ticker: position.ticker,
      kind,
      before: 0,
      after: position.quantity,
      amountKrw: kind === "start" ? 0 : tickerFlowKrw(undefined, position, usdKrw),
      currency: position.currency,
      price: investedPrice(position, position.price),
      usedAvg: costPrice(position.avgPrice) != null,
    }))
    .sort((left, right) => left.ticker.localeCompare(right.ticker));
}

export function flowLines(input: {
  previous: HeldPosition[] | null;
  previousTotalKrw: number;
  current: HeldPosition[];
  usdKrw: number;
  aliases?: TickerAlias[];
}): FlowLine[] {
  const aliases = tickerAliases(input.aliases);
  if (input.previous == null) {
    if (input.previousTotalKrw > 0) return startOrAddLines(input.current, input.usdKrw, aliases, "start");
    return startOrAddLines(input.current, input.usdKrw, aliases, "add");
  }

  const today = lastPosition(input.current, aliases);
  const prior = lastPosition(input.previous, aliases);
  const lines: FlowLine[] = [];
  for (const ticker of new Set([...prior.keys(), ...today.keys()])) {
    const was = prior.get(ticker);
    const now = today.get(ticker);
    const before = was?.quantity ?? 0;
    const after = now?.quantity ?? 0;
    if (sameQuantity(before, after)) continue;
    const amountKrw = tickerFlowKrw(was, now, input.usdKrw);
    const mark = now ?? was;
    if (!mark) continue;
    const kind: FlowKind =
      before <= 0 && after > 0 ? "add" : after <= 0 && before > 0 ? "remove" : after > before ? "increase" : "decrease";
    const usedAvg = tickerUsedAvg(was, now);
    lines.push({
      ticker: now?.ticker ?? was?.ticker ?? ticker,
      kind,
      before,
      after,
      amountKrw,
      currency: mark.currency,
      price: after + 1e-9 >= before ? investedPrice(mark, mark.price) : mark.price,
      usedAvg,
    });
  }
  return lines.sort((left, right) => FLOW_RANK[left.kind] - FLOW_RANK[right.kind] || left.ticker.localeCompare(right.ticker));
}

function quantityUnits(
  previous: HeldPosition[] | null,
  current: HeldPosition[],
  aliases: Map<string, string>,
): { krw: number; usd: number } {
  const today = lastPosition(current, aliases);
  const prior = lastPosition(previous ?? [], aliases);
  let krw = 0;
  let usd = 0;
  for (const ticker of new Set([...prior.keys(), ...today.keys()])) {
    const was = prior.get(ticker);
    const now = today.get(ticker);
    const before = was?.quantity ?? 0;
    const after = now?.quantity ?? 0;
    const mark = now ?? was;
    if (!mark || !(mark.price > 0)) continue;
    const market = mark.price;
    const native =
      after + 1e-9 >= before
        ? after * (now ? investedPrice(now, market) : 0) - before * (was ? investedPrice(was, market) : 0)
        : (after - before) * market;
    if (Math.abs(native) < 1e-8) continue;
    if (mark.currency === "USD") usd += native;
    else krw += native;
  }
  return { krw, usd };
}

/** 저장된 유입액에 맞는 환율. 달러 수량 변화가 없으면 지금 환율을 쓴다. */
function inferUsdKrw(
  previous: HeldPosition[] | null,
  current: HeldPosition[],
  flowKrw: number,
  fallback: number,
  aliases: Map<string, string>,
): number {
  const units = quantityUnits(previous, current, aliases);
  if (Math.abs(units.usd) < 1e-8) return fallback;
  const fx = (flowKrw - units.krw) / units.usd;
  if (!Number.isFinite(fx) || fx < 100 || fx > 10_000) return fallback;
  return fx;
}

function snapFlow(lines: FlowLine[], flowKrw: number): FlowLine[] {
  if (lines.length === 0) return lines;
  const stored = Math.round(flowKrw);
  const sum = lines.reduce((total, line) => total + line.amountKrw, 0);
  const gap = stored - sum;
  if (gap === 0 || Math.abs(gap) > lines.length + 1) return lines;
  const index = lines.reduce((best, line, current) => (Math.abs(line.amountKrw) > Math.abs(lines[best].amountKrw) ? current : best), 0);
  return lines.map((line, current) => (current === index ? { ...line, amountKrw: line.amountKrw + gap } : line));
}

/** 평가일마다 수량이 바뀐 종목과, 그 수량 때문에 수익률에서 빠진 금액 */
export function datedFlowLines(days: PositionDay[], fallbackUsdKrw: number, holdings?: TickerAlias[]): DatedFlow[] {
  const aliases = tickerAliases(holdings);
  const sorted = [...days].filter((day) => DATE.test(day.date)).sort((left, right) => left.date.localeCompare(right.date));
  const flows: DatedFlow[] = [];
  for (let index = 1; index < sorted.length; index += 1) {
    const previous = sorted[index - 1];
    const current = sorted[index];
    if (current.positions == null) {
      flows.push({ date: current.date, flowKrw: current.flowKrw, unknown: Math.round(current.flowKrw) !== 0, lines: [] });
      continue;
    }
    const fx = inferUsdKrw(previous.positions, current.positions, current.flowKrw, fallbackUsdKrw, aliases);
    const lines = snapFlow(
      flowLines({
        previous: previous.positions,
        previousTotalKrw: previous.totalKrw,
        current: current.positions,
        usdKrw: fx,
        aliases: holdings,
      }),
      current.flowKrw,
    );
    flows.push({
      date: current.date,
      flowKrw: current.flowKrw,
      unknown: Math.round(current.flowKrw) !== 0 && lines.filter((line) => line.kind !== "start").length === 0,
      lines,
    });
  }
  return flows;
}

/**
 * 배당·이자·판매 수익을 수익률에 반영되는 평가일에 붙인다.
 * 붙이는 규칙은 applyIncome과 같다.
 */
export function hostIncomes(
  points: { date: string }[],
  incomes: { date: string; kind: IncomeKind; amountKrw: number; note: string }[],
): HostedIncome[] {
  const dates = [...new Set(points.map((point) => point.date).filter((date) => DATE.test(date)))].sort();
  const start = dates[0];
  const last = dates[dates.length - 1];
  if (!start || !last) return [];
  const hosted: HostedIncome[] = [];
  for (const income of incomes) {
    if (!DATE.test(income.date) || !Number.isFinite(income.amountKrw) || income.date === start) continue;
    // 첫 평가일보다 전은 그 날의 누적 수익률에 넣는다. 첫 평가일 당일은 시작 자산으로 둔다.
    const host = income.date < start ? start : (dates.find((date) => date >= income.date) ?? (income.date > last ? last : null));
    if (!host || (host === start && income.date > start)) continue;
    hosted.push({
      date: income.date,
      hostDate: host,
      kind: income.kind,
      amountKrw: income.amountKrw,
      note: income.note,
    });
  }
  return hosted;
}

export function periodKey(date: string, grain: Grain): string {
  return bucketKey(date, grain);
}

export function periodLabel(date: string, grain: Grain): string {
  return labelFor(bucketKey(date, grain), grain);
}

function bucketKey(date: string, grain: Grain): string {
  if (grain === "day") return date;
  if (grain === "month") return date.slice(0, 7);
  return date.slice(0, 4);
}

function labelFor(key: string, grain: Grain): string {
  if (grain === "year") return `${key}년`;
  if (grain === "month") {
    const [year, month] = key.split("-");
    return `${year}년 ${Number(month)}월`;
  }
  const [year, month, day] = key.split("-");
  return `${year}년 ${Number(month)}월 ${Number(day)}일`;
}

function axisLabel(key: string, grain: Grain): string {
  if (grain === "year") return key;
  if (grain === "month") {
    const [year, month] = key.split("-");
    return `${year.slice(2)}.${Number(month)}`;
  }
  const [, month, day] = key.split("-");
  return `${Number(month)}.${Number(day)}`;
}

/**
 * 배당·이자·판매 수익을 그 금액이 반영될 평가일에 붙인다.
 * 첫 평가일보다 전은 첫 기록의 누적 수익률에 넣는다. 첫 평가일 당일은 시작 자산으로 보고 넣지 않는다.
 * 기록과 기록 사이에 있으면 뒤 기록에 더하고, 마지막 기록 다음이면 마지막 기록에 더한다.
 */
export function applyIncome<T extends AssetPoint>(points: T[], incomes: { date: string; amountKrw: number }[]): (T & { incomeKrw: number })[] {
  const sorted = [...points].sort((a, b) => a.date.localeCompare(b.date));
  const extra = new Map<string, number>();
  const start = sorted[0]?.date;
  const last = sorted[sorted.length - 1];
  if (start && last) {
    for (const income of incomes) {
      if (!DATE.test(income.date) || !Number.isFinite(income.amountKrw) || income.date === start) continue;
      const host =
        income.date < start
          ? sorted[0]
          : (sorted.find((point) => point.date >= income.date) ?? (income.date > last.date ? last : null));
      if (!host || (host.date === start && income.date > start)) continue;
      extra.set(host.date, (extra.get(host.date) ?? 0) + income.amountKrw);
    }
  }
  return sorted.map((point) => ({ ...point, incomeKrw: extra.get(point.date) ?? 0 }));
}

function incomeThrough(
  incomes: { date: string; amountKrw: number }[] | undefined,
  asOf: string,
  throughEnd: boolean,
): number {
  if (!incomes) return 0;
  return incomes.reduce((sum, income) => {
    if (!DATE.test(income.date) || !Number.isFinite(income.amountKrw)) return sum;
    if (!throughEnd && income.date > asOf) return sum;
    return sum + income.amountKrw;
  }, 0);
}

function positionsOn(
  asOf: string,
  isLast: boolean,
  holdings: SeriesHoldings | undefined,
): HeldPosition[] | null {
  if (isLast && holdings?.current) return holdings.current;
  const day = holdings?.positionDays?.find((item) => item.date === asOf);
  return day?.positions ?? null;
}

function combinedCumulative(
  asOf: string,
  isLast: boolean,
  holdings: SeriesHoldings | undefined,
): { holdingGainKrw: number; costKrw: number; cumulativeIncomeKrw: number; cumulativeKrw: number; cumulativeRate: number } | null {
  if (!holdings || holdings.usdKrw == null) return null;
  const positions = positionsOn(asOf, isLast, holdings);
  const gain = positions ? portfolioHoldingGain(positions, holdings.usdKrw) : null;
  if (!gain) return null;
  const cumulativeIncomeKrw = incomeThrough(holdings.incomes, asOf, isLast);
  const cumulativeKrw = gain.gainKrw + cumulativeIncomeKrw;
  return {
    holdingGainKrw: gain.gainKrw,
    costKrw: gain.costKrw,
    cumulativeIncomeKrw,
    cumulativeKrw,
    cumulativeRate: cumulativeKrw / gain.costKrw,
  };
}

export function buildAssetSeries(points: AssetPoint[], grain: Grain, holdings?: SeriesHoldings): AssetSeries {
  const byDate = new Map<string, AssetPoint>();
  for (const point of points) {
    if (DATE.test(point.date) && Number.isFinite(point.totalKrw)) byDate.set(point.date, point);
  }
  const days = [...byDate.values()].sort((a, b) => a.date.localeCompare(b.date));

  type Bucket = { totalKrw: number; gainKrw: number; flowKrw: number; incomeKrw: number; growth: number | null; asOf: string };
  const buckets = new Map<string, Bucket>();
  let firstDayCostReturn = false;
  days.forEach((day, index) => {
    const key = bucketKey(day.date, grain);
    const bucket = buckets.get(key) ?? { totalKrw: 0, gainKrw: 0, flowKrw: 0, incomeKrw: 0, growth: null, asOf: day.date };
    const previous = index > 0 ? days[index - 1].totalKrw : null;
    const flow = Number.isFinite(day.flowKrw) ? (day.flowKrw ?? 0) : 0;
    const income = Number.isFinite(day.incomeKrw) ? (day.incomeKrw ?? 0) : 0;
    if (previous != null) {
      bucket.flowKrw += flow;
      bucket.incomeKrw += income;
      bucket.gainKrw += day.totalKrw - previous - flow + income;
      if (previous > 0) bucket.growth = (bucket.growth ?? 1) * ((day.totalKrw - flow + income) / previous);
    } else if (flow > 0) {
      firstDayCostReturn = true;
      bucket.flowKrw += flow;
      bucket.incomeKrw += income;
      bucket.gainKrw += day.totalKrw - flow + income;
      bucket.growth = (day.totalKrw + income) / flow;
    } else if (income !== 0) {
      // 첫 평가일보다 전에 받은 배당·이자·판매. 비교할 어제는 없고, 누적 손익에만 넣는다.
      firstDayCostReturn = true;
      bucket.incomeKrw += income;
      bucket.gainKrw += income;
      if (day.totalKrw > 0) bucket.growth = (day.totalKrw + income) / day.totalKrw;
    }
    bucket.totalKrw = day.totalKrw;
    bucket.asOf = day.date;
    buckets.set(key, bucket);
  });

  let gain = 0;
  const entries = [...buckets.entries()];
  const series = entries.map(([key, bucket], index) => {
    const baseline = index === 0 && !firstDayCostReturn;
    const returnRate = baseline || bucket.growth == null ? null : bucket.growth - 1;
    const counted = bucket.growth != null || index > 0 || firstDayCostReturn;
    if (counted) gain += bucket.gainKrw;
    const cumulativeKrw = counted ? gain : null;
    const combined = combinedCumulative(bucket.asOf, index === entries.length - 1, holdings);
    return {
      key,
      label: labelFor(key, grain),
      axisLabel: axisLabel(key, grain),
      asOf: bucket.asOf,
      totalKrw: bucket.totalKrw,
      changeKrw: baseline ? null : bucket.gainKrw,
      flowKrw: baseline ? 0 : bucket.flowKrw,
      incomeKrw: baseline ? 0 : bucket.incomeKrw,
      returnRate,
      holdingGainKrw: combined?.holdingGainKrw ?? 0,
      costKrw: combined?.costKrw ?? null,
      cumulativeIncomeKrw: combined?.cumulativeIncomeKrw ?? 0,
      // 누적 수익률은 그때까지 손익을 그날 자산으로 나눈 값이다. 구간 수익률을 곱하면 분모가 작은 날의 큰 손익이 이후 날짜까지 남는다.
      cumulativeKrw,
      cumulativeRate: cumulativeKrw == null || !(bucket.totalKrw > 0) ? null : cumulativeKrw / bucket.totalKrw,
    };
  });

  const last = series[series.length - 1] ?? null;

  return {
    grain,
    points: series,
    changeKrw: last?.cumulativeKrw ?? null,
    returnRate: last?.cumulativeRate ?? null,
  };
}
