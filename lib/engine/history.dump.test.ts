import { describe, expect, it } from "vitest";
import { datedFlowLines, hostIncomes, quantityEvents, type PositionDay } from "./history";

const holdings = [
  { ticker: "475720", name: "RISE 200위클리커버드콜" },
  { ticker: "IAU", name: "iShares Gold Trust" },
  { ticker: "INTC", name: "Intel Corporation" },
  { ticker: "QQQI", name: "NEOS NASDAQ-100(R) High Income ETF" },
  { ticker: "TLT", name: "iShares 20+Y Treasury" },
  { ticker: "VNQ", name: "Vanguard Real Estate ETF" },
  { ticker: "CASH", name: "원화·MMF" },
  { ticker: "USD", name: "달러 현금" },
];

const days: PositionDay[] = [
  { date: "2026-10-21", totalKrw: 15_019_640, flowKrw: 0, positions: null },
  {
    date: "2026-10-27",
    totalKrw: 14_791_739,
    flowKrw: 0,
    positions: [
      { ticker: "QQQI", quantity: 171, price: 53.17, currency: "USD" },
      { ticker: "RISE 200 위클리커버드콜", quantity: 261, price: 10_510, currency: "KRW" },
    ],
  },
  {
    date: "2026-10-28",
    totalKrw: 15_193_323,
    flowKrw: 203_187,
    positions: [
      { ticker: "IAU", quantity: 2, price: 76.33, currency: "USD" },
      { ticker: "QQQI", quantity: 171, price: 53.81, currency: "USD" },
      { ticker: "RISE 200 위클리커버드콜", quantity: 261, price: 10_510, currency: "KRW" },
    ],
  },
  {
    date: "2026-10-29",
    totalKrw: 15_794_644,
    flowKrw: 510_370,
    positions: [
      { ticker: "IAU", quantity: 7, price: 76.57, currency: "USD" },
      { ticker: "QQQI", quantity: 171, price: 54.12, currency: "USD" },
      { ticker: "RISE 200 위클리커버드콜", quantity: 261, price: 10_510, currency: "KRW" },
    ],
  },
  {
    date: "2026-10-30",
    totalKrw: 16_191_918,
    flowKrw: 511_583,
    positions: [
      { ticker: "CASH", quantity: 47, price: 1, currency: "KRW" },
      { ticker: "IAU", quantity: 7, price: 75.46, currency: "USD" },
      { ticker: "QQQI", quantity: 129, price: 53.4, currency: "USD" },
      { ticker: "RISE 200 위클리커버드콜", quantity: 261, price: 10_510, currency: "KRW" },
      { ticker: "TLT", quantity: 10, price: 81.26, currency: "USD" },
      { ticker: "USD", quantity: 1812.14, price: 1, currency: "USD" },
    ],
  },
  {
    date: "2026-10-31",
    totalKrw: 15_809_916,
    flowKrw: 920_447,
    positions: [
      { ticker: "475720", quantity: 261, price: 10_510, currency: "KRW", avgPrice: 12_321 },
      { ticker: "CASH", quantity: 28, price: 1, currency: "KRW", avgPrice: null },
      { ticker: "IAU", quantity: 17, price: 72.92, currency: "USD", avgPrice: 74.58 },
      { ticker: "INTC", quantity: 6, price: 65.76, currency: "USD", avgPrice: 64.84 },
      { ticker: "QQQI", quantity: 129, price: 51.66, currency: "USD", avgPrice: 54.09 },
      { ticker: "TLT", quantity: 10, price: 81.84, currency: "USD", avgPrice: 82.24 },
      { ticker: "USD", quantity: 24.98, price: 1, currency: "USD", avgPrice: null },
      { ticker: "VNQ", quantity: 7, price: 93.94, currency: "USD", avgPrice: 94.15 },
    ],
  },
];

describe("실제 포트폴리오 날짜별 history", () => {
  it("이름·코드 변경과 평균가 채움을 매매로 보지 않는다", () => {
    const flows = datedFlowLines(days, 1_333.44, holdings);
    expect(flows.map((day) => [day.date, day.lines.map((line) => `${line.kind}:${line.ticker}`)])).toEqual([
      ["2026-10-27", ["start:475720", "start:QQQI"]],
      ["2026-10-28", ["add:IAU"]],
      ["2026-10-29", ["increase:IAU"]],
      ["2026-10-30", ["add:CASH", "add:TLT", "add:USD", "decrease:QQQI"]],
      ["2026-10-31", ["add:INTC", "add:VNQ", "increase:IAU", "decrease:CASH", "decrease:USD"]],
    ]);
    expect(flows.find((day) => day.date === "2026-10-31")?.lines.map((line) => line.ticker)).not.toContain("RISE200위클리커버드콜");
    expect(hostIncomes(days, [
      { date: "2026-10-30", kind: "dividend", amountKrw: 172_288, note: "" },
      { date: "2026-10-30", kind: "interest", amountKrw: 185, note: "" },
      { date: "2026-10-30", kind: "sale", amountKrw: -352_591, note: "" },
    ]).map((item) => item.kind)).toEqual(["dividend", "interest", "sale"]);
    expect(
      quantityEvents(
        days.map((day) => ({
          date: day.date,
          positions: day.positions?.map((position) => ({ ticker: position.ticker, quantity: position.quantity })) ?? null,
        })),
        holdings,
      )
        .filter((event) => event.date === "2026-10-31")
        .map((event) => `${event.kind}:${event.ticker}`),
    ).toEqual(["decrease:CASH", "increase:IAU", "decrease:USD", "add:INTC", "add:VNQ"]);
  });
});
