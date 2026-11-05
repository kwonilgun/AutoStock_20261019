import type { HoldingInput, RebalanceInput } from "./types";

/** 구현방안 3.8. 환율 1,000원으로 맞춰 주문 금액이 원 단위로 떨어진다. */
export const EXAMPLE_FX = 1000;

export const EXAMPLE_B1_HOLDINGS: HoldingInput[] = [
  {
    ticker: "VOO",
    name: "Vanguard S&P 500",
    sleeve: "US_EQUITY",
    quantity: 300,
    currency: "USD",
    price: 100,
    bondDuration: null,
    altKind: null,
    isCoveredCall: false,
  },
  {
    ticker: "069500",
    name: "KODEX 200",
    sleeve: "KR_EQUITY",
    quantity: 2000,
    currency: "KRW",
    price: 10000,
    bondDuration: null,
    altKind: null,
    isCoveredCall: false,
  },
  {
    ticker: "TLT",
    name: "iShares 20+Y Treasury",
    sleeve: "BOND_30Y",
    quantity: 300,
    currency: "USD",
    price: 100,
    bondDuration: "Y30",
    altKind: null,
    isCoveredCall: false,
  },
  {
    ticker: "IAU",
    name: "iShares Gold Trust",
    sleeve: "GOLD",
    quantity: 1500,
    currency: "KRW",
    price: 10000,
    bondDuration: null,
    altKind: "GOLD",
    isCoveredCall: false,
  },
  {
    ticker: "CASH",
    name: "원화·MMF",
    sleeve: "KRW_CASH",
    quantity: 5_000_000,
    currency: "KRW",
    price: 1,
    bondDuration: null,
    altKind: null,
    isCoveredCall: false,
  },
];

export function exampleInput(incomes: RebalanceInput["incomes"] = []): RebalanceInput {
  return {
    phase: "B1",
    holdings: EXAMPLE_B1_HOLDINGS,
    fx: { USDKRW: EXAMPLE_FX },
    incomes,
    asOf: "2026-10-19",
  };
}
