import { describe, expect, it } from "vitest";
import { inferSleeve, sleeveForSecurity } from "./classify";

describe("inferSleeve", () => {
  it("reads gold, bond, and real estate from the name", () => {
    expect(inferSleeve("SOL 국제금커버드콜액티브", "KR")).toBe("GOLD");
    expect(inferSleeve("ACE KRX금현물", "KR")).toBe("GOLD");
    expect(inferSleeve("iShares Gold Trust", "US")).toBe("GOLD");
    expect(inferSleeve("ACE 미국30년국채액티브(H)", "KR")).toBe("BOND_30Y");
    expect(inferSleeve("KODEX 국고채3년", "KR")).toBe("BOND_10Y");
    expect(inferSleeve("TIGER 리츠부동산인프라", "KR")).toBe("REIT");
    expect(inferSleeve("Vanguard Real Estate ETF", "US")).toBe("REIT");
  });

  it("keeps ordinary shares in the listing market", () => {
    expect(inferSleeve("삼성전자", "KR")).toBe("KR_EQUITY");
    expect(inferSleeve("금호석유", "KR")).toBe("KR_EQUITY");
    expect(inferSleeve("한국금융지주", "KR")).toBe("KR_EQUITY");
    expect(inferSleeve("Apple", "US")).toBe("US_EQUITY");
  });

  it("uses a known ticker before the name", () => {
    expect(sleeveForSecurity("360750", "TIGER 미국S&P500", "KR")).toBe("KR_EQUITY");
    expect(sleeveForSecurity("0022T0", "SOL 국제금커버드콜액티브", "KR")).toBe("GOLD");
    expect(sleeveForSecurity("TLT", "iShares 20+ Year Treasury Bond ETF", "US")).toBe("BOND_30Y");
  });
});
