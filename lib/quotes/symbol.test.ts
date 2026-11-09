import { describe, expect, it } from "vitest";
import { acceptsAutoQuote, yahooSymbols } from "./symbol";

describe("yahooSymbols", () => {
  it("maps US tickers as-is and Korean codes to the exchange suffix", () => {
    expect(yahooSymbols("voo")).toEqual(["VOO"]);
    expect(yahooSymbols("QQQI")).toEqual(["QQQI"]);
    expect(yahooSymbols("069500")).toEqual(["069500.KS", "069500.KQ"]);
    expect(yahooSymbols("069500.KS")).toEqual(["069500.KS", "069500.KQ"]);
    expect(yahooSymbols("BTC")).toEqual(["BTC-USD"]);
  });

  it("skips cash and names that are not ticker codes", () => {
    expect(yahooSymbols("CASH")).toEqual([]);
    expect(yahooSymbols("USD")).toEqual([]);
    expect(yahooSymbols("MMF")).toEqual([]);
    expect(yahooSymbols("RISE 200 위클리커버드콜")).toEqual([]);
  });
});

describe("acceptsAutoQuote", () => {
  const holding = { priceSource: "auto", currency: "USD", sleeve: "US_EQUITY", ticker: "VOO" };

  it("accepts a fresh quote in the same currency", () => {
    expect(acceptsAutoQuote(holding, { fresh: true, currency: "USD" })).toBe(true);
  });

  it("keeps the stored price when the quote is stale, manual, cash, or in another currency", () => {
    expect(acceptsAutoQuote(holding, { fresh: false, currency: "USD" })).toBe(false);
    expect(acceptsAutoQuote(holding, null)).toBe(false);
    expect(acceptsAutoQuote({ ...holding, priceSource: "manual" }, { fresh: true, currency: "USD" })).toBe(false);
    expect(acceptsAutoQuote({ ...holding, sleeve: "KRW_CASH", ticker: "CASH" }, { fresh: true, currency: "KRW" })).toBe(false);
    expect(acceptsAutoQuote({ ...holding, sleeve: "USD_CASH", ticker: "SGOV" }, { fresh: true, currency: "USD" })).toBe(true);
    expect(acceptsAutoQuote({ ...holding, currency: "KRW", ticker: "IAU" }, { fresh: true, currency: "USD" })).toBe(false);
  });
});
