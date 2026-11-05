import { PHASES, SLEEVES, type BondDuration, type Phase, type Sleeve } from "./types";

/** 비중표에 0%와 5%가 있으므로 하한은 0이다. 상한 60%만 안전장치로 둔다. */
export const GUARDRAIL_MIN = 0;
export const GUARDRAIL_MAX = 0.6;
export const CASH_MIN = 0;
export const REIT_MIN = 0;
export const TRADE_BAND = 0.02;
export const LOT_SIZE = 1;

/** 자산_비중_20261019.md 국면별 배분표. 채권은 10년물과 30년물로 나눈다. */
export const PHASE_WEIGHTS: Record<Phase, Record<Sleeve, number>> = {
  A1: { US_EQUITY: 0.25, KR_EQUITY: 0.1, BOND_10Y: 0.15, BOND_30Y: 0.05, GOLD: 0.05, BTC: 0.05, REIT: 0.1, KRW_CASH: 0.15, USD_CASH: 0.1 },
  A2: { US_EQUITY: 0.35, KR_EQUITY: 0.2, BOND_10Y: 0.05, BOND_30Y: 0, GOLD: 0.05, BTC: 0.1, REIT: 0.1, KRW_CASH: 0.1, USD_CASH: 0.05 },
  A3: { US_EQUITY: 0.2, KR_EQUITY: 0.1, BOND_10Y: 0.05, BOND_30Y: 0.05, GOLD: 0.15, BTC: 0.05, REIT: 0.05, KRW_CASH: 0.15, USD_CASH: 0.2 },
  B1: { US_EQUITY: 0.1, KR_EQUITY: 0.05, BOND_10Y: 0.05, BOND_30Y: 0.3, GOLD: 0.15, BTC: 0, REIT: 0.05, KRW_CASH: 0.15, USD_CASH: 0.15 },
  B2: { US_EQUITY: 0.05, KR_EQUITY: 0, BOND_10Y: 0.05, BOND_30Y: 0.35, GOLD: 0.15, BTC: 0, REIT: 0.05, KRW_CASH: 0.15, USD_CASH: 0.2 },
  B3: { US_EQUITY: 0.15, KR_EQUITY: 0.1, BOND_10Y: 0.15, BOND_30Y: 0.1, GOLD: 0.1, BTC: 0.05, REIT: 0.1, KRW_CASH: 0.15, USD_CASH: 0.1 },
};

/** 여섯 국면의 평균. 화면의 닻 대비는 이 평균과 비교한다. */
export const ANCHOR: Record<Sleeve, number> = PHASES.reduce(
  (anchor, phase) => {
    for (const sleeve of Object.keys(PHASE_WEIGHTS[phase]) as Sleeve[]) {
      anchor[sleeve] += PHASE_WEIGHTS[phase][sleeve] / PHASES.length;
    }
    return anchor;
  },
  {
    US_EQUITY: 0,
    KR_EQUITY: 0,
    BOND_10Y: 0,
    BOND_30Y: 0,
    GOLD: 0,
    BTC: 0,
    REIT: 0,
    KRW_CASH: 0,
    USD_CASH: 0,
  } satisfies Record<Sleeve, number>,
);

export const PHASE_META: Record<
  Phase,
  {
    name: string;
    environment: string;
    action: string;
    headline: string;
    guide: string;
  }
