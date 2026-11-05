import { describe, expect, it } from "vitest";
import { incomeToKrw } from "./value";
import {
  applyIncome,
  buildAssetSeries,
  datedFlowLines,
  externalFlowKrw,
  flowLines,
  hostIncomes,
  quantityEvents,
  snapshotValuations,
} from "./history";

const points = [
  { date: "2025-12-20", totalKrw: 80_000_000 },
  { date: "2025-12-31", totalKrw: 90_000_000 },
  { date: "2026-01-15", totalKrw: 100_000_000 },
  { date: "2026-03-02", totalKrw: 110_000_000 },
  { date: "2026-03-20", totalKrw: 121_000_000 },
];

describe("자산 시계열", () => {
  it("날짜별로는 이전 날 대비 변화와 수익률을 계산한다", () => {
    const series = buildAssetSeries(points, "day");
    expect(series.points.map((point) => point.axisLabel)).toEqual(["12.20", "12.31", "1.15", "3.2", "3.20"]);
    expect(series.points[1].changeKrw).toBe(10_000_000);
    expect(series.points[1].returnRate).toBeCloseTo(0.125);
    expect(series.points[0].returnRate).toBeNull();
    expect(series.changeKrw).toBe(41_000_000);
    expect(series.returnRate).toBeCloseTo(121_000_000 / 80_000_000 - 1);
  });

  it("월별로는 그 달의 마지막 기록을 남긴다", () => {
    const series = buildAssetSeries(points, "month");
    expect(series.points.map((point) => point.key)).toEqual(["2025-12", "2026-01", "2026-03"]);
    expect(series.points.map((point) => point.totalKrw)).toEqual([90_000_000, 100_000_000, 121_000_000]);
    expect(series.points[2].label).toBe("2026년 3월");
    expect(series.points[2].changeKrw).toBe(21_000_000);
    expect(series.returnRate).toBeCloseTo(121_000_000 / 90_000_000 - 1);
  });

  it("연도별로는 그 해의 마지막 기록을 남긴다", () => {
    const series = buildAssetSeries(points, "year");
    expect(series.points.map((point) => [point.label, point.totalKrw])).toEqual([
      ["2025년", 90_000_000],
      ["2026년", 121_000_000],
    ]);
    expect(series.changeKrw).toBe(31_000_000);
    expect(series.returnRate).toBeCloseTo(121_000_000 / 90_000_000 - 1);
  });

  it("기록이 하나면 비교 수익률을 비운다", () => {
    const series = buildAssetSeries([{ date: "2026-10-27", totalKrw: 50_000_000 }], "month");
    expect(series.points).toHaveLength(1);
    expect(series.changeKrw).toBeNull();
    expect(series.returnRate).toBeNull();
  });

  it("시작 평가액이 0이면 수익률을 나누지 않는다", () => {
    const series = buildAssetSeries(
      [
        { date: "2026-01-01", totalKrw: 0 },
        { date: "2026-02-01", totalKrw: 10_000 },
      ],
      "day",
    );
    expect(series.points[1].returnRate).toBeNull();
    expect(series.returnRate).toBeNull();
    expect(series.changeKrw).toBe(10_000);
  });

  it("실행 기록이 있는 과거 날짜만 평가액으로 남긴다", () => {
    const seeds = snapshotValuations(
      [
        { date: "2026-10-19", totalKrw: 100_000_000, hasBooks: false },
        { date: "2026-10-21", totalKrw: 15_000_000, hasBooks: true },
        { date: "2026-10-21", totalKrw: 15_019_640, hasBooks: true },
        { date: "2026-10-27", totalKrw: 14_000_000, hasBooks: true },
        { date: "bad", totalKrw: 1, hasBooks: true },
      ],
      "2026-10-27",
    );
    expect(seeds).toEqual([{ date: "2026-10-21", totalKrw: 15_019_640 }]);
  });

  it("종목을 새로 넣은 금액은 손익과 수익률에서 뺀다", () => {
    const series = buildAssetSeries(
      [
        { date: "2026-10-27", totalKrw: 14_791_739 },
        { date: "2026-10-28", totalKrw: 15_193_323, flowKrw: 203_187 },
      ],
      "day",
    );
    expect(series.points[1].changeKrw).toBe(198_397);
    expect(series.points[1].flowKrw).toBe(203_187);
    expect(series.points[1].returnRate).toBeCloseTo(198_397 / 14_791_739);
    expect(series.returnRate).toBeCloseTo(198_397 / 14_791_739);
  });

  it("빈 포트폴리오에 처음 넣은 종목은 수익이 아니다", () => {
    const series = buildAssetSeries(
      [
        { date: "2026-10-27", totalKrw: 0 },
        { date: "2026-10-28", totalKrw: 10_000_000, flowKrw: 10_000_000 },
        { date: "2026-10-29", totalKrw: 10_100_000 },
      ],
      "day",
    );
    expect(series.points[1].changeKrw).toBe(0);
    expect(series.points[1].returnRate).toBeNull();
    expect(series.points[2].returnRate).toBeCloseTo(0.01);
    expect(series.changeKrw).toBe(100_000);
    expect(series.returnRate).toBeCloseTo(0.01);
  });

  it("월별 수익률은 유입을 뺀 날짜별 수익률을 이어 붙인다", () => {
    const series = buildAssetSeries(
      [
        { date: "2026-09-30", totalKrw: 100 },
        { date: "2026-10-10", totalKrw: 210, flowKrw: 100 },
        { date: "2026-10-20", totalKrw: 231 },
      ],
      "month",
    );
    expect(series.points[1].flowKrw).toBe(100);
    expect(series.points[1].changeKrw).toBe(31);
    expect(series.points[1].returnRate).toBeCloseTo(1.1 * 1.1 - 1);
  });

  it("시점마다 첫 기록부터의 누적 수익률을 이어 붙인다", () => {
    const series = buildAssetSeries(
      [
        { date: "2026-10-01", totalKrw: 100 },
        { date: "2026-10-02", totalKrw: 110 },
        { date: "2026-10-03", totalKrw: 1_099, flowKrw: 1_000 },
        { date: "2026-10-04", totalKrw: 1_208.9 },
      ],
      "day",
    );
    expect(series.points[0].cumulativeRate).toBeNull();
    expect(series.points[1].cumulativeRate).toBeCloseTo(0.1);
    expect(series.points[2].cumulativeRate).toBeCloseTo(1.1 * 0.9 - 1);
    expect(series.points[2].cumulativeKrw).toBeCloseTo(-1);
    expect(series.points[3].cumulativeRate).toBeCloseTo(1.1 * 0.9 * 1.1 - 1);
    expect(series.returnRate).toBe(series.points[3].cumulativeRate);
    expect(series.changeKrw).toBe(series.points[3].cumulativeKrw);
  });

  it("평균가가 있으면 첫 기록부터 원금 대비 수익률을 낸다", () => {
    const series = buildAssetSeries(
      [
        { date: "2026-10-31", totalKrw: 12_000_000, flowKrw: 10_000_000 },
      ],
      "day",
    );
    expect(series.points[0].changeKrw).toBe(2_000_000);
    expect(series.points[0].flowKrw).toBe(10_000_000);
    expect(series.points[0].returnRate).toBeCloseTo(0.2);
    expect(series.returnRate).toBeCloseTo(0.2);
    expect(series.changeKrw).toBe(2_000_000);
  });

  it("평균가로 넣은 종목의 평가금은 다음날 누적 수익률에 남는다", () => {
    const series = buildAssetSeries(
      [
        { date: "2026-10-31", totalKrw: 12_000_000, flowKrw: 10_000_000 },
        { date: "2026-11-01", totalKrw: 12_600_000 },
      ],
      "day",
    );
    expect(series.points[0].returnRate).toBeCloseTo(0.2);
    expect(series.points[1].returnRate).toBeCloseTo(0.05);
    expect(series.returnRate).toBeCloseTo(1.2 * 1.05 - 1);
    expect(series.changeKrw).toBe(2_600_000);
  });

  it("직전 수량과 비교해 늘어난 수량만 유입으로 본다", () => {
    const previous = [
      { ticker: "QQQI", quantity: 171, price: 53.17, currency: "USD" as const },
      { ticker: "OLD", quantity: 10, price: 1_000, currency: "KRW" as const },
    ];
    const current = [
      { ticker: "QQQI", quantity: 171, price: 53.81, currency: "USD" as const },
      { ticker: "IAU", quantity: 2, price: 76.33, currency: "USD" as const },
    ];
    const flow = externalFlowKrw({ previous, previousTotalKrw: 1, current, usdKrw: 1_330.98 });
    expect(flow).toBeCloseTo(2 * 76.33 * 1_330.98 - 10_000, -1);
  });

  it("새로 넣은 종목은 평균가로 원금을 본다", () => {
    const current = [{ ticker: "VOO", quantity: 10, price: 100, avgPrice: 80, currency: "USD" as const }];
    expect(externalFlowKrw({ previous: null, previousTotalKrw: 0, current, usdKrw: 1_000 })).toBe(800_000);
    expect(
      externalFlowKrw({
        previous: [],
        previousTotalKrw: 1,
        current,
        usdKrw: 1_000,
      }),
    ).toBe(800_000);
  });

  it("수량이 그대로인데 평균가만 넣으면 유입이 아니다", () => {
    const previous = [{ ticker: "QQQI", quantity: 129, price: 53.4, currency: "USD" as const }];
    const current = [{ ticker: "QQQI", quantity: 129, price: 51.66, avgPrice: 54.09, currency: "USD" as const }];
    expect(externalFlowKrw({ previous, previousTotalKrw: 1, current, usdKrw: 1_333.44 })).toBe(0);
    expect(flowLines({ previous, previousTotalKrw: 1, current, usdKrw: 1_333.44 })).toEqual([]);
  });

  it("늘린 수량만 평균가로 넣는다", () => {
    const previous = [{ ticker: "IAU", quantity: 7, price: 72.92, currency: "USD" as const }];
    const current = [{ ticker: "IAU", quantity: 17, price: 72.92, avgPrice: 74.58, currency: "USD" as const }];
    expect(externalFlowKrw({ previous, previousTotalKrw: 1, current, usdKrw: 1_000 })).toBeCloseTo(10 * 74.58 * 1_000);
  });

  it("종목명으로 남은 수량과 코드를 같은 종목으로 본다", () => {
    const previous = [{ ticker: "RISE 200 위클리커버드콜", quantity: 261, price: 10_510, currency: "KRW" as const }];
    const current = [{ ticker: "475720", quantity: 261, price: 10_510, avgPrice: 12_321, currency: "KRW" as const }];
    const aliases = [{ ticker: "475720", name: "RISE 200위클리커버드콜" }];
    expect(externalFlowKrw({ previous, previousTotalKrw: 1, current, usdKrw: 1_300, aliases })).toBe(0);
    expect(flowLines({ previous, previousTotalKrw: 1, current, usdKrw: 1_300, aliases })).toEqual([]);
  });

  it("직전 수량을 모르면 직전 평가액이 0일 때만 전부 유입으로 본다", () => {
    const current = [{ ticker: "CASH", quantity: 5_000, price: 1, currency: "KRW" as const }];
    expect(externalFlowKrw({ previous: null, previousTotalKrw: 0, current, usdKrw: 1_300 })).toBe(5_000);
    expect(externalFlowKrw({ previous: null, previousTotalKrw: 100, current, usdKrw: 1_300 })).toBe(0);
  });

  it("배당·이자·판매 수익은 뒤 평가일의 손익과 수익률에 더한다", () => {
    const applied = applyIncome(
      [
        { date: "2026-10-01", totalKrw: 100 },
        { date: "2026-10-10", totalKrw: 100 },
        { date: "2026-10-20", totalKrw: 110 },
      ],
      [
        { date: "2026-10-01", amountKrw: 7 },
        { date: "2026-09-01", amountKrw: 3 },
        { date: "2026-10-05", amountKrw: 4 },
        { date: "2026-10-05", amountKrw: 1 },
        { date: "2026-10-20", amountKrw: 2 },
        { date: "2026-10-21", amountKrw: 8 },
        { date: "bad", amountKrw: 9 },
      ],
    );
    expect(applied.map((point) => point.incomeKrw)).toEqual([0, 5, 10]);
    const series = buildAssetSeries(applied, "day");
    expect(series.points[1].changeKrw).toBe(5);
    expect(series.points[1].returnRate).toBeCloseTo(0.05);
    expect(series.points[1].incomeKrw).toBe(5);
    expect(series.points[2].changeKrw).toBe(20);
    expect(series.points[2].returnRate).toBeCloseTo(0.2);
    expect(series.changeKrw).toBe(25);
    expect(series.returnRate).toBeCloseTo(1.05 * 1.2 - 1);
  });

  it("달러 판매 수익은 지금 환율을 곱한 원화를 수익률에 더한다", () => {
    const amountKrw = incomeToKrw(-68.13, "USD", 1_333.44);
    const applied = applyIncome(
      [
        { date: "2026-11-01", totalKrw: 100 },
        { date: "2026-11-02", totalKrw: 100 },
      ],
      [{ date: "2026-11-02", amountKrw }],
    );
    expect(amountKrw).toBe(-90_847);
    expect(applied[1].incomeKrw).toBe(-90_847);
  });

  it("판매 손실은 그 구간 손익과 수익률에서 뺀다", () => {
    const series = buildAssetSeries(
      [
        { date: "2026-10-01", totalKrw: 1_000 },
        { date: "2026-10-02", totalKrw: 1_000, incomeKrw: -50 },
      ],
      "day",
    );
    expect(series.points[1].changeKrw).toBe(-50);
    expect(series.points[1].incomeKrw).toBe(-50);
    expect(series.points[1].returnRate).toBeCloseTo(-0.05);
    expect(series.changeKrw).toBe(-50);
    expect(series.returnRate).toBeCloseTo(-0.05);
  });

  it("현금으로 들어온 배당은 유입에서 빠졌던 금액을 수익으로 되돌린다", () => {
    const series = buildAssetSeries(
      [
        { date: "2026-10-01", totalKrw: 1_000 },
        { date: "2026-10-02", totalKrw: 1_050, flowKrw: 50, incomeKrw: 50 },
      ],
      "day",
    );
    expect(series.points[1].changeKrw).toBe(50);
    expect(series.points[1].flowKrw).toBe(50);
    expect(series.points[1].incomeKrw).toBe(50);
    expect(series.points[1].returnRate).toBeCloseTo(0.05);
  });

  it("월별 수익률에도 그 달의 배당을 이어 붙인다", () => {
    const series = buildAssetSeries(
      [
        { date: "2026-09-30", totalKrw: 100 },
        { date: "2026-10-10", totalKrw: 100, incomeKrw: 10 },
        { date: "2026-10-20", totalKrw: 110 },
      ],
      "month",
    );
    expect(series.points[1].incomeKrw).toBe(10);
    expect(series.points[1].changeKrw).toBe(20);
    expect(series.points[1].returnRate).toBeCloseTo(0.21);
  });

  it("누적 수익률은 종목 평가금과 배당·이자·판매를 합산한다", () => {
    const first = [{ ticker: "005930", quantity: 10, price: 60_000, avgPrice: 50_000, currency: "KRW" as const }];
    const current = [
      { ticker: "005930", quantity: 10, price: 70_000, avgPrice: 50_000, currency: "KRW" as const },
      { ticker: "VOO", quantity: 2, price: 120, avgPrice: 100, currency: "USD" as const },
    ];
    const series = buildAssetSeries(
      [
        { date: "2026-10-01", totalKrw: 600_000 },
        { date: "2026-10-10", totalKrw: 740_000 },
      ],
      "day",
      {
        positionDays: [
          { date: "2026-10-01", totalKrw: 600_000, flowKrw: 0, positions: first },
          { date: "2026-10-10", totalKrw: 740_000, flowKrw: 0, positions: current },
        ],
        current,
        incomes: [
          { date: "2026-09-01", amountKrw: 10_000 },
          { date: "2026-10-05", amountKrw: 20_000 },
          { date: "2026-10-20", amountKrw: 5_000 },
        ],
        usdKrw: 1_000,
      },
    );
    expect(series.points[0].holdingGainKrw).toBe(100_000);
    expect(series.points[0].cumulativeIncomeKrw).toBe(10_000);
    expect(series.points[0].cumulativeRate).toBeNull();
    expect(series.points[1].holdingGainKrw).toBe(240_000);
    expect(series.points[1].cumulativeIncomeKrw).toBe(35_000);
    expect(series.points[1].cumulativeKrw).toBe(140_000);
    expect(series.points[1].cumulativeRate).toBeCloseTo(140_000 / 600_000);
    expect(series.changeKrw).toBe(140_000);
    expect(series.returnRate).toBeCloseTo(140_000 / 600_000);
  });

  it("하루 수익률이 오르면 누적 수익률도 전날보다 오른다", () => {
    const held = (price: number) => [
      { ticker: "INTC", quantity: 6, price, avgPrice: 64.84, currency: "USD" as const },
      { ticker: "USD", quantity: 1_000, price: 1, currency: "USD" as const },
    ];
    const series = buildAssetSeries(
      [
        { date: "2026-11-01", totalKrw: 1_000_000 },
        { date: "2026-11-02", totalKrw: 900_000 },
        { date: "2026-11-03", totalKrw: 904_500 },
      ],
      "day",
      {
        positionDays: [
          { date: "2026-11-01", totalKrw: 1_000_000, flowKrw: 0, positions: held(70) },
          { date: "2026-11-02", totalKrw: 900_000, flowKrw: 0, positions: held(65.76) },
          { date: "2026-11-03", totalKrw: 904_500, flowKrw: 0, positions: held(59.97) },
        ],
        current: held(59.97),
        incomes: [],
        usdKrw: 1_343,
      },
    );
    const [, previous, today] = series.points;
    expect(today.returnRate).toBeCloseTo(0.005);
    expect(today.holdingGainKrw).toBeLessThan(previous.holdingGainKrw);
    expect(today.cumulativeRate).toBeGreaterThan(previous.cumulativeRate ?? 0);
    expect(today.cumulativeRate).toBeCloseTo(0.9 * 1.005 - 1);
  });

  it("날짜가 뒤섞여 있어도 시간순으로 맞추고 같은 날은 나중 값을 쓴다", () => {
    const series = buildAssetSeries(
      [
        { date: "2026-02-02", totalKrw: 20 },
        { date: "bad", totalKrw: 1 },
        { date: "2026-02-01", totalKrw: 10 },
        { date: "2026-02-02", totalKrw: 30 },
      ],
      "day",
    );
    expect(series.points.map((point) => point.totalKrw)).toEqual([10, 30]);
  });
});

