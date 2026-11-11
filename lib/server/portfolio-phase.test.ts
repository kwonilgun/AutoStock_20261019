import { describe, expect, it } from "vitest";
import { cachedViewApplies } from "@/lib/server/view-cache";

const usable = {
  phase: "A3" as const,
  phaseWhy: { when: "", lead: "왜", sections: [], close: "" },
  quantityEvents: [],
  positionDays: [],
};

describe("cachedViewApplies", () => {
  it("관리자 국면과 같으면 기억을 쓴다", () => {
    expect(cachedViewApplies(usable, "A3")).toBe(true);
  });

  it("관리자 국면이 바뀌면 예전 B1 기억을 버린다", () => {
    expect(cachedViewApplies({ ...usable, phase: "B1" }, "A3")).toBe(false);
  });

  it("국면 설명이 없는 예전 기억은 쓰지 않는다", () => {
    expect(cachedViewApplies({ phase: "A3", quantityEvents: [], positionDays: [] }, "A3")).toBe(false);
  });
});
