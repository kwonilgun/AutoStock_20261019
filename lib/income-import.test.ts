import { describe, expect, it } from "vitest";
import { incomeImportKey, parseImportedIncomes } from "@/lib/income-import";

describe("parseImportedIncomes", () => {
  it("코드 펜스 안의 배당, 이자, 판매 수익을 읽는다", () => {
    const rows = parseImportedIncomes(
      '```json\n{"incomes":[{"kind":"dividend","date":"2026-03-15","amount":"450,000","currency":"KRW","note":"JEPI"},{"kind":"interest","date":"2026-03-01","amount":1200,"currency":"KRW","note":""},{"kind":"sale","date":"2026-02-20","amount":"−15000","currency":"USD","note":"VOO"}]}\n```',
    );
    expect(rows).toEqual([
      { kind: "dividend", date: "2026-03-15", amount: 450000, currency: "KRW", note: "JEPI" },
      { kind: "interest", date: "2026-03-01", amount: 1200, currency: "KRW", note: "" },
      { kind: "sale", date: "2026-02-20", amount: -15000, currency: "USD", note: "VOO" },
    ]);
  });

  it("계좌번호나 다른 필드가 있으면 거절한다", () => {
    expect(() =>
      parseImportedIncomes({
        incomes: [{ kind: "dividend", date: "2026-03-15", amount: 1, currency: "KRW", note: "JEPI", account: "110" }],
      }),
    ).toThrow("응답 형식");
  });

  it("배당의 음수와 없는 날짜는 거절한다", () => {
    expect(() =>
      parseImportedIncomes({
        incomes: [{ kind: "dividend", date: "2026-03-15", amount: -1, currency: "KRW", note: "" }],
      }),
    ).toThrow("응답 형식");
    expect(() =>
      parseImportedIncomes({
        incomes: [{ kind: "interest", date: "2026-02-31", amount: 10, currency: "KRW", note: "" }],
      }),
    ).toThrow("응답 형식");
  });
});

describe("incomeImportKey", () => {
  it("같은 날짜, 종류, 통화, 금액, 종목이면 같은 키다", () => {
    const left = incomeImportKey({ date: "2026-03-15", kind: "dividend", currency: "KRW", amount: 450000, note: "JEPI" });
    const right = incomeImportKey({ date: "2026-03-15", kind: "dividend", currency: "KRW", amount: 450000.00001, note: " JEPI " });
    expect(left).toBe(right);
  });
});
