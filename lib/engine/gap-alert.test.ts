import { describe, expect, it } from "vitest";
import { alertHits, alertSlot, crossesGapAlert, formatGapAlert, isBareTelegramStart, telegramStartCode } from "./gap-alert";
import { gapBuckets } from "./gap";
import type { SleeveSnapshot } from "./types";

function snap(
  partial: Pick<SleeveSnapshot, "sleeve" | "currentWeight" | "targetWeight"> & Partial<SleeveSnapshot>,
): SleeveSnapshot {
  return {
    currentKrw: partial.currentWeight * 100_000_000,
    targetKrw: partial.targetWeight * 100_000_000,
    gapKrw: 0,
    gapPp: (partial.currentWeight - partial.targetWeight) * 100,
    status: "hold",
    tradeKrw: 0,
    guardNote: null,
    ...partial,
  };
}

function book(stock: number, cash: number) {
  return gapBuckets([
    snap({ sleeve: "US_EQUITY", currentWeight: stock - 0.1, targetWeight: 0.25 }),
    snap({ sleeve: "KR_EQUITY", currentWeight: 0.1, targetWeight: 0.1 }),
    snap({ sleeve: "BOND_10Y", currentWeight: 0.15, targetWeight: 0.15 }),
    snap({ sleeve: "BOND_30Y", currentWeight: 0.05, targetWeight: 0.05 }),
    snap({ sleeve: "GOLD", currentWeight: 0.1, targetWeight: 0.1 }),
    snap({ sleeve: "BTC", currentWeight: 0, targetWeight: 0, currentKrw: 0 }),
    snap({ sleeve: "REIT", currentWeight: 0.1, targetWeight: 0.1 }),
    snap({ sleeve: "KRW_CASH", currentWeight: cash - 0.1, targetWeight: 0.15 }),
    snap({ sleeve: "USD_CASH", currentWeight: 0.1, targetWeight: 0.1 }),
  ]);
}

describe("괴리 알림", () => {
  it("화면과 같이 반올림한 절대값이 5%p 이상일 때만 고른다", () => {
    expect(crossesGapAlert(4.94)).toBe(false);
    expect(crossesGapAlert(4.95)).toBe(true);
    expect(crossesGapAlert(-5)).toBe(true);
    expect(alertHits(book(0.399, 0.201)).map((bucket) => bucket.label)).toEqual([]);
    expect(alertHits(book(0.4, 0.2)).map((bucket) => bucket.label)).toEqual(["주식", "현금"]);
    expect(alertHits(book(0.4, 0.2), { over: 6, under: 4 }).map((bucket) => bucket.label)).toEqual(["현금"]);
    expect(crossesGapAlert(6, { over: 6, under: 10 })).toBe(true);
    expect(crossesGapAlert(-3.9, { over: 6, under: 4 })).toBe(false);
  });

  it("알림 문장에는 범위를 벗어난 묶음만 적는다", () => {
    const text = formatGapAlert("11월 27일 오전 08:00", alertHits(book(0.4, 0.2)));
    expect(text).toContain("주식 과다 +5%p");
    expect(text).toContain("현금 부족 −5%p");
    expect(text).toContain("지금 40% · 목표 35%");
    expect(text).toContain("지금 20% · 목표 25%");
    expect(text).not.toContain("채권");
    const band = { over: 6, under: 4 };
    const narrow = formatGapAlert("11월 27일 오전 08:00", alertHits(book(0.4, 0.2), band), "에그발란스 괴리", band);
    expect(narrow).toContain("현금 부족 −5%p");
    expect(narrow).toContain("· 원화 −5%p");
    expect(narrow).not.toContain("주식");
    expect(narrow).not.toContain("달러");
  });

  it("서울 오전 8시와 오후 2시 앞 90분만 회차로 본다", () => {
    expect(alertSlot(new Date("2026-11-26T23:00:00Z"))).toBe("08");
    expect(alertSlot(new Date("2026-11-27T00:29:00Z"))).toBe("08");
    expect(alertSlot(new Date("2026-11-27T00:30:00Z"))).toBe(null);
    expect(alertSlot(new Date("2026-11-27T05:00:00Z"))).toBe("14");
    expect(alertSlot(new Date("2026-11-27T06:29:00Z"))).toBe("14");
    expect(alertSlot(new Date("2026-11-27T06:30:00Z"))).toBe(null);
  });

  it("텔레그램 시작 메시지에서 연결 코드만 꺼낸다", () => {
    expect(telegramStartCode("/start AB12CD34")).toBe("AB12CD34");
    expect(telegramStartCode("/start@EggBalanceBot AB12CD34")).toBe("AB12CD34");
    expect(telegramStartCode("AB12CD34")).toBe("AB12CD34");
    expect(telegramStartCode("안녕하세요")).toBe(null);
    expect(isBareTelegramStart("/start")).toBe(true);
    expect(isBareTelegramStart("/start@KwonEggBalance")).toBe(true);
    expect(isBareTelegramStart("/start AB12CD34")).toBe(false);
  });
});