describe("종목 수량 변화", () => {
  it("첫 기록 이후 추가, 증가, 감소, 정리를 날짜별로 남긴다", () => {
    const events = quantityEvents([
      { date: "2026-10-01", positions: null },
      {
        date: "2026-10-02",
        positions: [
          { ticker: "voo", quantity: 10 },
          { ticker: "069500", quantity: 20 },
        ],
      },
      {
        date: "2026-10-03",
        positions: [
          { ticker: "VOO", quantity: 15 },
          { ticker: "069500", quantity: 12 },
        ],
      },
      {
        date: "2026-10-04",
        positions: [
          { ticker: "VOO", quantity: 15 },
          { ticker: "QQQ", quantity: 3 },
        ],
      },
    ]);

    expect(events).toEqual([
      { date: "2026-10-02", ticker: "VOO", kind: "start", before: 0, after: 10 },
      { date: "2026-10-02", ticker: "069500", kind: "start", before: 0, after: 20 },
      { date: "2026-10-03", ticker: "VOO", kind: "increase", before: 10, after: 15 },
      { date: "2026-10-03", ticker: "069500", kind: "decrease", before: 20, after: 12 },
      { date: "2026-10-04", ticker: "069500", kind: "remove", before: 12, after: 0 },
      { date: "2026-10-04", ticker: "QQQ", kind: "add", before: 0, after: 3 },
    ]);
  });
});

