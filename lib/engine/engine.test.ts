import { describe, expect, it } from "vitest";
import { classify } from "./classify";
import { ANCHOR, PHASE_WEIGHTS } from "./config";
import { exampleInput } from "./example";
import { diagnosePhase } from "./phase";
import { gapViews } from "./gap";
import { emptyMessage, rebalance } from "./rebalance";
import { buildAdjustmentBooks } from "./books";
import { buildSnapshotPayload } from "./snapshot";
import { applyGuardrail, stockWeight, targetWeights, weightProblem } from "./targets";
import { PHASES, SLEEVES, type HoldingInput, type Phase, type Sleeve } from "./types";

function orderAmount(result: ReturnType<typeof rebalance>, ticker: string, action: string) {
  return result.orders.find((order) => order.ticker === ticker && order.action === action);
}

function holding(partial: Partial<HoldingInput> & Pick<HoldingInput, "ticker" | "sleeve" | "quantity" | "price">): HoldingInput {
  return {
    currency: "KRW",
    bondDuration: null,
    altKind: null,
    isCoveredCall: false,
    ...partial,
  };
}

describe("목표 비중", () => {
  it("여섯 국면의 합이 100이고 표와 같다", () => {
    for (const phase of PHASES) {
      const { weights, notes } = targetWeights(phase);
      const sum = SLEEVES.reduce((total, sleeve) => total + weights[sleeve], 0);
      expect(sum).toBeCloseTo(1, 8);
      expect(notes).toEqual({});
      expect(weights).toEqual(PHASE_WEIGHTS[phase]);
    }
  });

  it("관리자 비중표를 넘기면 그 표를 쓴다", () => {
    const custom = { ...PHASE_WEIGHTS, B1: { ...PHASE_WEIGHTS.B1, BOND_30Y: 0.2, KRW_CASH: 0.25 } };
    expect(targetWeights("B1", custom).weights.BOND_30Y).toBeCloseTo(0.2);
    expect(targetWeights("A1", custom).weights).toEqual(PHASE_WEIGHTS.A1);
    const result = rebalance({ ...exampleInput(), weights: custom });
    expect(result.sleeves.find((sleeve) => sleeve.sleeve === "KRW_CASH")?.targetWeight).toBeCloseTo(0.25);
  });

  it("관리자 입력은 합 100%와 상한 60%를 검사한다", () => {
    expect(weightProblem(PHASE_WEIGHTS.B1)).toBeNull();
    expect(weightProblem({ ...PHASE_WEIGHTS.B1, GOLD: 0.2 })).toContain("합계");
    expect(weightProblem({ ...PHASE_WEIGHTS.A2, US_EQUITY: 0.45, KR_EQUITY: 0.2, BOND_10Y: 0, BTC: 0.05 })).toContain("상한");
  });

  it("닻은 여섯 국면의 평균이다", () => {
    const b1 = targetWeights("B1").weights;
    expect(b1.US_EQUITY).toBeCloseTo(0.1);
    expect(b1.KR_EQUITY).toBeCloseTo(0.05);
    expect(b1.BOND_10Y).toBeCloseTo(0.05);
    expect(b1.BOND_30Y).toBeCloseTo(0.3);
    expect(b1.GOLD).toBeCloseTo(0.15);
    expect(b1.BTC).toBe(0);
    expect(b1.USD_CASH).toBeCloseTo(0.15);
    expect((b1.BOND_30Y - ANCHOR.BOND_30Y) * 100).toBeCloseTo(15.833333, 4);
    expect((b1.BOND_10Y - ANCHOR.BOND_10Y) * 100).toBeCloseTo(-3.333333, 4);
    const a2 = targetWeights("A2").weights;
    expect(stockWeight(a2)).toBeCloseTo(0.55);
  });

  it("표의 0%와 5%를 가드레일이 올리지 않는다", () => {
    const b2 = targetWeights("B2").weights;
    expect(b2.KR_EQUITY).toBe(0);
    expect(b2.BTC).toBe(0);
    expect(b2.US_EQUITY).toBeCloseTo(0.05);
    expect(b2.BOND_10Y).toBeCloseTo(0.05);
    expect(b2.BOND_30Y).toBeCloseTo(0.35);
    const a2 = targetWeights("A2").weights;
    expect(a2.BOND_10Y).toBeCloseTo(0.05);
    expect(a2.BOND_30Y).toBe(0);
    expect(a2.GOLD).toBeCloseTo(0.05);
  });

  it("주식 합이 60%를 넘으면 60%로 자르고 합계를 다시 맞춘다", () => {
    const raw = {
      US_EQUITY: 0.35,
      KR_EQUITY: 0.35,
      BOND_10Y: 0.05,
      BOND_30Y: 0.05,
      GOLD: 0.1,
      BTC: 0,
      REIT: 0.05,
      KRW_CASH: 0.05,
      USD_CASH: 0,
    } satisfies Record<Sleeve, number>;
    const { weights, notes } = applyGuardrail(raw);
    const sum = SLEEVES.reduce((total, sleeve) => total + weights[sleeve], 0);
    expect(sum).toBeCloseTo(1, 6);
    expect(weights.KR_EQUITY + weights.US_EQUITY).toBeCloseTo(0.6, 6);
    expect(notes.KR_EQUITY).toContain("상한");
    expect(notes.US_EQUITY).toContain("상한");
  });
});

