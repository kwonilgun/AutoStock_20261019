import { describe, expect, it } from "vitest";
import { parseNaverName, parseNaverSearch, parseYahooName, parseYahooQuote } from "./parse";

describe("security names", () => {
  it("prefers the Yahoo long name and falls back to the short name", () => {
    expect(parseYahooName({ chart: { result: [{ meta: { longName: "Schwab U.S. Dividend Equity ETF", shortName: "SCHD" } }] } })).toBe(
      "Schwab U.S. Dividend Equity ETF",
    );
    expect(parseYahooName({ chart: { result: [{ meta: { shortName: " Apple  Inc. " } }] } })).toBe("Apple Inc.");
    expect(parseYahooName({ chart: { result: [{ meta: {} }] } })).toBeNull();
    expect(parseYahooName(null)).toBeNull();
  });

  it("picks the exact Korean or US match from a Naver search", () => {
    const payload = {
      items: [
        { code: "0162Z0", name: "RISE 삼성전자SK하이닉스채권혼합50", nationCode: "KOR" },
        { code: "005930", name: "삼성전자", nationCode: "KOR" },
        { code: "164A", name: "애플파크", nationCode: "JPN" },
      ],
    };
    expect(parseNaverSearch(payload, "삼성전자")).toEqual({ code: "005930", name: "삼성전자", market: "KR" });
    expect(parseNaverSearch(payload, "삼성")).toEqual({
      code: "0162Z0",
      name: "RISE 삼성전자SK하이닉스채권혼합50",
      market: "KR",
    });
    expect(parseNaverSearch({ items: [{ code: "164A", name: "애플파크", nationCode: "JPN" }] }, "애플파크")).toBeNull();
    expect(parseNaverSearch(null, "삼성전자")).toBeNull();
  });

  it("reads the Naver stock name", () => {
    expect(parseNaverName({ itemCode: "005930", stockName: "삼성전자" })).toBe("삼성전자");
    expect(parseNaverName({ stockName: "" })).toBeNull();
    expect(parseNaverName("x")).toBeNull();
  });
});

describe("parseYahooQuote", () => {
  it("reads the regular market price and currency", () => {
    expect(parseYahooQuote({ chart: { result: [{ meta: { currency: "USD", regularMarketPrice: 703.414 } }] } })).toEqual({
      price: 703.41,
      currency: "USD",
    });
    expect(parseYahooQuote({ chart: { result: [{ meta: { currency: "KRW", regularMarketPrice: 89215 } }] } })).toEqual({
      price: 89215,
      currency: "KRW",
    });
  });

  it("uses the latest close when the market price is missing", () => {
    expect(
      parseYahooQuote({
        chart: { result: [{ meta: { currency: "USD" }, indicators: { quote: [{ close: [100, null, 101.2] }] } }] },
      }),
    ).toEqual({ price: 101.2, currency: "USD" });
  });

  it("rejects a quote without a supported currency or a positive price", () => {
    expect(parseYahooQuote(null)).toBeNull();
    expect(parseYahooQuote({ chart: { result: [{ meta: { regularMarketPrice: 10 } }] } })).toBeNull();
    expect(parseYahooQuote({ chart: { result: [{ meta: { currency: "EUR", regularMarketPrice: 10 } }] } })).toBeNull();
    expect(parseYahooQuote({ chart: { result: [{ meta: { currency: "USD", regularMarketPrice: 0 } }] } })).toBeNull();
  });
});
