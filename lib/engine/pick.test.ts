import { describe, expect, it } from "vitest";
import { pickAddSeed, pickBuys, pickSells, type PickBuy, type PickSnapshot } from "./pick-context";
import { assignedPickEngine, pickVisibleCache } from "@/lib/pick-engine";
import { parsePickReason, parsePickReply, parseStoredPick, serializeStoredPick } from "./pick-parse";
import { labelPickPrefs, pickPrefsFromRow, pickPrefsKey, readPickPrefs } from "./pick-prefs";
import { PICK_REASON_SYSTEM_PROMPT, PICK_SYSTEM_PROMPT, pickReasonUserPrompt, pickUserPrompt } from "./pick-prompt";
import { buildPickSchedule, buildPickWeekPlan, formatScheduleWeek, nextTradingDays, pickPlanWeeksOf } from "./pick-schedule";
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

  it("넘치고 줄일 금액이 있는 자산군만 담고 펀드는 뺀다", () => {
    const holdings = [
      holding({ ticker: "voo", name: "Vanguard S&P 500", sleeve: "US_EQUITY", quantity: 2, price: 100, currency: "USD" }),
      holding({ ticker: "fund", sleeve: "FUND", quantity: 1, price: 10 }),
    ];
    const sells = pickSells(
      holdings,
      [
        sleeve("US_EQUITY", "over", -200_000, 5),
        sleeve("GOLD", "under", 50_000, -3),
        sleeve("FUND", "over", -10_000, 4),
        sleeve("KRW_CASH", "over", 0, 3),
      ],
      1000,
    );
    expect(sells.map((row) => row.sleeve)).toEqual(["US_EQUITY"]);
    expect(sells[0].sellKrw).toBe(200_000);
    expect(sells[0].gapPp).toBe(5);
    expect(sells[0].holdings).toEqual([{ ticker: "VOO", name: "Vanguard S&P 500", valueKrw: 200_000 }]);
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
    expect(parseStoredPick(stored)?.reason ?? null).toBeNull();
    const withReason = serializeStoredPick({
      snapshot,
      engine: "claude",
      items: [{ sleeve: "US_EQUITY", ticker: "VOO", name: "Vanguard S&P 500", note: "미국 주식 ETF" }],
      reason: "  미국주식이 부족해서 VOO를 골랐습니다.  ",
    });
    expect(parseStoredPick(withReason)?.reason).toBe("미국주식이 부족해서 VOO를 골랐습니다.");
    expect(parseStoredPick(withReason)?.plan ?? null).toBeNull();
    const withPlan = serializeStoredPick({
      snapshot,
      engine: "claude",
      items: [{ sleeve: "US_EQUITY", ticker: "VOO", name: "Vanguard S&P 500", note: "미국 주식 ETF" }],
      reason: "미국주식이 부족해서 VOO를 골랐습니다.",
      plan: "  미국주식을 유지하고 부족한 만큼 VOO를 삽니다.  ",
    });
    expect(parseStoredPick(withPlan)?.plan).toBe("미국주식을 유지하고 부족한 만큼 VOO를 삽니다.");
    expect(parseStoredPick(withPlan)?.reason).toBe("미국주식이 부족해서 VOO를 골랐습니다.");
    const reset = serializeStoredPick({ snapshot, engine: "claude", items: parseStoredPick(withReason)!.items });
    expect(reset).not.toContain("VOO를 골랐습니다");
    expect(parseStoredPick(reset)?.reason ?? null).toBeNull();
    expect(
      parseStoredPick(JSON.stringify({ snapshot, items: [{ sleeve: "US_EQUITY", ticker: "VOO", name: "Vanguard", note: "미국" }] }))?.engine,
    ).toBe("claude");
    expect(parseStoredPick(serializeStoredPick({ snapshot, engine: "claude", items: [] }))).toBeNull();
    expect(parseStoredPick("깨진 json")).toBeNull();
  });

  it("추천 모델은 설정에 저장된 값을 따른다", () => {
    expect(assignedPickEngine("claude")).toBe("claude");
    expect(assignedPickEngine("spark")).toBe("spark");
    expect(assignedPickEngine(undefined)).toBe("claude");
    expect(assignedPickEngine("openai")).toBe("claude");
  });

  it("Claude 키가 없으면 Spark로 받은 저장본을 보여 준다", () => {
    const spark = { engine: "spark" as const, items: 1 };
    const claude = { engine: "claude" as const, items: 2 };
    expect(pickVisibleCache(spark, "claude", false)).toBe(spark);
    expect(pickVisibleCache(spark, "claude", true)).toBeNull();
    expect(pickVisibleCache(claude, "claude", false)).toBe(claude);
    expect(pickVisibleCache(spark, "spark", false)).toBe(spark);
  });

  it("프롬프트는 살 금액을 고치지 말라고 잠그고 기준은 종목 선택에만 쓴다", () => {
    expect(PICK_SYSTEM_PROMPT).toContain("살 금액과 괴리 %p는 입력 JSON이 정답이다");
    expect(PICK_SYSTEM_PROMPT).toContain("금액, 비중, 괴리 %p를 고치지 마라");
    expect(PICK_SYSTEM_PROMPT).toContain("prefs가 있으면 종목 선택에만 쓴다");
    expect(PICK_SYSTEM_PROMPT).toContain("exclude가 instrument보다 우선이다");
    expect(PICK_SYSTEM_PROMPT).toContain("배당 이자 우선이면 그 자산군 안에서 배당이나 이자가 붙는 상품을 우선한다");
    expect(PICK_SYSTEM_PROMPT).toContain("preferSectors에 적힌 섹터가 있으면 그 섹터를 위주로 고른다");
    expect(PICK_REASON_SYSTEM_PROMPT).toContain("prefs에 없는 성향은 만들지 마라");
  });

  it("추천 기준은 고른 말로 넘기고 자산군과 금액은 그대로 둔다", () => {
    const prefs = readPickPrefs({
      instrument: "etf",
      addTo: "existing",
      market: "kr",
      aim: "payout",
      exclude: ["single", "leverage", "없는값"],
      sectors: ["semi", "tech"],
    });
    expect(prefs.ok).toBe(true);
    if (!prefs.ok) return;
    expect(prefs.prefs.exclude).toEqual(["leverage", "single"]);
    expect(prefs.prefs.sectors).toEqual(["tech", "semi"]);
    expect(readPickPrefs({ instrument: "stock", addTo: "fresh", market: "us", aim: "price", exclude: ["single"], sectors: [] })).toEqual({
      ok: false,
      message: "개별 종목을 빼면 개별주 위주를 고를 수 없습니다.",
    });
    expect(pickPrefsFromRow({ instrument: "", addTo: "half", market: "both", exclude: "", sectors: "" })).toBeNull();
    const snapshot: PickSnapshot = {
      phase: { id: "B1", name: "조정" },
      buys: [{ ...buy("GOLD"), label: "금", gapPp: -3 }],
      prefs: prefs.prefs,
    };
    const prompt = pickUserPrompt(snapshot);
    expect(prompt).toContain("prefs는 종목 선택에만 써라");
    expect(prompt).toContain(JSON.stringify(labelPickPrefs(prefs.prefs)));
    expect(prompt).toContain("ETF 위주");
    expect(prompt).toContain("배당 이자 우선");
    expect(pickPrefsFromRow({ instrument: "etf", addTo: "half", market: "both", aim: "", exclude: "", sectors: "" })?.aim).toBe("both");
    expect(prompt).toContain("레버리지·인버스");
    expect(prompt).toContain("반도체");
    expect(prompt).toContain("preferSectors");
    expect(prompt).not.toContain("excludeSectors");
    expect(prompt).not.toContain('"instrument":"etf"');
    const reason = pickReasonUserPrompt(snapshot, [
      { sleeve: "GOLD", ticker: "411060", name: "ACE KRX금현물", note: "한국 상장 금 ETF" },
    ]);
    expect(reason).toContain("ETF 위주");
    expect(reason).toContain("411060");
    const stored = serializeStoredPick({ snapshot, engine: "claude", items: [{ sleeve: "GOLD", ticker: "411060", name: "ACE KRX금현물", note: "한국 상장 금 ETF" }] });
    expect(pickPrefsKey(parseStoredPick(stored)?.snapshot.prefs)).toBe(pickPrefsKey(prefs.prefs));
  });

  it("이유 문장만 읽고 코드 펜스와 JSON 껍질은 벗긴다", () => {
    expect(parsePickReason("  미국주식은 괴리가 커서 VOO를 골랐습니다.  ")).toBe("미국주식은 괴리가 커서 VOO를 골랐습니다.");
    expect(parsePickReason("```\n금은 보유가 없습니다.\n```")).toBe("금은 보유가 없습니다.");
    expect(parsePickReason('{"reason":"채권 ETF가 10년 괴리를 메웁니다."}')).toBe("채권 ETF가 10년 괴리를 메웁니다.");
    expect(parsePickReason("   ")).toBe("");
    expect(parsePickReason(null)).toBe("");
  });

  it("이유 프롬프트는 화면의 종목과 괴리만 넘기고 새 종목을 막는다", () => {
    expect(PICK_REASON_SYSTEM_PROMPT).toContain("추천 종목과 괴리는 입력 JSON이 정답이다");
    expect(PICK_REASON_SYSTEM_PROMPT).toContain("새 종목을 추천하지 마라");
    const snapshot: PickSnapshot = {
      phase: { id: "B1", name: "조정" },
      buys: [{ ...buy("US_EQUITY"), label: "미국주식", gapPp: -4.2 }],
    };
    const prompt = pickReasonUserPrompt(snapshot, [
      { sleeve: "US_EQUITY", ticker: "VOO", name: "Vanguard S&P 500", note: "미국 주식 ETF" },
    ]);
    expect(prompt).toContain("이렇게 추천한 이유");
    expect(prompt).toContain("VOO");
    expect(prompt).toContain("미국주식");
    expect(prompt).toContain("-4.2");
  });

  it("향후 계획은 다음 4거래일에 매도와 매수를 나누고 합계를 유지한다", () => {
    expect(nextTradingDays("2026-11-21")).toEqual(["2026-11-23", "2026-11-24", "2026-11-25", "2026-11-26"]);
    expect(nextTradingDays("2026-11-19")).toEqual(["2026-11-20", "2026-11-23", "2026-11-24", "2026-11-25"]);
    const days = buildPickSchedule({
      fromDay: "2026-11-21",
      sells: [
        {
          sleeve: "KR_EQUITY",
          label: "한국주식",
          gapPp: 3.5,
          sellKrw: 900,
          holdings: [
            { ticker: "069500", name: "KODEX 200", valueKrw: 600 },
            { ticker: "102110", name: "TIGER 200", valueKrw: 400 },
          ],
        },
      ],
      buys: [{ ...buy("US_EQUITY"), label: "미국주식", buyKrw: 100 }],
      items: [
        { sleeve: "US_EQUITY", ticker: "VOO", name: "Vanguard" },
        { sleeve: "US_EQUITY", ticker: "SPY", name: "SPDR" },
      ],
    });
    expect(days.map((day) => day.date)).toEqual(["2026-11-23", "2026-11-24", "2026-11-25", "2026-11-26"]);
    const sold = days.flatMap((day) => day.sells);
    const bought = days.flatMap((day) => day.buys);
    expect(sold.reduce((sum, line) => sum + line.amountKrw, 0)).toBe(900);
    expect(bought.reduce((sum, line) => sum + line.amountKrw, 0)).toBe(100);
    expect(sold.filter((line) => line.ticker === "069500").reduce((sum, line) => sum + line.amountKrw, 0)).toBe(600);
    expect(sold.filter((line) => line.ticker === "102110").reduce((sum, line) => sum + line.amountKrw, 0)).toBe(300);
    expect(days.map((day) => day.buys.map((line) => line.ticker))).toEqual([["VOO"], ["SPY"], ["VOO"], ["SPY"]]);
    expect(days[0].sells[0].ticker).toBe("069500");
  });

  it("향후 계획은 매도를 먼저 두고 큰 매수를 한 종목씩 이어 가며 작은 금액은 모은다", () => {
    expect(pickPlanWeeksOf(2)).toBe(2);
    expect(pickPlanWeeksOf(3)).toBe(1);
    const small = buildPickWeekPlan({
      fromDay: "2026-11-21",
      weeks: 1,
      sells: [
        {
          sleeve: "KR_EQUITY",
          label: "한국주식",
          gapPp: 3.5,
          sellKrw: 900,
          holdings: [
            { ticker: "069500", name: "KODEX 200", valueKrw: 600 },
            { ticker: "102110", name: "TIGER 200", valueKrw: 400 },
          ],
        },
      ],
      buys: [{ ...buy("US_EQUITY"), label: "미국주식", buyKrw: 100 }],
      items: [
        { sleeve: "US_EQUITY", ticker: "VOO", name: "Vanguard" },
        { sleeve: "US_EQUITY", ticker: "SPY", name: "SPDR" },
      ],
    });
    expect(small).toHaveLength(1);
    expect(formatScheduleWeek(small[0])).toBe("1주차 · 11월 23일 월 – 11월 27일 금");
    expect(small[0].sells.map((line) => [line.ticker, line.amountKrw])).toEqual([
      ["069500", 600],
      ["102110", 300],
    ]);
    expect(small[0].buys).toEqual([
      { ticker: "VOO", name: "Vanguard", label: "미국주식", amountKrw: 100, alternates: [{ sleeve: "US_EQUITY", ticker: "SPY", name: "SPDR" }] },
    ]);

    const spread = buildPickWeekPlan({
      fromDay: "2026-11-21",
      weeks: 4,
      sells: [
        {
          sleeve: "KR_EQUITY",
          label: "한국주식",
          gapPp: 5,
          sellKrw: 1_000_000,
          holdings: [
            { ticker: "069500", name: "KODEX 200", valueKrw: 600_000 },
            { ticker: "102110", name: "TIGER 200", valueKrw: 400_000 },
          ],
        },
      ],
      buys: [
        { ...buy("US_EQUITY"), label: "미국주식", buyKrw: 600_000 },
        { ...buy("GOLD"), label: "금", buyKrw: 200_000 },
      ],
      items: [
        { sleeve: "US_EQUITY", ticker: "VOO", name: "Vanguard" },
        { sleeve: "US_EQUITY", ticker: "SPY", name: "SPDR" },
        { sleeve: "GOLD", ticker: "IAU", name: "iShares Gold" },
      ],
    });
    expect(spread.map((week) => [week.start, week.end])).toEqual([
      ["2026-11-23", "2026-11-27"],
      ["2026-11-30", "2026-12-04"],
      ["2026-12-07", "2026-12-11"],
      ["2026-12-14", "2026-12-18"],
    ]);
    expect(spread[0].sells.map((line) => line.amountKrw)).toEqual([600_000, 400_000]);
    expect(spread[0].buys).toEqual([]);
    expect(spread[1].buys.map((line) => [line.ticker, line.amountKrw])).toEqual([["VOO", 300_000]]);
    expect(spread[1].buys[0].alternates?.map((item) => item.ticker)).toEqual(["SPY"]);
    expect(spread[2].buys.map((line) => [line.ticker, line.amountKrw])).toEqual([["IAU", 200_000]]);
    expect(spread[3].buys.map((line) => [line.ticker, line.amountKrw])).toEqual([["VOO", 300_000]]);
    expect(spread.flatMap((week) => week.sells).reduce((sum, line) => sum + line.amountKrw, 0)).toBe(1_000_000);
    expect(spread.flatMap((week) => week.buys).reduce((sum, line) => sum + line.amountKrw, 0)).toBe(800_000);

    const lumped = buildPickWeekPlan({
      fromDay: "2026-11-21",
      weeks: 4,
      sells: [],
      buys: [{ ...buy("GOLD"), label: "금", buyKrw: 250_000 }],
      items: [{ sleeve: "GOLD", ticker: "IAU", name: "iShares Gold" }],
    });
    expect(lumped.map((week) => week.buys.reduce((sum, line) => sum + line.amountKrw, 0))).toEqual([125_000, 125_000, 0, 0]);
  });
});
