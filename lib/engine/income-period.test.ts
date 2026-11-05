import { describe, expect, it } from "vitest";
import {
  allIncomeTotals,
  bucketDate,
  canShiftForward,
  shiftPeriod,
  summarizeIncomePeriod,
  type IncomeLine,
} from "./income-period";

function line(partial: Partial<IncomeLine> & Pick<IncomeLine, "id" | "date" | "kind" | "amountKrw">): IncomeLine {
  return {
    currency: "KRW",
    amount: partial.amount ?? partial.amountKrw,
    note: "",
    ...partial,
  };
}

const incomes: IncomeLine[] = [
  line({ id: "d1", date: "2026-03-02", kind: "dividend", amountKrw: 450_000, note: "JEPI" }),
  line({ id: "i1", date: "2026-03-02", kind: "interest", amountKrw: 12_000 }),
  line({ id: "s1", date: "2026-03-20", kind: "sale", amountKrw: -30_000 }),
  line({ id: "d2", date: "2026-04-01", kind: "dividend", amountKrw: 200_000 }),
  line({ id: "d3", date: "2025-12-31", kind: "dividend", amountKrw: 80_000 }),
  line({
    id: "usd",
    date: "2026-03-15",
    kind: "dividend",
    currency: "USD",
    amount: 10,
    amountKrw: 12_000,
  }),
];

describe("기간 이동", () => {
  it("날짜는 하루씩, 월은 말일을 넘기지 않고, 연도는 같은 달을 유지한다", () => {
    expect(shiftPeriod("2026-03-02", "day", -1)).toBe("2026-03-01");
    expect(shiftPeriod("2026-03-01", "day", -1)).toBe("2026-02-28");
    expect(shiftPeriod("2026-01-31", "month", 1)).toBe("2026-02-28");
    expect(shiftPeriod("2026-03-31", "month", -1)).toBe("2026-02-28");
    expect(shiftPeriod("2024-02-29", "year", 1)).toBe("2025-02-28");
    expect(shiftPeriod("2026-11-02", "year", -1)).toBe("2025-11-02");
  });

  it("오늘이 속한 기간보다 앞으로는 가지 않는다", () => {
    expect(canShiftForward("2026-11-02", "day", "2026-11-02")).toBe(false);
    expect(canShiftForward("2026-11-01", "day", "2026-11-02")).toBe(true);
    expect(canShiftForward("2026-10-31", "month", "2026-11-02")).toBe(true);
    expect(canShiftForward("2026-11-01", "month", "2026-11-02")).toBe(false);
    expect(canShiftForward("2025-12-31", "year", "2026-11-02")).toBe(true);
  });

  it("하위 기간을 누르면 그 기간의 날짜로 연다", () => {
    expect(bucketDate("2026-03-02", "day", "2026-11-02")).toBe("2026-03-02");
    expect(bucketDate("2026-11", "month", "2026-11-02")).toBe("2026-11-02");
    expect(bucketDate("2026-03", "month", "2026-11-02")).toBe("2026-03-01");
    expect(bucketDate("2026", "year", "2026-11-02")).toBe("2026-11-02");
    expect(bucketDate("2025", "year", "2026-11-02")).toBe("2025-01-01");
  });
});

describe("수익 기간 합산", () => {
  it("일별로는 그날의 배당·이자·판매 수익만 더한다", () => {
    const view = summarizeIncomePeriod(incomes, "day", "2026-03-02", 1_400);
    expect(view.label).toBe("2026년 3월 2일");
    expect(view.totals).toEqual({ dividend: 450_000, interest: 12_000, sale: 0, all: 462_000 });
    expect(view.items.map((item) => item.id)).toEqual(["i1", "d1"]);
    expect(view.buckets).toEqual([]);
  });

  it("월별로는 그달 합과 날짜 묶음을 남긴다", () => {
    const view = summarizeIncomePeriod(incomes, "month", "2026-03-20", 1_400);
    expect(view.label).toBe("2026년 3월");
    expect(view.totals.dividend).toBe(450_000 + 14_000);
    expect(view.totals.interest).toBe(12_000);
    expect(view.totals.sale).toBe(-30_000);
    expect(view.totals.all).toBe(446_000);
    expect(view.buckets.map((bucket) => [bucket.key, bucket.totals.all])).toEqual([
      ["2026-03-20", -30_000],
      ["2026-03-15", 14_000],
      ["2026-03-02", 462_000],
    ]);
    expect(view.groups.map((group) => group.date)).toEqual(["2026-03-20", "2026-03-15", "2026-03-02"]);
  });

  it("년도별로는 그해 합과 월 묶음을 남긴다", () => {
    const view = summarizeIncomePeriod(incomes, "year", "2026-11-02", 1_400);
    expect(view.label).toBe("2026년");
    expect(view.totals.all).toBe(446_000 + 200_000);
    expect(view.buckets.map((bucket) => bucket.key)).toEqual(["2026-04", "2026-03"]);
    expect(view.buckets[0].totals.all).toBe(200_000);
    expect(view.buckets[1].label).toBe("2026년 3월");
  });

  it("달러는 지금 환율을 곱한 원화로 합산한다", () => {
    const view = summarizeIncomePeriod(incomes, "day", "2026-03-15", 1_400);
    expect(view.totals.dividend).toBe(14_000);
    expect(view.items[0].amountKrw).toBe(14_000);
  });

  it("전체 누적은 기간과 상관없이 더한다", () => {
    expect(allIncomeTotals(incomes, 1_400).all).toBe(446_000 + 200_000 + 80_000);
    expect(allIncomeTotals(incomes, 1_400).dividend).toBe(450_000 + 14_000 + 200_000 + 80_000);
  });

  it("기록이 없는 기간은 0원이다", () => {
    const view = summarizeIncomePeriod(incomes, "month", "2026-01-15", 1_400);
    expect(view.totals).toEqual({ dividend: 0, interest: 0, sale: 0, all: 0 });
    expect(view.items).toEqual([]);
  });
});
