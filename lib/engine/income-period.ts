import { INCOME_KINDS, periodKey, periodLabel, type Grain, type IncomeKind } from "./history";
import type { Currency } from "./types";
import { incomeToKrw } from "./value";

const DATE = /^\d{4}-\d{2}-\d{2}$/;

export type IncomeLine = {
  id: string;
  date: string;
  kind: IncomeKind;
  currency: Currency;
  amount: number;
  amountKrw: number;
  note: string;
};

export type IncomeTotals = Record<IncomeKind, number> & { all: number };

export type IncomeBucket = {
  key: string;
  label: string;
  totals: IncomeTotals;
  items: IncomeLine[];
};

export type IncomePeriodView = {
  key: string;
  label: string;
  grain: Grain;
  totals: IncomeTotals;
  items: IncomeLine[];
  groups: { date: string; label: string; totals: IncomeTotals; items: IncomeLine[] }[];
  buckets: IncomeBucket[];
};

export function emptyIncomeTotals(): IncomeTotals {
  return { dividend: 0, interest: 0, sale: 0, all: 0 };
}

export function incomeCurrency(income: { currency: string }): Currency {
  return income.currency === "USD" ? "USD" : "KRW";
}

export function incomeAmount(income: { currency: string; amount: number; amountKrw: number }): number {
  return incomeCurrency(income) === "USD" ? income.amount : income.amount || income.amountKrw;
}

export function incomeAmountKrw(
  income: { currency: string; amount: number; amountKrw: number },
  usdKrw: number,
): number {
  return incomeToKrw(incomeAmount(income), incomeCurrency(income), usdKrw, income.amountKrw);
}

function addAmount(totals: IncomeTotals, kind: IncomeKind, amountKrw: number) {
  totals[kind] += amountKrw;
  totals.all += amountKrw;
}

function childGrain(grain: Grain): Grain | null {
  if (grain === "year") return "month";
  if (grain === "month") return "day";
  return null;
}

function parseDate(date: string): { year: number; month: number; day: number } | null {
  if (!DATE.test(date)) return null;
  const [year, month, day] = date.split("-").map(Number);
  if (!year || !month || !day) return null;
  return { year, month, day };
}

function isoDate(year: number, month: number, day: number): string {
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

function daysInMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

/** 선택한 간격만큼 앞뒤 기간으로 옮긴다. 월·연도는 그달 말일을 넘기지 않는다. */
export function shiftPeriod(date: string, grain: Grain, delta: number): string {
  const parsed = parseDate(date);
  if (!parsed || !Number.isInteger(delta) || delta === 0) return date;
  if (grain === "day") {
    const next = new Date(Date.UTC(parsed.year, parsed.month - 1, parsed.day + delta));
    return isoDate(next.getUTCFullYear(), next.getUTCMonth() + 1, next.getUTCDate());
  }
  if (grain === "month") {
    const index = parsed.year * 12 + (parsed.month - 1) + delta;
    const year = Math.floor(index / 12);
    const month = index - year * 12 + 1;
    return isoDate(year, month, Math.min(parsed.day, daysInMonth(year, month)));
  }
  const year = parsed.year + delta;
  return isoDate(year, parsed.month, Math.min(parsed.day, daysInMonth(year, parsed.month)));
}

export function canShiftForward(date: string, grain: Grain, today: string): boolean {
  if (!DATE.test(date) || !DATE.test(today)) return false;
  return periodKey(date, grain) < periodKey(today, grain);
}

export function bucketDate(key: string, grain: Grain, today: string): string {
  if (grain === "day") return DATE.test(key) ? key : today;
  if (grain === "month") {
    if (periodKey(today, "month") === key) return today;
    return DATE.test(`${key}-01`) ? `${key}-01` : today;
  }
  if (periodKey(today, "year") === key) return today;
  return DATE.test(`${key}-01-01`) ? `${key}-01-01` : today;
}

function lined(income: IncomeLine, usdKrw: number): IncomeLine {
  return {
    ...income,
    currency: incomeCurrency(income),
    amount: incomeAmount(income),
    amountKrw: incomeAmountKrw(income, usdKrw),
  };
}

export function summarizeIncomePeriod(
  incomes: IncomeLine[],
  grain: Grain,
  date: string,
  usdKrw: number,
): IncomePeriodView {
  const key = periodKey(date, grain);
  const items = incomes
    .filter((income) => DATE.test(income.date) && periodKey(income.date, grain) === key)
    .map((income) => lined(income, usdKrw))
    .sort((left, right) => right.date.localeCompare(left.date) || right.id.localeCompare(left.id));
  const totals = emptyIncomeTotals();
  for (const item of items) addAmount(totals, item.kind, item.amountKrw);

  const groupsMap = new Map<string, IncomePeriodView["groups"][number]>();
  for (const item of items) {
    let group = groupsMap.get(item.date);
    if (!group) {
      group = { date: item.date, label: periodLabel(item.date, "day"), totals: emptyIncomeTotals(), items: [] };
      groupsMap.set(item.date, group);
    }
    group.items.push(item);
    addAmount(group.totals, item.kind, item.amountKrw);
  }
  const groups = [...groupsMap.values()].sort((left, right) => right.date.localeCompare(left.date));

  const nested = childGrain(grain);
  const buckets: IncomeBucket[] = [];
  if (nested) {
    const bucketMap = new Map<string, IncomeBucket>();
    for (const item of items) {
      const bucketKey = periodKey(item.date, nested);
      let bucket = bucketMap.get(bucketKey);
      if (!bucket) {
        bucket = { key: bucketKey, label: periodLabel(item.date, nested), totals: emptyIncomeTotals(), items: [] };
        bucketMap.set(bucketKey, bucket);
      }
      bucket.items.push(item);
      addAmount(bucket.totals, item.kind, item.amountKrw);
    }
    buckets.push(...[...bucketMap.values()].sort((left, right) => right.key.localeCompare(left.key)));
  }

  return {
    key,
    label: periodLabel(date, grain),
    grain,
    totals,
    items,
    groups,
    buckets,
  };
}

export function allIncomeTotals(incomes: IncomeLine[], usdKrw: number): IncomeTotals {
  const totals = emptyIncomeTotals();
  for (const income of incomes) addAmount(totals, income.kind, incomeAmountKrw(income, usdKrw));
  return totals;
}

export { INCOME_KINDS };
