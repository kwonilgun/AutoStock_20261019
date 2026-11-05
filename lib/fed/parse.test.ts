import { describe, expect, it } from "vitest";
import { parseNyFedTarget } from "./parse";

describe("parseNyFedTarget", () => {
  it("목표 범위의 하단과 상단을 읽는다", () => {
    expect(
      parseNyFedTarget({
        refRates: [{ effectiveDate: "2026-10-23", targetRateFrom: 3.75, targetRateTo: 4, percentRate: 3.88 }],
      }),
    ).toEqual({ date: "2026-10-23", low: 3.75, high: 4 });
  });

  it("범위가 없거나 날짜가 없으면 거절한다", () => {
    expect(parseNyFedTarget({ refRates: [{ effectiveDate: "2026-10-23", percentRate: 3.88 }] })).toBeNull();
    expect(parseNyFedTarget({ refRates: [] })).toBeNull();
    expect(parseNyFedTarget(null)).toBeNull();
  });
});