describe("분류", () => {
  it("알려진 티커를 자산군에 넣는다", () => {
    expect(classify("TLT")).toMatchObject({ sleeve: "BOND_30Y", bondDuration: "Y30", status: "classified" });
    expect(classify("IEF")).toMatchObject({ sleeve: "BOND_10Y", bondDuration: "Y10", status: "classified" });
    expect(classify("jepi")).toMatchObject({ sleeve: "US_EQUITY", isCoveredCall: true });
    expect(classify("VNQ")).toMatchObject({ sleeve: "REIT" });
    expect(classify("IAU")).toMatchObject({ sleeve: "GOLD" });
    expect(classify("BTC")).toMatchObject({ sleeve: "BTC" });
    expect(classify("USD")).toMatchObject({ sleeve: "USD_CASH" });
    expect(classify("069500.KS")).toMatchObject({ sleeve: "KR_EQUITY", market: "KR" });
  });

  it("모르는 티커는 예외 없이 미분류다", () => {
    expect(classify("999999")).toMatchObject({ sleeve: null, status: "unclassified" });
  });
});

describe("리밸런싱", () => {
  it("자산이 없으면 0원이고 나누기 오류가 없다", () => {
    const result = rebalance({
      phase: "B1",
      holdings: [],
      fx: { USDKRW: 1000 },
      incomes: [],
      asOf: "2026-10-19",
    });
    expect(result.totalKrw).toBe(0);
    expect(result.orders).toEqual([]);
    expect(emptyMessage(result)).toBe("자산을 입력하세요");
  });

  it("예시 계좌를 B1 비중표로 나누면 매수 합과 매도 합이 같다", () => {
    const result = rebalance(exampleInput());
    expect(result.blockedReason).toBeNull();
    expect(result.totalKrw).toBe(100_000_000);
    expect(orderAmount(result, "VOO", "sell")?.amountKrw).toBe(20_000_000);
    expect(orderAmount(result, "VOO", "sell")?.quantity).toBe(200);
    expect(orderAmount(result, "069500", "sell")?.amountKrw).toBe(15_000_000);
    expect(orderAmount(result, "069500", "sell")?.quantity).toBe(1500);
    expect(orderAmount(result, "TLT", "buy")).toBeUndefined();
    expect(orderAmount(result, "IEF", "buy")?.amountKrw).toBe(5_000_000);
    expect(orderAmount(result, "IEF", "buy")?.quantity).toBeNull();
    expect(orderAmount(result, "CASH", "add_cash")?.amountKrw).toBe(10_000_000);
    expect(orderAmount(result, "USD", "add_cash")?.amountKrw).toBe(15_000_000);
    expect(orderAmount(result, "VNQ", "buy")?.amountKrw).toBe(5_000_000);
    expect(result.orders.some((order) => order.ticker === "IAU")).toBe(false);
    const buys = result.orders
      .filter((order) => order.action === "buy" || order.action === "add_cash")
      .reduce((sum, order) => sum + order.amountKrw, 0);
    const sells = result.orders
      .filter((order) => order.action === "sell" || order.action === "use_cash")
      .reduce((sum, order) => sum + order.amountKrw, 0);
    expect(buys).toBe(35_000_000);
    expect(sells).toBe(35_000_000);
  });

  it("금 괴리 0.5%p는 건너뛰고 다른 주문 금액을 바꾸지 않는다", () => {
    const result = rebalance({
      phase: "B1",
      fx: { USDKRW: 1 },
      incomes: [],
      asOf: "2026-10-19",
      holdings: [
        holding({ ticker: "VOO", sleeve: "US_EQUITY", quantity: 30_000_000, price: 1 }),
        holding({ ticker: "069500", sleeve: "KR_EQUITY", quantity: 20_000_000, price: 1 }),
        holding({ ticker: "IEF", sleeve: "BOND_10Y", quantity: 5_000_000, price: 1, bondDuration: "Y10" }),
        holding({ ticker: "TLT", sleeve: "BOND_30Y", quantity: 25_000_000, price: 1, bondDuration: "Y30" }),
        holding({ ticker: "IAU", sleeve: "GOLD", quantity: 15_500_000, price: 1, altKind: "GOLD" }),
        holding({ ticker: "VNQ", sleeve: "REIT", quantity: 1_000_000, price: 1 }),
        holding({ ticker: "CASH", sleeve: "KRW_CASH", quantity: 3_500_000, price: 1 }),
      ],
    });
    expect(result.orders.some((order) => order.ticker === "IAU")).toBe(false);
    expect(result.holds.some((hold) => hold.sleeve === "GOLD")).toBe(true);
    expect(orderAmount(result, "VOO", "sell")?.amountKrw).toBe(20_000_000);
    expect(result.residualKrw).toBe(-500_000);
  });

  it("괴리 2.0%p는 주문하고 1.9%p는 건너뛴다", () => {
    const atBand = rebalance({
      phase: "B1",
      fx: { USDKRW: 1 },
      incomes: [],
      asOf: "2026-10-19",
      holdings: [
        holding({ ticker: "VOO", sleeve: "US_EQUITY", quantity: 10_000_000, price: 1 }),
        holding({ ticker: "069500", sleeve: "KR_EQUITY", quantity: 5_000_000, price: 1 }),
        holding({ ticker: "IEF", sleeve: "BOND_10Y", quantity: 5_000_000, price: 1, bondDuration: "Y10" }),
        holding({ ticker: "TLT", sleeve: "BOND_30Y", quantity: 30_000_000, price: 1, bondDuration: "Y30" }),
        holding({ ticker: "IAU", sleeve: "GOLD", quantity: 17_000_000, price: 1, altKind: "GOLD" }),
        holding({ ticker: "VNQ", sleeve: "REIT", quantity: 5_000_000, price: 1 }),
        holding({ ticker: "CASH", sleeve: "KRW_CASH", quantity: 15_000_000, price: 1 }),
        holding({ ticker: "USD", sleeve: "USD_CASH", quantity: 13_000_000, price: 1 }),
      ],
    });
    expect(orderAmount(atBand, "IAU", "sell")?.amountKrw).toBe(2_000_000);

    const inside = rebalance({
      phase: "B1",
      fx: { USDKRW: 1 },
      incomes: [],
      asOf: "2026-10-19",
      holdings: [
        holding({ ticker: "VOO", sleeve: "US_EQUITY", quantity: 10_000_000, price: 1 }),
        holding({ ticker: "069500", sleeve: "KR_EQUITY", quantity: 5_000_000, price: 1 }),
        holding({ ticker: "IEF", sleeve: "BOND_10Y", quantity: 5_000_000, price: 1, bondDuration: "Y10" }),
        holding({ ticker: "TLT", sleeve: "BOND_30Y", quantity: 30_000_000, price: 1, bondDuration: "Y30" }),
        holding({ ticker: "IAU", sleeve: "GOLD", quantity: 16_900_000, price: 1, altKind: "GOLD" }),
        holding({ ticker: "VNQ", sleeve: "REIT", quantity: 5_000_000, price: 1 }),
        holding({ ticker: "CASH", sleeve: "KRW_CASH", quantity: 15_000_000, price: 1 }),
        holding({ ticker: "USD", sleeve: "USD_CASH", quantity: 13_100_000, price: 1 }),
      ],
    });
    expect(inside.orders).toEqual([]);
    expect(inside.holds.some((hold) => hold.sleeve === "GOLD")).toBe(true);
  });

  it("1주 가격보다 작은 주문은 보류한다", () => {
    const result = rebalance({
      phase: "A2",
      fx: { USDKRW: 1 },
      incomes: [],
      asOf: "2026-10-19",
      holdings: [
        holding({ ticker: "VOO", sleeve: "US_EQUITY", quantity: 4, price: 10_000_000 }),
        holding({ ticker: "069500", sleeve: "KR_EQUITY", quantity: 20_000_000, price: 1 }),
        holding({ ticker: "TLT", sleeve: "BOND_30Y", quantity: 5_000_000, price: 1, bondDuration: "Y30" }),
        holding({ ticker: "IAU", sleeve: "GOLD", quantity: 5_000_000, price: 1, altKind: "GOLD" }),
        holding({ ticker: "IBIT", sleeve: "BTC", quantity: 10_000_000, price: 1, altKind: "BTC" }),
        holding({ ticker: "VNQ", sleeve: "REIT", quantity: 10_000_000, price: 1 }),
        holding({ ticker: "CASH", sleeve: "KRW_CASH", quantity: 10_000_000, price: 1 }),
      ],
    });
    expect(result.orders.some((order) => order.ticker === "VOO")).toBe(false);
    expect(result.deferred.some((line) => line.ticker === "VOO" && line.reason.includes("1주 미만"))).toBe(true);
  });

  it("인컴을 더한 뒤 가장 부족한 자산군을 가리킨다", () => {
    const result = rebalance(exampleInput([{ ticker: "JEPI", amountKrw: 450_000 }]));
    expect(result.totalKrw).toBe(100_450_000);
    expect(result.incomeKrw).toBe(450_000);
    expect(result.incomeTargetSleeve).toBe("USD_CASH");
  });

  it("A2에서는 30년물을 모두 팔고 목표에 있는 10년물은 유지한다", () => {
    const result = rebalance({
      phase: "A2",
      fx: { USDKRW: 1 },
      incomes: [],
      asOf: "2026-10-19",
      holdings: [
        holding({ ticker: "TLT", sleeve: "BOND_30Y", quantity: 20_000_000, price: 1, bondDuration: "Y30" }),
        holding({ ticker: "IEF", sleeve: "BOND_10Y", quantity: 5_000_000, price: 1, bondDuration: "Y10" }),
        holding({ ticker: "VOO", sleeve: "US_EQUITY", quantity: 30_000_000, price: 1 }),
        holding({ ticker: "069500", sleeve: "KR_EQUITY", quantity: 20_000_000, price: 1 }),
        holding({ ticker: "IAU", sleeve: "GOLD", quantity: 15_000_000, price: 1, altKind: "GOLD" }),
        holding({ ticker: "IBIT", sleeve: "BTC", quantity: 10_000_000, price: 1, altKind: "BTC" }),
      ],
    });
    expect(orderAmount(result, "TLT", "sell")?.amountKrw).toBe(20_000_000);
    expect(result.orders.some((order) => order.ticker === "IEF")).toBe(false);
  });

  it("B1에서는 넘치는 10년물만 팔고 목표에 있는 30년물은 유지한다", () => {
    const result = rebalance({
      phase: "B1",
      fx: { USDKRW: 1 },
      incomes: [],
      asOf: "2026-10-19",
      holdings: [
        holding({ ticker: "IEF", sleeve: "BOND_10Y", quantity: 20_000_000, price: 1, bondDuration: "Y10" }),
        holding({ ticker: "TLT", sleeve: "BOND_30Y", quantity: 30_000_000, price: 1, bondDuration: "Y30" }),
        holding({ ticker: "VOO", sleeve: "US_EQUITY", quantity: 10_000_000, price: 1 }),
        holding({ ticker: "069500", sleeve: "KR_EQUITY", quantity: 5_000_000, price: 1 }),
        holding({ ticker: "IAU", sleeve: "GOLD", quantity: 15_000_000, price: 1, altKind: "GOLD" }),
        holding({ ticker: "VNQ", sleeve: "REIT", quantity: 5_000_000, price: 1 }),
        holding({ ticker: "CASH", sleeve: "KRW_CASH", quantity: 15_000_000, price: 1 }),
      ],
    });
    expect(orderAmount(result, "IEF", "sell")?.amountKrw).toBe(15_000_000);
    expect(result.orders.some((order) => order.ticker === "TLT" && order.action === "sell")).toBe(false);
    const bond = gapViews(result.sleeves).find((item) => item.id === "BOND");
    expect(bond?.status).toBe("over");
    expect(bond?.currentWeight).toBeCloseTo(0.5);
    expect(bond?.targetWeight).toBeCloseTo(0.35);
    expect(gapViews(result.sleeves).some((item) => item.id === "BOND_10Y" || item.id === "BOND_30Y")).toBe(false);
  });

  it("채권 합이 ±2%p 안이면 10년물과 30년물을 서로 바꾸지 않는다", () => {
    const result = rebalance({
      phase: "B1",
      fx: { USDKRW: 1 },
      incomes: [],
      asOf: "2026-10-30",
      holdings: [
        holding({ ticker: "VOO", sleeve: "US_EQUITY", quantity: 10_000_000, price: 1 }),
        holding({ ticker: "069500", sleeve: "KR_EQUITY", quantity: 5_000_000, price: 1 }),
        holding({ ticker: "IEF", sleeve: "BOND_10Y", quantity: 8_000_000, price: 1, bondDuration: "Y10" }),
        holding({ ticker: "TLT", sleeve: "BOND_30Y", quantity: 27_500_000, price: 1, bondDuration: "Y30" }),
        holding({ ticker: "IAU", sleeve: "GOLD", quantity: 15_000_000, price: 1, altKind: "GOLD" }),
        holding({ ticker: "VNQ", sleeve: "REIT", quantity: 5_000_000, price: 1 }),
        holding({ ticker: "CASH", sleeve: "KRW_CASH", quantity: 15_000_000, price: 1 }),
        holding({ ticker: "USD", sleeve: "USD_CASH", quantity: 14_500_000, price: 1 }),
      ],
    });
    expect(result.orders.filter((order) => order.sleeve === "BOND_10Y" || order.sleeve === "BOND_30Y")).toEqual([]);
    const bond = gapViews(result.sleeves).find((item) => item.id === "BOND");
    expect(bond?.label).toBe("채권");
    expect(bond?.status).toBe("hold");
    expect(bond?.currentWeight).toBeCloseTo(0.355);
    expect(bond?.targetWeight).toBeCloseTo(0.35);
    expect(result.holds.filter((hold) => hold.reason.startsWith("채권"))).toHaveLength(1);
    expect(result.holds.some((hold) => hold.reason.startsWith("채권 10년물") || hold.reason.startsWith("채권 30년물"))).toBe(false);
  });

  it("보유가 없는 매수 종목은 저장한 현재가로 주수를 계산한다", () => {
    const result = rebalance({
      phase: "B1",
      fx: { USDKRW: 1000 },
      incomes: [],
      asOf: "2026-10-21",
      holdings: [
        holding({ ticker: "VOO", sleeve: "US_EQUITY", quantity: 10_000_000, price: 1 }),
        holding({ ticker: "IEF", sleeve: "BOND_10Y", quantity: 0, price: 100, currency: "USD", bondDuration: "Y10" }),
      ],
    });
    const order = orderAmount(result, "IEF", "buy");
    expect(result.totalKrw).toBe(10_000_000);
    expect(order?.price).toBe(100);
    expect(order?.quantity).toBe(5);
  });

  it("시세가 없으면 주문서를 만들지 않는다", () => {
    const result = rebalance({
      phase: "B1",
      fx: { USDKRW: 1000 },
      incomes: [],
      asOf: "2026-10-19",
      holdings: [holding({ ticker: "VOO", sleeve: "US_EQUITY", quantity: 10, price: null })],
    });
    expect(result.blockedReason).toContain("시세 없음");
    expect(result.orders).toEqual([]);
    expect(result.totalKrw).toBe(0);
  });

  it("시세가 없는 종목은 주문만 막고, 가격이 있는 종목은 총자산에 남긴다", () => {
    const result = rebalance({
      phase: "B1",
      fx: { USDKRW: 1000 },
      incomes: [],
      asOf: "2026-10-19",
      holdings: [
        holding({ ticker: "VOO", sleeve: "US_EQUITY", quantity: 10, price: 100, currency: "USD" }),
        holding({ ticker: "INTEL", sleeve: "US_EQUITY", quantity: 1, price: null, currency: "USD" }),
      ],
    });
    expect(result.blockedReason).toContain("INTEL");
    expect(result.orders).toEqual([]);
    expect(result.totalKrw).toBe(1_000_000);
  });
});

