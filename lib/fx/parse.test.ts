import { describe, expect, it } from "vitest";
import { parseYahooUsdKrw } from "./parse";

describe("parseYahooUsdKrw", () => {
  it("reads the regular market price in won per dollar", () => {
    expect(parseYahooUsdKrw({ chart: { result: [{ meta: { regularMarketPrice: 1326.05 } }] } })).toBe(1326.05);
    expect(parseYahooUsdKrw({ chart: { result: [{ meta: { regularMarketPrice: 1326.056 } }] } })).toBe(1326.06);
  });

  it("uses the latest close when the market price is missing", () => {
    expect(
      parseYahooUsdKrw({
        chart: { result: [{ meta: {}, indicators: { quote: [{ close: [1300, null, 1310.2] }] } }] },
      }),
    ).toBe(1310.2);
  });

  it("rejects an empty, zero, or non-numeric quote", () => {
    expect(parseYahooUsdKrw(null)).toBeNull();
    expect(parseYahooUsdKrw({ chart: { result: null, error: { description: "missing" } } })).toBeNull();
    expect(parseYahooUsdKrw({ chart: { result: [{ meta: { regularMarketPrice: 0 } }] } })).toBeNull();
    expect(parseYahooUsdKrw({ chart: { result: [{ meta: { regularMarketPrice: -1 } }] } })).toBeNull();
    expect(parseYahooUsdKrw({ chart: { result: [{ meta: { regularMarketPrice: "1326" } }] } })).toBeNull();
  });
});