> = {
  A1: {
    name: "조정",
    environment: "금리 최저, 침체 탈출",
    action: "아무도 관심없음",
    headline: "주식매수, 부동산매도, 안전자산 매도",
    guide: "금리가 바닥에 있고 비관이 남아 있는 구간입니다. 장기 채권과 현금을 줄이고, 회복에 앞서 주식과 비트코인을 사기 시작합니다.",
  },
  A2: {
    name: "동행",
    environment: "본격 상승, 금리 완만 상승",
    action: "대중 관심 증가",
    headline: "주식보유",
    guide: "경기와 실적이 함께 오르는 구간입니다. 주식, 비트코인, 부동산 비중을 높여 상승을 따라가고 장기 채권은 비웁니다.",
  },
  A3: {
    name: "과열",
    environment: "금리 고점, 투기 과열",
    action: "모두가 낙관",
    headline: "주식매도, 예금입금",
    guide: "참여가 붐비고 금리가 고점에 가까운 구간입니다. 주식과 비트코인 차익을 실현하고, 달러·금과 함께 장기 채권을 다시 모읍니다.",
    
  },
  B1: {
    name: "조정",
    environment: "경기 둔화, 긴축 여파",
    action: "하락을 인정 못함",
    headline: "예금출금, 채권매수",
    guide: "고금리가 이어지며 경기와 실적이 둔화되는 구간입니다. 주식과 비트코인을 줄이고, 고금리 장기 채권을 모아 금리 인하 때의 가격 상승을 준비합니다.",
  },
  B2: {
    name: "동행",
    environment: "침체, 위험자산 급락",
    action: "불안과 의심",
    headline: "장기채 최대, 주식은 비움",
    guide: "침체가 본격화되고 위험자산이 급락하는 구간입니다. 장기 채권 비중을 가장 높게 두고, 달러와 금으로 방어합니다.",
  },
  B3: {
    name: "과매도",
    environment: "패닉, 침체 바닥",
    action: "모두가 포기",
    headline: "부동산 매수, 채권 매도",
    guide: "투매와 극단적 비관이 깔린 바닥입니다. 오른 장기 채권을 나눠 팔고, 그 자금으로 낮아진 주식과 비트코인을 사기 시작합니다.",
  },
};

export const SLEEVE_LABEL: Record<Sleeve, string> = {
  US_EQUITY: "미국주식",
  KR_EQUITY: "한국주식",
  BOND_10Y: "채권 10년물",
  BOND_30Y: "채권 30년물",
  GOLD: "금",
  BTC: "비트코인",
  REIT: "부동산 ETF",
  KRW_CASH: "원화",
  USD_CASH: "달러",
};

export function sleeveLabel(sleeve: string): string {
  if ((SLEEVES as readonly string[]).includes(sleeve)) return SLEEVE_LABEL[sleeve as Sleeve];
  if (sleeve === "BOND") return "채권";
  if (sleeve === "ALT") return "대체자산";
  if (sleeve === "CASH") return "현금";
  return sleeve;
}

type DefaultInstrument = {
  ticker: string;
  name: string;
  bondDuration?: BondDuration;
};

export const DEFAULT_TICKERS = {
  US_EQUITY: { ticker: "VOO", name: "Vanguard S&P 500" },
  KR_EQUITY: { ticker: "069500", name: "KODEX 200" },
  BOND_10Y: { ticker: "IEF", name: "iShares 7-10Y Treasury", bondDuration: "Y10" },
  BOND_30Y: { ticker: "TLT", name: "iShares 20+Y Treasury", bondDuration: "Y30" },
  GOLD: { ticker: "IAU", name: "iShares Gold Trust" },
  BTC: { ticker: "IBIT", name: "iShares Bitcoin Trust" },
  REIT: { ticker: "VNQ", name: "Vanguard Real Estate ETF" },
  KRW_CASH: { ticker: "CASH", name: "원화·MMF" },
  USD_CASH: { ticker: "USD", name: "달러 현금" },
} as const satisfies Record<string, DefaultInstrument>;

export function isCashSleeve(sleeve: Sleeve): boolean {
  return sleeve === "KRW_CASH" || sleeve === "USD_CASH";
}

export function defaultBuyInstrument(sleeve: Sleeve): DefaultInstrument | null {
  if (sleeve === "US_EQUITY") return DEFAULT_TICKERS.US_EQUITY;
  if (sleeve === "KR_EQUITY") return DEFAULT_TICKERS.KR_EQUITY;
  if (sleeve === "BOND_10Y") return DEFAULT_TICKERS.BOND_10Y;
  if (sleeve === "BOND_30Y") return DEFAULT_TICKERS.BOND_30Y;
  if (sleeve === "GOLD") return DEFAULT_TICKERS.GOLD;
  if (sleeve === "BTC") return DEFAULT_TICKERS.BTC;
  if (sleeve === "REIT") return DEFAULT_TICKERS.REIT;
  if (sleeve === "KRW_CASH") return DEFAULT_TICKERS.KRW_CASH;
  if (sleeve === "USD_CASH") return DEFAULT_TICKERS.USD_CASH;
  return null;
}

export const PHASE_RULE_THRESHOLDS = {
  rateZoneBand: 0.5,
  rateDirectionBand: 0.25,
};

export const BACKTEST_COST_BPS = 10;
