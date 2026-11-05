import { describe, expect, it } from "vitest";
import { expectedYieldDate, previousYearMonth } from "./expected";
import { parseTreasuryYieldXml } from "./parse";

const entry = (date: string, ten: string, thirty: string) => `<entry>
<d:NEW_DATE m:type="Edm.DateTime">${date}T00:00:00</d:NEW_DATE>
<d:BC_10YEAR m:type="Edm.Double">${ten}</d:BC_10YEAR>
<d:BC_30YEARDISPLAY m:type="Edm.Double">9.99</d:BC_30YEARDISPLAY>
<d:BC_30YEAR m:type="Edm.Double">${thirty}</d:BC_30YEAR>
</entry>`;

describe("parseTreasuryYieldXml", () => {
  it("reads the latest business day that has both yields", () => {
    const xml = `${entry("2026-10-01", "5.24", "5.61")}${entry("2026-10-20", "5.12", "5.42")}`;
    expect(parseTreasuryYieldXml(xml)).toEqual({ date: "2026-10-20", tenYear: 5.12, thirtyYear: 5.42 });
  });

  it("skips a day missing either yield and rounds to the hundredth", () => {
    const xml = `${entry("2026-10-19", "", "5.48")}${entry("2026-10-16", "5.091", "5.426")}`;
    expect(parseTreasuryYieldXml(xml)).toEqual({ date: "2026-10-16", tenYear: 5.09, thirtyYear: 5.43 });
  });

  it("returns null for an empty feed or a non-positive yield", () => {
    expect(parseTreasuryYieldXml("<feed></feed>")).toBeNull();
    expect(parseTreasuryYieldXml(entry("2026-10-20", "0", "5.42"))).toBeNull();
    expect(parseTreasuryYieldXml("not xml")).toBeNull();
  });
});

describe("expectedYieldDate", () => {
  it("uses the New York session after 5pm and the previous weekday before that", () => {
    expect(expectedYieldDate(new Date("2026-10-21T02:00:00.000Z"))).toBe("2026-10-20");
    expect(expectedYieldDate(new Date("2026-10-20T15:00:00.000Z"))).toBe("2026-10-19");
    expect(expectedYieldDate(new Date("2026-10-17T22:00:00.000Z"))).toBe("2026-10-16");
    expect(expectedYieldDate(new Date("2026-10-19T14:00:00.000Z"))).toBe("2026-10-16");
  });

  it("steps the year when the month is January", () => {
    expect(previousYearMonth("202601")).toBe("202512");
    expect(previousYearMonth("202610")).toBe("202609");
  });
});
