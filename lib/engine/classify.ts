import type { AltKind, BondDuration, Sleeve } from "./types";

export type Classification = {
  sleeve: Sleeve | null;
  status: "classified" | "unclassified";
  altKind: AltKind | null;
  bondDuration: BondDuration | null;
  isCoveredCall: boolean;
  name: string | null;
  market: "KR" | "US" | null;
};

type Known = {
  sleeve: Sleeve;
  name: string;
  altKind?: AltKind;
  bondDuration?: BondDuration;
  isCoveredCall?: boolean;
  market: "KR" | "US";
};

const KNOWN: Record<string, Known> = {
  VOO: { sleeve: "US_EQUITY", name: "Vanguard S&P 500", market: "US" },
  SPY: { sleeve: "US_EQUITY", name: "SPDR S&P 500", market: "US" },
  QQQ: { sleeve: "US_EQUITY", name: "Invesco QQQ", market: "US" },
  VTI: { sleeve: "US_EQUITY", name: "Vanguard Total Stock Market", market: "US" },
  "069500": { sleeve: "KR_EQUITY", name: "KODEX 200", market: "KR" },
  "102110": { sleeve: "KR_EQUITY", name: "TIGER 200", market: "KR" },
  "360750": { sleeve: "KR_EQUITY", name: "TIGER 미국S&P500", market: "KR" },
  IEF: { sleeve: "BOND_10Y", name: "iShares 7-10Y Treasury", bondDuration: "Y10", market: "US" },
  TLT: { sleeve: "BOND_30Y", name: "iShares 20+Y Treasury", bondDuration: "Y30", market: "US" },
  EDV: { sleeve: "BOND_30Y", name: "Vanguard Extended Duration Treasury", bondDuration: "Y30", market: "US" },
  "453850": { sleeve: "BOND_30Y", name: "ACE 미국30년국채액티브(H)", bondDuration: "Y30", market: "KR" },
  "114260": { sleeve: "BOND_10Y", name: "KODEX 국고채3년", bondDuration: "Y10", market: "KR" },
  SHY: { sleeve: "BOND_10Y", name: "iShares 1-3Y Treasury", bondDuration: "Y10", market: "US" },
  BIL: { sleeve: "BOND_10Y", name: "SPDR 1-3 Month T-Bill", bondDuration: "Y10", market: "US" },
  SGOV: { sleeve: "BOND_10Y", name: "iShares 0-3 Month Treasury", bondDuration: "Y10", market: "US" },
  "153130": { sleeve: "BOND_10Y", name: "KODEX 단기채권", bondDuration: "Y10", market: "KR" },
  IAU: { sleeve: "GOLD", name: "iShares Gold Trust", altKind: "GOLD", market: "US" },
  GLD: { sleeve: "GOLD", name: "SPDR Gold Shares", altKind: "GOLD", market: "US" },
  GLDM: { sleeve: "GOLD", name: "SPDR Gold MiniShares", altKind: "GOLD", market: "US" },
  "132030": { sleeve: "GOLD", name: "KODEX 골드선물(H)", altKind: "GOLD", market: "KR" },
  "411060": { sleeve: "GOLD", name: "ACE KRX금현물", altKind: "GOLD", market: "KR" },
  BTC: { sleeve: "BTC", name: "비트코인", altKind: "BTC", market: "US" },
  IBIT: { sleeve: "BTC", name: "iShares Bitcoin Trust", altKind: "BTC", market: "US" },
  "365550": { sleeve: "BTC", name: "KODEX 비트코인선물", altKind: "BTC", market: "KR" },
  VNQ: { sleeve: "REIT", name: "Vanguard Real Estate ETF", market: "US" },
  XLRE: { sleeve: "REIT", name: "Real Estate Select Sector SPDR", market: "US" },
  IYR: { sleeve: "REIT", name: "iShares U.S. Real Estate ETF", market: "US" },
  SCHH: { sleeve: "REIT", name: "Schwab U.S. REIT ETF", market: "US" },
  "329200": { sleeve: "REIT", name: "TIGER 리츠부동산인프라", market: "KR" },
  "182480": { sleeve: "REIT", name: "TIGER 미국MSCI리츠", market: "KR" },
  JEPI: { sleeve: "US_EQUITY", name: "JPMorgan Equity Premium Income", isCoveredCall: true, market: "US" },
  JEPQ: { sleeve: "US_EQUITY", name: "JPMorgan Nasdaq Equity Premium Income", isCoveredCall: true, market: "US" },
  QYLD: { sleeve: "US_EQUITY", name: "Global X NASDAQ 100 Covered Call", isCoveredCall: true, market: "US" },
  CASH: { sleeve: "KRW_CASH", name: "원화·MMF", market: "KR" },
  MMF: { sleeve: "KRW_CASH", name: "MMF", market: "KR" },
  USD: { sleeve: "USD_CASH", name: "달러 현금", market: "US" },
};

export function normalizeTicker(ticker: string): string {
  return ticker.trim().toUpperCase().replace(/\.(KS|KQ)$/i, "");
}

export function classify(ticker: string): Classification {
  const key = normalizeTicker(ticker);
  const known = KNOWN[key];
  if (!known) {
    return {
      sleeve: null,
      status: "unclassified",
      altKind: null,
      bondDuration: null,
      isCoveredCall: false,
      name: null,
      market: null,
    };
  }
  return {
    sleeve: known.sleeve,
    status: "classified",
    altKind: known.altKind ?? null,
    bondDuration: known.bondDuration ?? null,
    isCoveredCall: known.isCoveredCall ?? false,
    name: known.name,
    market: known.market,
  };
}
