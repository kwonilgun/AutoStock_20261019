import { describe, expect, it } from "vitest";
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

describe("괴리 묶음", () => {
  it("주식 합이 ±2%p 안이면 세부 종목이 벗어나도 과다·부족으로 세지 않는다", () => {
    const buckets = gapBuckets([
      snap({ sleeve: "US_EQUITY", currentWeight: 0.3, targetWeight: 0.25 }),
      snap({ sleeve: "KR_EQUITY", currentWeight: 0.06, targetWeight: 0.1 }),
      snap({ sleeve: "BOND_10Y", currentWeight: 0.15, targetWeight: 0.15 }),
      snap({ sleeve: "BOND_30Y", currentWeight: 0.05, targetWeight: 0.05 }),
      snap({ sleeve: "GOLD", currentWeight: 0.1, targetWeight: 0.1 }),
      snap({ sleeve: "BTC", currentWeight: 0, targetWeight: 0, currentKrw: 0 }),
      snap({ sleeve: "REIT", currentWeight: 0.1, targetWeight: 0.1 }),
      snap({ sleeve: "KRW_CASH", currentWeight: 0.15, targetWeight: 0.15 }),
      snap({ sleeve: "USD_CASH", currentWeight: 0.09, targetWeight: 0.1 }),
    ]);

    expect(buckets.map((bucket) => bucket.label)).toEqual(["주식", "채권", "자산", "현금"]);
    expect(buckets.find((bucket) => bucket.label === "주식")?.summary.status).toBe("hold");
    expect(buckets.find((bucket) => bucket.label === "자산")?.members.map((member) => member.id)).toEqual(["GOLD", "REIT"]);
    expect(buckets.filter((bucket) => bucket.summary.status === "over" || bucket.summary.status === "under")).toEqual([]);
  });

  it("묶음 합이 ±2%p를 넘으면 그 묶음만 과다 또는 부족이다", () => {
    const buckets = gapBuckets([
      snap({ sleeve: "US_EQUITY", currentWeight: 0.4, targetWeight: 0.25 }),
      snap({ sleeve: "KR_EQUITY", currentWeight: 0.1, targetWeight: 0.1 }),
      snap({ sleeve: "BOND_10Y", currentWeight: 0.1, targetWeight: 0.15 }),
      snap({ sleeve: "BOND_30Y", currentWeight: 0.05, targetWeight: 0.05 }),
      snap({ sleeve: "GOLD", currentWeight: 0.05, targetWeight: 0.1 }),
      snap({ sleeve: "REIT", currentWeight: 0.1, targetWeight: 0.1 }),
      snap({ sleeve: "KRW_CASH", currentWeight: 0.1, targetWeight: 0.15 }),
      snap({ sleeve: "USD_CASH", currentWeight: 0.1, targetWeight: 0.1 }),
    ]);

    expect(buckets.find((bucket) => bucket.label === "주식")?.summary.status).toBe("over");
    expect(buckets.find((bucket) => bucket.label === "채권")?.summary.status).toBe("under");
    expect(buckets.find((bucket) => bucket.label === "자산")?.summary.status).toBe("under");
    expect(buckets.find((bucket) => bucket.label === "현금")?.summary.status).toBe("under");
  });
});