describe("종목별 유입", () => {
  const previous = [
    { ticker: "QQQI", quantity: 171, price: 53.17, currency: "USD" as const },
    { ticker: "OLD", quantity: 10, price: 1_000, currency: "KRW" as const },
  ];
  const current = [
    { ticker: "QQQI", quantity: 171, price: 53.81, currency: "USD" as const },
    { ticker: "IAU", quantity: 2, price: 76.33, currency: "USD" as const },
  ];

  it("수량이 같은 종목은 빼고, 종목별 금액 합은 전체 유입과 같다", () => {
    const usdKrw = 1_330.98;
    const lines = flowLines({ previous, previousTotalKrw: 1, current, usdKrw });
    const flow = externalFlowKrw({ previous, previousTotalKrw: 1, current, usdKrw });
    expect(lines.map((line) => line.ticker)).toEqual(["IAU", "OLD"]);
    expect(lines.find((line) => line.ticker === "IAU")?.kind).toBe("add");
    expect(lines.find((line) => line.ticker === "OLD")?.kind).toBe("remove");
    expect(lines.reduce((sum, line) => sum + line.amountKrw, 0)).toBe(flow);
  });

  it("저장된 유입액에 맞춰 그날 환율로 종목을 나눈다", () => {
    const usdKrw = 1_330.98;
    const flow = externalFlowKrw({ previous, previousTotalKrw: 1, current, usdKrw });
    const dated = datedFlowLines(
      [
        { date: "2026-10-27", totalKrw: 1, flowKrw: 0, positions: previous },
        { date: "2026-10-28", totalKrw: 2, flowKrw: flow, positions: current },
      ],
      1_500,
    );
    expect(dated[0].lines.map((line) => line.ticker)).toEqual(["IAU", "OLD"]);
    expect(dated[0].lines.reduce((sum, line) => sum + line.amountKrw, 0)).toBe(flow);
    expect(dated[0].unknown).toBe(false);
  });

  it("수량을 모르는 날의 유입은 종목으로 나누지 않는다", () => {
    const dated = datedFlowLines(
      [
        { date: "2026-10-27", totalKrw: 100, flowKrw: 0, positions: previous },
        { date: "2026-10-28", totalKrw: 200, flowKrw: 50, positions: null },
      ],
      1_300,
    );
    expect(dated[0].lines).toEqual([]);
    expect(dated[0].unknown).toBe(true);
  });

  it("직전 수량을 모르면 그날 보유는 첫 기록으로 남긴다", () => {
    const current = [{ ticker: "QQQI", quantity: 171, price: 53.17, currency: "USD" as const }];
    const lines = flowLines({ previous: null, previousTotalKrw: 15_000_000, current, usdKrw: 1_300 });
    expect(lines).toEqual([
      {
        ticker: "QQQI",
        kind: "start",
        before: 0,
        after: 171,
        amountKrw: 0,
        currency: "USD",
        price: 53.17,
        usedAvg: false,
      },
    ]);
  });
});

describe("배당을 붙이는 평가일", () => {
  it("수익률에 들어가는 평가일과 발생일을 함께 남긴다", () => {
    const hosted = hostIncomes(
      [
        { date: "2026-10-01" },
        { date: "2026-10-10" },
        { date: "2026-10-20" },
      ],
      [
        { date: "2026-10-01", kind: "dividend", amountKrw: 7, note: "" },
        { date: "2026-10-05", kind: "interest", amountKrw: 4, note: "현금" },
        { date: "2026-10-05", kind: "dividend", amountKrw: 1, note: "" },
        { date: "2026-10-21", kind: "sale", amountKrw: 8, note: "QQQI" },
      ],
    );
    expect(hosted).toEqual([
      { date: "2026-10-05", hostDate: "2026-10-10", kind: "interest", amountKrw: 4, note: "현금" },
      { date: "2026-10-05", hostDate: "2026-10-10", kind: "dividend", amountKrw: 1, note: "" },
      { date: "2026-10-21", hostDate: "2026-10-20", kind: "sale", amountKrw: 8, note: "QQQI" },
    ]);
  });
});
