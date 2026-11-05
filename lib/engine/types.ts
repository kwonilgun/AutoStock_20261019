export const PHASES = ["A1", "A2", "A3", "B1", "B2", "B3"] as const;
export type Phase = (typeof PHASES)[number];

export const SLEEVES = [
  "US_EQUITY",
  "KR_EQUITY",
  "BOND_10Y",
  "BOND_30Y",
  "GOLD",
  "BTC",
  "REIT",
  "KRW_CASH",
  "USD_CASH",
] as const;
export type Sleeve = (typeof SLEEVES)[number];

export type Currency = "KRW" | "USD";
export type BondDuration = "Y10" | "Y30";
export type AltKind = "GOLD" | "BTC";
export type PhaseSource = "manual" | "auto" | "admin";

export type WeightTable = Record<Phase, Record<Sleeve, number>>;

export type HoldingInput = {
  id?: string;
  ticker: string;
  name?: string;
  sleeve: Sleeve | null;
  altKind?: AltKind | null;
  bondDuration?: BondDuration | null;
  isCoveredCall?: boolean;
  quantity: number;
  currency: Currency;
  price: number | null;
  /** 매입 평균단가. 현재가와의 차이로 수익률·평가금을 계산한다. */
  avgPrice?: number | null;
  priceSource?: "auto" | "manual";
  /** 현재가를 받아 저장한 시각. ISO 문자열. */
  priceUpdatedAt?: string;
};

export type SleeveSnapshot = {
  sleeve: Sleeve;
  currentKrw: number;
  currentWeight: number;
  targetWeight: number;
  targetKrw: number;
  gapKrw: number;
  gapPp: number;
  status: "over" | "under" | "hold" | "match";
  tradeKrw: number;
  guardNote: string | null;
};

export type OrderAction = "buy" | "sell" | "use_cash" | "add_cash";

export type OrderLine = {
  action: OrderAction;
  sleeve: Sleeve;
  ticker: string;
  name: string;
  amountKrw: number;
  quantity: number | null;
  price: number | null;
  currency: Currency;
  priceKrw: number | null;
  residualKrw: number;
  bondDuration: BondDuration | null;
};

export type HoldLine = {
  sleeve: Sleeve;
  gapPp: number;
  reason: string;
};

export type DeferredLine = {
  sleeve: Sleeve;
  ticker: string;
  name: string;
  amountKrw: number;
  reason: string;
};

export type RebalanceInput = {
  phase: Phase;
  /** 관리자가 정한 국면별 비중. 없으면 기본표를 쓴다. */
  weights?: WeightTable;
  holdings: HoldingInput[];
  fx: { USDKRW: number };
  incomes: { ticker: string; amountKrw: number }[];
  asOf: string;
};

export type RebalanceResult = {
  totalKrw: number;
  sleeves: SleeveSnapshot[];
  orders: OrderLine[];
  holds: HoldLine[];
  deferred: DeferredLine[];
  incomeKrw: number;
  incomeTargetSleeve: Sleeve | null;
  residualKrw: number;
  blockedReason: string | null;
};
