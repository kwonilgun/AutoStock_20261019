import { describe, expect, it } from "vitest";
import { parseRecommendAddSeed, parseRecommendItems, recommendAddSeed } from "./recommendations";

const item = (ticker: string, name = "") => ({ ticker, name, note: "" });

describe("recommendAddSeed", () => {
  it("counts a cash ETF as cash and keeps the ticker", () => {
    expect(recommendAddSeed("CASH_ETF", item("459580", "KODEX CD금리액티브"))).toEqual({
      ticker: "459580",
      sleeve: "KRW_CASH",
      currency: "KRW",
    });
    expect(recommendAddSeed("CASH_ETF", item("SGOV", "초단기 미국국채"))).toEqual({
      ticker: "SGOV",
      sleeve: "USD_CASH",
      currency: "USD",
    });
  });

  it("keeps other categories on their own sleeve", () => {
    expect(recommendAddSeed("BOND_ETF", item("TLT"))?.sleeve).toBe("BOND_30Y");
  });
});

describe("parseRecommendAddSeed", () => {
  it("accepts a cash sleeve from the recommend link", () => {
    expect(parseRecommendAddSeed({ ticker: "SGOV", sleeve: "USD_CASH", currency: "USD" })).toEqual({
      ticker: "SGOV",
      sleeve: "USD_CASH",
      currency: "USD",
    });
  });
});

describe("parseRecommendItems", () => {
  it("reads a saved cash ETF list", () => {
    const items = parseRecommendItems(JSON.stringify({ CASH_ETF: [item("459580", "KODEX CD금리액티브")] }));
    expect(items.CASH_ETF).toEqual([item("459580", "KODEX CD금리액티브")]);
    expect(items.US_STOCK).toEqual([]);
  });
});
