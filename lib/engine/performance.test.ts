import { describe, expect, it } from "vitest";
import { buildAdjustmentBooks, readBooks } from "./books";
import { exampleInput } from "./example";
import { buildPerformanceReport, evaluateInterval, valueBook } from "./performance";
import { rebalance } from "./rebalance";

function booksOfExample() {
  const input = exampleInput();
  const result = rebalance(input);
  return buildAdjustmentBooks({
    holdings: input.holdings,
    incomeKrw: result.incomeKrw,
    orders: result.orders,
    usdKrw: input.fx.USDKRW,
  });
}

describe("조정 수량", () => {
  it("B1 예시는 팔린 주식 대금이 달러·원화로 옮겨 가고 30년물 수량은 유지된다", () => {
    const books = booksOfExample();
    const qty = (ticker: string) => books.after.find((position) => position.ticker === ticker)?.quantity;
    expect(qty("VOO")).toBe(100);
    expect(qty("069500")).toBe(500);
    expect(qty("TLT")).toBe(300);
    expect(qty("IAU")).toBe(1500);
    expect(qty("CASH")).toBe(25_000_000);
    expect(qty("USD")).toBe(15_000);
    expect(valueBook(books.after, null, 1000).total).toBe(100_000_000);
    expect(valueBook(books.before, null, 1000).total).toBe(100_000_000);
  });
});

describe("조정 효과", () => {
  it("미국주식이 떨어지면 주식을 줄인 B1 조정이 더 높은 수익률을 남긴다", () => {
    const books = booksOfExample();
    const interval = evaluateInterval(
      books,
      {
        VOO: { price: 80, currency: "USD" },
        "069500": { price: 10_000, currency: "KRW" },
        TLT: { price: 100, currency: "USD" },
        IAU: { price: 10_000, currency: "KRW" },
      },
      1000,
      { from: "2026-10", to: "now", phase: "B1", open: true },
    );
    expect(interval?.untouchedEndKrw).toBe(94_000_000);
    expect(interval?.adjustedEndKrw).toBe(98_000_000);
    expect(interval?.untouchedReturn).toBeCloseTo(-0.06);
    expect(interval?.adjustedReturn).toBeCloseTo(-0.02);
    expect(interval?.effectPp).toBeCloseTo(4);
    expect(interval?.effectKrw).toBe(4_000_000);
    expect(interval?.sleeveEffects.find((row) => row.sleeve === "US_EQUITY")?.effectKrw).toBe(4_000_000);
  });

  it("다음 기록의 가격으로 지난 조정을 닫고, 현재 가격은 열린 구간에만 쓴다", () => {
    const first = booksOfExample();
    const second = structuredClone(first);
    for (const position of [...second.before, ...second.after]) {
      if (position.ticker === "VOO") position.price = 80;
    }
    const report = buildPerformanceReport({
      snapshots: [
        { yearMonth: "2026-10", phase: "B1", booksJson: JSON.stringify(first), totalKrw: 100_000_000 },
        { yearMonth: "2026-11", phase: "B1", booksJson: JSON.stringify(second), totalKrw: 94_000_000 },
      ],
      marks: { VOO: { price: 80, currency: "USD" } },
      fx: 1000,
      currentTotalKrw: 94_000_000,
    });
    expect(report.intervals).toHaveLength(2);
    expect(report.intervals[0]?.open).toBe(false);
    expect(report.intervals[0]?.adjustedReturn).toBeCloseTo(-0.02);
    expect(report.intervals[1]?.open).toBe(true);
    expect(report.intervals[1]?.untouchedReturn).toBeCloseTo(0);
    expect(report.cumulativeAdjusted).toBeCloseTo(-0.02);
    expect(report.actualReturn).toBeCloseTo(-0.06);
  });

  it("수량이 없는 예전 기록은 다시 남겨야 비교가 된다", () => {
    const report = buildPerformanceReport({
      snapshots: [{ yearMonth: "2026-10", phase: "B1", booksJson: "", totalKrw: 100_000_000 }],
      marks: {},
      fx: 1000,
      currentTotalKrw: 100_000_000,
    });
    expect(report.needsRerecord).toBe(true);
    expect(report.intervals).toHaveLength(0);
    expect(readBooks("")).toBeNull();
  });
});
