import { describe, expect, it } from "vitest";
import { parseTossAccountSeq, parseTossHoldings } from "./parse";

const holdingsPayload = {
  result: {
    items: [
      {
        symbol: "005930",
        name: "삼성전자",
        marketCountry: "KR",
        currency: "KRW",
        quantity: "100",
        lastPrice: "72000",
        averagePurchasePrice: "65000",
      },
      {
        symbol: "AAPL",
        name: "Apple Inc.",
        marketCountry: "US",
        currency: "USD",
        quantity: "10.5",
        lastPrice: "178.5",
        averagePurchasePrice: "155.3",
      },
      {
        symbol: "000000",
        name: "빈 수량",
        marketCountry: "KR",
        currency: "KRW",
        quantity: "0",
        lastPrice: "1000",
        averagePurchasePrice: "1000",
      },
    ],
  },
};

describe("토스 보유 응답", () => {
  it("종목명, 수량, 현재가, 평균금액을 숫자로 읽는다", () => {
    expect(parseTossHoldings(holdingsPayload)).toEqual([
      {
        symbol: "005930",
        name: "삼성전자",
        marketCountry: "KR",
        currency: "KRW",
        quantity: 100,
        lastPrice: 72000,
        averagePurchasePrice: 65000,
      },
      {
        symbol: "AAPL",
        name: "Apple Inc.",
        marketCountry: "US",
        currency: "USD",
        quantity: 10.5,
        lastPrice: 178.5,
        averagePurchasePrice: 155.3,
      },
    ]);
  });

  it("items가 없으면 거절한다", () => {
    expect(() => parseTossHoldings({ result: {} })).toThrow("보유 응답 형식이 아닙니다.");
  });

  it("종합매매 계좌의 일련번호만 고른다", () => {
    expect(
      parseTossAccountSeq({
        result: [
          { accountSeq: 3, accountType: "PENSION_SAVINGS" },
          { accountSeq: 1, accountType: "BROKERAGE", accountNo: "12345678901" },
        ],
      }),
    ).toBe(1);
  });
});
