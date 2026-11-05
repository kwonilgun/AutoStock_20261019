import { describe, expect, it } from "vitest";
import { isReportDate } from "@/lib/reports";

describe("isReportDate", () => {
  const today = "2026-11-01";

  it("오늘과 지난날은 받는다", () => {
    expect(isReportDate("2026-11-01", today)).toBe(true);
    expect(isReportDate("2020-01-01", today)).toBe(true);
  });

  it("미래와 없는 날짜는 거절한다", () => {
    expect(isReportDate("2026-11-02", today)).toBe(false);
    expect(isReportDate("2026-02-31", today)).toBe(false);
    expect(isReportDate("2026-11-1", today)).toBe(false);
    expect(isReportDate("", today)).toBe(false);
  });
});