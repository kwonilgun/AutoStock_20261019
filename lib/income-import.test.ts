import { describe, expect, it } from "vitest";
import { incomeImageClaudeBody, incomeImportKey, parseImportedIncomes } from "@/lib/income-import";

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

  it("입금일이 없으면 해당 연도 1월 1일로 둔다", () => {
    const thisYear = `${new Date().getFullYear()}-01-01`;
    expect(
      parseImportedIncomes({
        incomes: [
          { kind: "sale", date: "", amount: 31.03, currency: "USD", note: "화이자" },
          { kind: "sale", amount: -10.32, currency: "USD", note: "인텔" },
          { kind: "sale", date: "2024", amount: -76.72, currency: "USD", note: "QQQI" },
        ],
      }),
    ).toEqual([
      { kind: "sale", date: thisYear, amount: 31.03, currency: "USD", note: "화이자" },
      { kind: "sale", date: thisYear, amount: -10.32, currency: "USD", note: "인텔" },
      { kind: "sale", date: "2024-01-01", amount: -76.72, currency: "USD", note: "QQQI" },
    ]);
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

describe("income image", () => {
  it("도구 없이 이미지 블록으로 보낸다", () => {
    const image = incomeImageClaudeBody("image/jpeg", "abc");
    expect(image).not.toHaveProperty("tools");
    expect(image.system).toContain("이미지");
    expect(image.system).toContain("판매 수익");
    expect(image.messages[0].content[0]).toEqual({ type: "image", source: { type: "base64", media_type: "image/jpeg", data: "abc" } });
  });
});

describe("incomeImportKey", () => {
  it("같은 날짜, 종류, 통화, 금액, 종목이면 같은 키다", () => {
    const left = incomeImportKey({ date: "2026-03-15", kind: "dividend", currency: "KRW", amount: 450000, note: "JEPI" });
    const right = incomeImportKey({ date: "2026-03-15", kind: "dividend", currency: "KRW", amount: 450000.00001, note: " JEPI " });
    expect(left).toBe(right);
  });
});
