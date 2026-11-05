import { describe, expect, it } from "vitest";
import { holdingGain, incomeMoney, incomeToKrw, portfolioHoldingGain } from "./value";

describe("평균가 대비 평가금", () => {
  it("현재가와 평균가의 차이를 수익률과 평가금으로 낸다", () => {
    const gain = holdingGain(
      { quantity: 10, price: 70_000, avgPrice: 50_000, currency: "KRW" },
      1_300,
    );
    expect(gain).toEqual({
      costKrw: 500_000,
      valueKrw: 700_000,
      gainKrw: 200_000,
      rate: 0.4,
    });
  });

  it("달러 종목은 환율을 평가금에만 넣고 수익률은 가격 비율로 본다", () => {
    const gain = holdingGain({ quantity: 2, price: 120, avgPrice: 100, currency: "USD" }, 1_000);
    expect(gain?.costKrw).toBe(200_000);
    expect(gain?.valueKrw).toBe(240_000);
    expect(gain?.gainKrw).toBe(40_000);
    expect(gain?.rate).toBeCloseTo(0.2);
  });

  it("평균가가 없으면 비운다", () => {
    expect(holdingGain({ quantity: 10, price: 70_000, currency: "KRW" }, 1_300)).toBeNull();
  });

  it("종목별 평가금을 합산하고 현금은 뺀다", () => {
    const gain = portfolioHoldingGain(
      [
        { quantity: 10, price: 70_000, avgPrice: 50_000, currency: "KRW" },
        { quantity: 2, price: 120, avgPrice: 100, currency: "USD" },
        { quantity: 1_000_000, price: 1, currency: "KRW" },
      ],
      1_000,
    );
    expect(gain?.costKrw).toBe(700_000);
    expect(gain?.gainKrw).toBe(240_000);
    expect(gain?.rate).toBeCloseTo(240_000 / 700_000);
  });
});

describe("수익 금액", () => {
  it("원화는 원 단위로 두고 달러는 지금 환율을 곱한다", () => {
    expect(incomeMoney(450_000.4, "KRW", 1_400)).toEqual({ amount: 450_000, amountKrw: 450_000 });
    expect(incomeMoney(12.345, "USD", 1_400)).toEqual({ amount: 12.35, amountKrw: 17_290 });
    expect(incomeMoney(-20, "USD", 1_300.4)).toEqual({ amount: -20, amountKrw: -26_008 });
    expect(incomeToKrw(-68.13, "USD", 1_333.44)).toBe(-90_847);
  });

  it("0원, 환율 없음, 한도를 넘는 금액은 받지 않는다", () => {
    expect(incomeMoney(0, "KRW", 1_400)).toBeNull();
    expect(incomeMoney(0.001, "USD", 1_400)).toBeNull();
    expect(incomeMoney(10, "USD", 0)).toBeNull();
    expect(incomeMoney(2_000_000_000_000, "KRW", 1_400)).toBeNull();
  });
});
