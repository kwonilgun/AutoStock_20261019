import { describe, expect, it } from "vitest";
import { pickAddSeed, pickBuys, type PickBuy, type PickSnapshot } from "./pick-context";
import { assignedPickEngine } from "@/lib/pick-engine";
import { parsePickReply, parseStoredPick, serializeStoredPick } from "./pick-parse";
import { PICK_SYSTEM_PROMPT } from "./pick-prompt";
import type { HoldingInput, Sleeve, SleeveSnapshot } from "./types";

function holding(partial: Partial<HoldingInput> & Pick<HoldingInput, "ticker" | "sleeve" | "quantity" | "price">): HoldingInput {
  return {
    currency: "KRW",
    bondDuration: null,
    altKind: null,
    isCoveredCall: false,
    ...partial,
  };
}

function sleeve(name: Sleeve, status: SleeveSnapshot["status"], tradeKrw: number, gapPp = -3): SleeveSnapshot {
  return {
    sleeve: name,
    currentKrw: 0,
    currentWeight: 0,
    targetWeight: 0,
    targetKrw: 0,
    gapKrw: tradeKrw,
    gapPp,
    status,
    tradeKrw,
    guardNote: null,
  };
}

function buy(name: Sleeve): PickBuy {
  return {
    sleeve: name,
    label: name,
    instrument: name,
    gapPp: -3,
    buyKrw: 1000,
    holdings: [],
  };
}

describe("추천 종목 대상", () => {
  it("부족하고 살 금액이 있는 자산군만 담고 펀드는 뺀다", () => {
    const holdings = [
      holding({ ticker: "voo", name: "Vanguard S&P 500", sleeve: "US_EQUITY", quantity: 2, price: 100, currency: "USD" }),
      holding({ ticker: "tlt", sleeve: "BOND_30Y", quantity: 1, price: 50, currency: "USD" }),
      holding({ ticker: "fund", sleeve: "FUND", quantity: 1, price: 10 }),
    ];
    const buys = pickBuys(
      holdings,
      [
        sleeve("US_EQUITY", "under", 200_000),
        sleeve("GOLD", "over", -50_000, 4),
        sleeve("KRW_CASH", "hold", 0, 0.4),
        sleeve("FUND", "under", 10_000),
        sleeve("BOND_30Y", "under", 50_000),
      ],
      1000,
    );
    expect(buys.map((row) => row.sleeve)).toEqual(["US_EQUITY", "BOND_30Y"]);
    expect(buys[0].buyKrw).toBe(200_000);
    expect(buys[0].holdings).toEqual([{ ticker: "VOO", name: "Vanguard S&P 500", valueKrw: 200_000 }]);
    expect(buys[1].holdings.map((row) => row.ticker)).toEqual(["TLT"]);
  });

  it("알고 있는 미국 티커는 달러로, 한국 코드는 원화로 자산 추가 값을 만든다", () => {
    expect(pickAddSeed("BOND_30Y", "tlt")).toEqual({ ticker: "TLT", sleeve: "BOND_30Y", currency: "USD" });
    expect(pickAddSeed("KR_EQUITY", "069500")).toEqual({ ticker: "069500", sleeve: "KR_EQUITY", currency: "KRW" });
    expect(pickAddSeed("US_EQUITY", "not a ticker")).toBeNull();
  });
});

describe("추천 종목 응답", () => {
  it("요청한 자산군의 종목만 3개까지 읽고 금액 필드는 무시한다", () => {
    const raw = [
      "```json",
      JSON.stringify({
        picks: [
          { sleeve: "US_EQUITY", ticker: "voo", name: "Vanguard S&P 500", note: "미국 주식 ETF", buyKrw: 1 },
          { sleeve: "US_EQUITY", ticker: "SPY", name: "SPDR", note: "같은 자산군" },
          { sleeve: "US_EQUITY", ticker: "QQQ", name: "Invesco", note: "같은 자산군" },
          { sleeve: "US_EQUITY", ticker: "VTI", name: "전체", note: "네 번째는 버린다" },
          { sleeve: "GOLD", ticker: "IAU", name: "금", note: "요청하지 않은 자산군" },
          { sleeve: "US_EQUITY", ticker: "VOO", name: "중복", note: "버린다" },
          { sleeve: "KR_EQUITY", ticker: "나쁜 티커", name: "없음", note: "버린다" },
        ],
      }),
      "```",
    ].join("\n");
    expect(parsePickReply(raw, [buy("US_EQUITY"), buy("KR_EQUITY")])).toEqual([
      { sleeve: "US_EQUITY", ticker: "VOO", name: "Vanguard S&P 500", note: "미국 주식 ETF" },
      { sleeve: "US_EQUITY", ticker: "SPY", name: "SPDR", note: "같은 자산군" },
      { sleeve: "US_EQUITY", ticker: "QQQ", name: "Invesco", note: "같은 자산군" },
    ]);
  });

  it("빈 응답은 종목 없이 끝난다", () => {
    expect(parsePickReply("그냥 문장입니다.", [buy("GOLD")])).toEqual([]);
    expect(parsePickReply(null, [buy("GOLD")])).toEqual([]);
  });

  it("저장한 추천은 다시 읽고, 종목이 없으면 없는 것으로 본다", () => {
    const snapshot: PickSnapshot = {
      phase: { id: "B1", name: "조정" },
      buys: [buy("US_EQUITY")],
    };
    const stored = serializeStoredPick({
      snapshot,
      engine: "spark",
      items: [{ sleeve: "US_EQUITY", ticker: "VOO", name: "Vanguard S&P 500", note: "미국 주식 ETF" }],
    });
    expect(parseStoredPick(stored)?.engine).toBe("spark");
    expect(parseStoredPick(stored)?.items.map((item) => item.ticker)).toEqual(["VOO"]);
    expect(
      parseStoredPick(JSON.stringify({ snapshot, items: [{ sleeve: "US_EQUITY", ticker: "VOO", name: "Vanguard", note: "미국" }] }))?.engine,
    ).toBe("claude");
    expect(parseStoredPick(serializeStoredPick({ snapshot, engine: "claude", items: [] }))).toBeNull();
    expect(parseStoredPick("깨진 json")).toBeNull();
  });

  it("관리자 배정은 Claude만 Claude이고 나머지는 Spark다", () => {
    expect(assignedPickEngine("claude")).toBe("claude");
    expect(assignedPickEngine("spark")).toBe("spark");
    expect(assignedPickEngine(undefined)).toBe("spark");
    expect(assignedPickEngine("openai")).toBe("spark");
  });

  it("프롬프트는 살 금액을 고치지 말라고 잠근다", () => {
    expect(PICK_SYSTEM_PROMPT).toContain("살 금액과 괴리 %p는 입력 JSON이 정답이다");
    expect(PICK_SYSTEM_PROMPT).toContain("금액, 비중, 괴리 %p를 고치지 마라");
  });
});
