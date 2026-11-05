import { describe, expect, it } from "vitest";
import { formatGroupedInput, formatUsd, groupedInputCaret } from "./format";

describe("formatUsd", () => {
  it("keeps dollar amounts to two decimal places", () => {
    expect(formatUsd(1234.56789)).toBe("$1,234.57");
    expect(formatUsd(10.1)).toBe("$10.10");
    expect(formatUsd(100)).toBe("$100.00");
    expect(formatUsd(0.1 * 3)).toBe("$0.30");
    expect(formatUsd(-12.345)).toBe("-$12.35");
  });
});

describe("금액 입력 쉼표", () => {
  it("정수 세 자리마다 쉼표를 붙인다", () => {
    expect(formatGroupedInput("1")).toBe("1");
    expect(formatGroupedInput("1234")).toBe("1,234");
    expect(formatGroupedInput("1234567")).toBe("1,234,567");
    expect(formatGroupedInput("1,234,567")).toBe("1,234,567");
    expect(formatGroupedInput("-450000")).toBe("−450,000");
    expect(formatGroupedInput("1234.5")).toBe("1,234.5");
    expect(formatGroupedInput("")).toBe("");
    expect(formatGroupedInput("-")).toBe("−");
  });

  it("쉼표가 생겨도 숫자 위치에 캐럿을 둔다", () => {
    expect(groupedInputCaret("1234", 4, "1,234")).toBe(5);
    expect(groupedInputCaret("1,2534", 4, "12,534")).toBe(4);
    expect(groupedInputCaret("−1,234", 1, "−1,234")).toBe(1);
  });
});