describe("스냅샷", () => {
  it("저장 당시 채권 목표를 복사해 두고 이후 결과 변경에 영향받지 않는다", () => {
    const result = rebalance(exampleInput());
    const payload = buildSnapshotPayload(
      result,
      {
        yearMonth: "2026-10",
        phase: "B1",
        phaseSource: "manual",
      },
      buildAdjustmentBooks({
        holdings: exampleInput().holdings,
        incomeKrw: result.incomeKrw,
        orders: result.orders,
        usdKrw: exampleInput().fx.USDKRW,
      }),
    );
    const bond = result.sleeves.find((sleeve) => sleeve.sleeve === "BOND_30Y");
    expect(bond?.targetWeight).toBeCloseTo(0.3);
    if (bond) bond.targetWeight = 0.99;
    expect(JSON.parse(payload.targetsJson).BOND_30Y).toBeCloseTo(0.3);
  });
});

describe("자동 국면", () => {
  it("1단계에서는 국면을 만들지 않는다", () => {
    const diagnosed = diagnosePhase({
      rateZone: "HIGH",
      rateDirection: "DOWN",
      equity: "RISK_ON",
      previousPhase: null,
    });
    expect(diagnosed.phase).toBeNull();
  });
});

describe("국면 전환", () => {
  it("국면마다 목표 비중이 바뀐다", () => {
    const phases: Phase[] = ["A1", "B1", "B3"];
    const bonds = phases.map((phase) => targetWeights(phase).weights.BOND_30Y);
    expect(new Set(bonds).size).toBe(3);
  });
});
