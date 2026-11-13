import { readBooks, type BookPosition, type StoredBooks } from "./books";
import { SLEEVES, type Currency, type HoldingInput, type Sleeve } from "./types";
import { emptySleeveTotals, fxRate, resolveStoredSleeve, won } from "./value";

export type Quote = {
  price: number;
  currency?: Currency;
};

export type SleeveEffect = {
  sleeve: Sleeve;
  effectKrw: number;
};

export type MonthInterval = {
  from: string;
  to: string;
  phase: string;
  open: boolean;
  startKrw: number;
  untouchedEndKrw: number;
  adjustedEndKrw: number;
  untouchedReturn: number;
  adjustedReturn: number;
  effectPp: number;
  effectKrw: number;
  stale: string[];
  sleeveEffects: SleeveEffect[];
};

export type PerformanceReport = {
  intervals: MonthInterval[];
  cumulativeUntouched: number | null;
  cumulativeAdjusted: number | null;
  cumulativeEffectPp: number | null;
  actualReturn: number | null;
  actualStartKrw: number | null;
  actualEndKrw: number | null;
  actualFrom: string | null;
  needsRerecord: boolean;
};

type SnapshotInput = {
  yearMonth: string;
  phase: string;
  booksJson: string;
  totalKrw: number;
};

type ValuedBook = {
  total: number;
  bySleeve: Record<Sleeve, number>;
  stale: string[];
};

function quoteFor(position: BookPosition, marks: Record<string, Quote> | null): { price: number; currency: Currency; stale: boolean } {
  if (position.sleeve === "KRW_CASH" || position.sleeve === "USD_CASH" || position.sleeve === "FUND") {
    return { price: position.price, currency: position.currency, stale: false };
  }
  if (!marks) return { price: position.price, currency: position.currency, stale: false };
  const mark = marks[position.ticker];
  if (!mark || !Number.isFinite(mark.price) || mark.price <= 0) {
    return { price: position.price, currency: position.currency, stale: true };
  }
  return { price: mark.price, currency: mark.currency ?? position.currency, stale: false };
}

export function valueBook(positions: BookPosition[], marks: Record<string, Quote> | null, fx: number): ValuedBook {
  const bySleeve = emptySleeveTotals();
  const stale: string[] = [];
  for (const position of positions) {
    const sleeve = resolveStoredSleeve(String(position.sleeve), position.bondDuration);
    if (!sleeve) continue;
    const quote = quoteFor(position, marks);
    if (quote.stale) stale.push(position.ticker);
    bySleeve[sleeve] += won(position.quantity * quote.price * fxRate(quote.currency, fx));
  }
  const total = SLEEVES.reduce((sum, sleeve) => sum + bySleeve[sleeve], 0);
  return { total, bySleeve, stale };
}

export function evaluateInterval(
  books: StoredBooks,
  marks: Record<string, Quote>,
  endFx: number,
  meta: { from: string; to: string; phase: string; open: boolean },
): MonthInterval | null {
  if (!Number.isFinite(books.usdKrw) || books.usdKrw <= 0 || !Number.isFinite(endFx) || endFx <= 0) return null;
  const startUntouched = valueBook(books.before, null, books.usdKrw);
  const startAdjusted = valueBook(books.after, null, books.usdKrw);
  const endUntouched = valueBook(books.before, marks, endFx);
  const endAdjusted = valueBook(books.after, marks, endFx);
  if (startUntouched.total <= 0 || startAdjusted.total <= 0) return null;
  const untouchedReturn = endUntouched.total / startUntouched.total - 1;
  const adjustedReturn = endAdjusted.total / startAdjusted.total - 1;
  const sleeveEffects = SLEEVES.map((sleeve) => ({
    sleeve,
    effectKrw:
      endAdjusted.bySleeve[sleeve] -
      startAdjusted.bySleeve[sleeve] -
      (endUntouched.bySleeve[sleeve] - startUntouched.bySleeve[sleeve]),
  })).filter((row) => row.effectKrw !== 0);
  return {
    from: meta.from,
    to: meta.to,
    phase: meta.phase,
    open: meta.open,
    startKrw: startUntouched.total,
    untouchedEndKrw: endUntouched.total,
    adjustedEndKrw: endAdjusted.total,
    untouchedReturn,
    adjustedReturn,
    effectPp: (adjustedReturn - untouchedReturn) * 100,
    effectKrw: endAdjusted.total - endUntouched.total - (startAdjusted.total - startUntouched.total),
    stale: [...new Set([...endUntouched.stale, ...endAdjusted.stale])],
    sleeveEffects,
  };
}

export function chainReturns(returns: number[]): number {
  return returns.reduce((acc, rate) => acc * (1 + rate), 1) - 1;
}

export function marksFromHoldings(holdings: Pick<HoldingInput, "ticker" | "price" | "currency">[]): Record<string, Quote> {
  const marks: Record<string, Quote> = {};
  for (const holding of holdings) {
    if (holding.price == null || holding.price <= 0) continue;
    marks[holding.ticker] = { price: holding.price, currency: holding.currency };
  }
  return marks;
}

export function marksFromBooks(books: StoredBooks): Record<string, Quote> {
  const marks: Record<string, Quote> = {};
  for (const position of books.before) {
    marks[position.ticker] = { price: position.price, currency: position.currency };
  }
  return marks;
}

export function buildPerformanceReport(input: {
  snapshots: SnapshotInput[];
  marks: Record<string, Quote>;
  fx: number;
  currentTotalKrw: number;
}): PerformanceReport {
  const ordered = [...input.snapshots].sort((a, b) => a.yearMonth.localeCompare(b.yearMonth));
  const withBooks = ordered.flatMap((snapshot) => {
    const books = readBooks(snapshot.booksJson);
    return books ? [{ snapshot, books }] : [];
  });
  const intervals: MonthInterval[] = [];

  for (let index = 0; index < withBooks.length - 1; index += 1) {
    const current = withBooks[index];
    const next = withBooks[index + 1];
    const interval = evaluateInterval(current.books, marksFromBooks(next.books), next.books.usdKrw, {
      from: current.snapshot.yearMonth,
      to: next.snapshot.yearMonth,
      phase: current.snapshot.phase,
      open: false,
    });
    if (interval) intervals.push(interval);
  }

  const latest = withBooks[withBooks.length - 1];
  if (latest) {
    const open = evaluateInterval(latest.books, input.marks, input.fx, {
      from: latest.snapshot.yearMonth,
      to: "now",
      phase: latest.snapshot.phase,
      open: true,
    });
    if (open) intervals.push(open);
  }

  const cumulativeUntouched = intervals.length > 0 ? chainReturns(intervals.map((interval) => interval.untouchedReturn)) : null;
  const cumulativeAdjusted = intervals.length > 0 ? chainReturns(intervals.map((interval) => interval.adjustedReturn)) : null;
  const first = ordered[0];

  return {
    intervals,
    cumulativeUntouched,
    cumulativeAdjusted,
    cumulativeEffectPp:
      cumulativeUntouched != null && cumulativeAdjusted != null ? (cumulativeAdjusted - cumulativeUntouched) * 100 : null,
    actualReturn: first && first.totalKrw > 0 ? input.currentTotalKrw / first.totalKrw - 1 : null,
    actualStartKrw: first?.totalKrw ?? null,
    actualEndKrw: first ? input.currentTotalKrw : null,
    actualFrom: first?.yearMonth ?? null,
    needsRerecord: ordered.length > 0 && withBooks.length === 0,
  };
}
