import { describe, expect, it } from "vitest";
import { adviceTextProblem } from "./advice-check";
import { ADVICE_HOLDING_LIMIT, adviceContext, type AdviceContext } from "./advice-context";
import { draftAdvice } from "./advice-draft";
import { exampleInput } from "./example";
import { rebalance } from "./rebalance";
import type { HoldingInput, RebalanceResult, Sleeve } from "./types";

function holding(partial: Partial<HoldingInput> & Pick<HoldingInput, "ticker" | "sleeve" | "quantity" | "price">): HoldingInput {
  return {
    currency: "KRW",
    bondDuration: null,
    altKind: null,
    isCoveredCall: false,
    ...partial,
  };
}

function emptyResult(partial: Partial<RebalanceResult> = {}): RebalanceResult {
  return {
    totalKrw: 0,
    sleeves: [],
    orders: [],
    holds: [],
    deferred: [],
    incomeKrw: 0,
    incomeTargetSleeve: null,
    residualKrw: 0,
    blockedReason: null,
    ...partial,
  };
}

describe("자문 컨텍스트", () => {
  it("예시 계좌의 주문과 티커만 담고 개인 식별 필드는 없다", () => {
    const input = exampleInput();
    const context = adviceContext({
      asOf: "2026-11-17",
      phase: "B1",
      usdKrw: input.fx.USDKRW,
      fedLow: 3.75,
      fedHigh: 4,
      holdings: input.holdings,
      result: rebalance(input),
    });
    const encoded = JSON.stringify(context);
    expect(encoded).not.toMatch(/email|userId|password/i);
    expect(context.phase.id).toBe("B1");
    expect(context.phase.name).toBe("조정");
    expect(context.holdings.map((row) => row.ticker)).toEqual(expect.arrayContaining(["VOO", "TLT"]));
    expect(context.sleeves.map((row) => row.sleeve)).toContain("BOND_30Y");
    expect(context.orders.every((order) => input.holdings.some((row) => row.ticker === order.ticker) || order.ticker.length > 0)).toBe(true);
    expect(context.fedTarget).toEqual({ low: 3.75, high: 4 });
  });

  it("과다·부족 자산군의 대표 종목은 평가액 상한 밖이어도 남긴다", () => {
    const us = Array.from({ length: 14 }, (_, index) =>
      holding({
        ticker: `US${index}`,
        sleeve: "US_EQUITY",
        quantity: 20 - index,
        price: 1_000_000,
      }),
    );
    const gold = holding({ ticker: "GOLD1", sleeve: "GOLD", quantity: 1, price: 1_000 });
    const holdings = [...us, gold];
    const total = holdings.reduce((sum, row) => sum + row.quantity * (row.price ?? 0), 0);
    const context = adviceContext({
      asOf: "2026-11-17",
      phase: "B1",
      usdKrw: 1400,
      fedLow: null,
      fedHigh: null,
      holdings,
      result: emptyResult({
        totalKrw: total,
        sleeves: [
          sleeve("US_EQUITY", "over"),
          sleeve("GOLD", "under"),
          sleeve("KRW_CASH", "hold"),
        ],
      }),
    });
    expect(context.holdings).toHaveLength(ADVICE_HOLDING_LIMIT);
    expect(context.holdings.some((row) => row.ticker === "GOLD1")).toBe(true);
    expect(context.holdings.some((row) => row.ticker === "US13")).toBe(false);
  });

  it("보유가 없으면 네 칸 초안이 주문을 만들지 않는다", () => {
    const context = adviceContext({
      asOf: "2026-11-17",
      phase: "A2",
      usdKrw: 1400,
      fedLow: null,
      fedHigh: null,
      holdings: [],
      result: emptyResult(),
    });
    const draft = draftAdvice(context);
    expect(draft.portfolio).toContain("입력된 보유가 없어");
    expect(draft.actions).toContain("주문도 없습니다");
    expect(context.phase.why.length).toBeGreaterThan(0);
  });

  it("주문이 없으면 행동 칸은 매매하지 않는다고 말한다", () => {
    const input = exampleInput();
    const result = rebalance(input);
    const quiet: RebalanceResult = { ...result, orders: [], holds: result.sleeves.filter((sleeve) => sleeve.status === "hold").map((sleeve) => ({
      sleeve: sleeve.sleeve,
      gapPp: sleeve.gapPp,
      reason: `${sleeve.sleeve} 유지`,
    })) };
    const draft = draftAdvice(
      adviceContext({
        asOf: "2026-11-17",
        phase: "B1",
        usdKrw: 1000,
        fedLow: null,
        fedHigh: null,
        holdings: input.holdings,
        result: quiet,
      }),
    );
    expect(draft.actions).toContain("주문은 없습니다");
  });
});

describe("자문 응답 검사", () => {
  const context = baseContext();

  it("보유에 없는 티커는 거절한다", () => {
    expect(adviceTextProblem(sections("SCHD를 추가로 봅니다."), context)).toContain("SCHD");
  });

  it("보유 티커와 국면 코드는 통과한다", () => {
    expect(adviceTextProblem(sections("B1 국면에서 VOO는 그대로 둡니다. ETF로 분류합니다."), context)).toBeNull();
  });

  it("유지 자산군을 행동 칸에서 매수하라고 하면 거절한다", () => {
    expect(adviceTextProblem(sections("미국주식 매수 100만 원.", "actions"), context)).toContain("미국주식");
  });
});

function sections(sentence: string, field: "phase" | "actions" = "phase") {
  return {
    phase: "국면입니다.",
    portfolio: "포트폴리오입니다.",
    actions: "주문은 없습니다.",
    leave: "그대로 둡니다.",
    [field]: sentence,
  };
}

function baseContext(): AdviceContext {
  return {
    asOf: "2026-11-17",
    phase: { id: "B1", name: "조정", environment: "경기 둔화", why: "이유", stance: "스탠스" },
    fx: { USDKRW: 1400 },
    fedTarget: { low: null, high: null },
    totalKrw: 100,
    sleeves: [
      { sleeve: "US_EQUITY", label: "미국주식", currentWeight: 0.1, targetWeight: 0.1, gapPp: 0, status: "match", gapKrw: 0, tradeKrw: 0 },
    ],
    holdings: [{ ticker: "VOO", name: "Vanguard", sleeve: "US_EQUITY", weight: 1, valueKrw: 100, returnPct: null }],
    orders: [],
    holds: [],
    deferred: [],
  };
}

function sleeve(name: Sleeve, status: RebalanceResult["sleeves"][number]["status"]): RebalanceResult["sleeves"][number] {
  return {
    sleeve: name,
    currentKrw: 0,
    currentWeight: 0,
    targetWeight: 0,
    targetKrw: 0,
    gapKrw: 0,
    gapPp: 0,
    status,
    tradeKrw: 0,
    guardNote: null,
  };
}
