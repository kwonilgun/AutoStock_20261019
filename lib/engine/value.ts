import type { Currency, HoldingInput, Sleeve } from "./types";
import { SLEEVES } from "./types";

export function won(value: number): number {
  return Math.round(value);
}

export function fxRate(currency: Currency, usdKrw: number): number {
  return currency === "USD" ? usdKrw : 1;
}

const INCOME_KRW_LIMIT = 1_000_000_000_000;

/** 배당·이자·판매 수익을 저장할 금액. 달러는 센트까지 맞춘 뒤 지금 저장된 환율을 곱해 원화로 바꾼다. */
export function incomeMoney(
  amount: number,
  currency: Currency,
  usdKrw: number,
): { amount: number; amountKrw: number } | null {
  if (!Number.isFinite(amount) || amount === 0) return null;
  if (currency === "USD") {
    if (!Number.isFinite(usdKrw) || usdKrw <= 0) return null;
    const dollars = Math.round(amount * 100) / 100;
    if (dollars === 0) return null;
    const amountKrw = Math.round(dollars * usdKrw);
    if (!Number.isFinite(amountKrw) || amountKrw === 0 || Math.abs(amountKrw) > INCOME_KRW_LIMIT) return null;
    return { amount: dollars, amountKrw };
  }
  const wonAmount = Math.round(amount);
  if (wonAmount === 0 || Math.abs(wonAmount) > INCOME_KRW_LIMIT) return null;
  return { amount: wonAmount, amountKrw: wonAmount };
}

/** 수익 메뉴 금액을 원화로 바꾼다. 달러는 지금 저장된 환율을 그대로 곱한다. */
export function incomeToKrw(amount: number, currency: Currency, usdKrw: number, fallback = 0): number {
  return incomeMoney(amount, currency, usdKrw)?.amountKrw ?? fallback;
}

export function valueKrw(
  holding: Pick<HoldingInput, "quantity" | "price" | "currency">,
  usdKrw: number,
): number | null {
  if (holding.price == null || !Number.isFinite(holding.price) || holding.price <= 0) return null;
  if (!Number.isFinite(holding.quantity) || holding.quantity < 0) return null;
  return won(holding.quantity * holding.price * fxRate(holding.currency, usdKrw));
}

export function costPrice(holding: { avgPrice?: number | null }): number | null {
  if (holding.avgPrice == null || !Number.isFinite(holding.avgPrice) || holding.avgPrice <= 0) return null;
  return holding.avgPrice;
}

/** 평균가 대비 평가금(손익)과 수익률. 평균가가 없으면 비운다. */
export function holdingGain(
  holding: Pick<HoldingInput, "quantity" | "price" | "currency" | "avgPrice">,
  usdKrw: number,
): { rate: number; gainKrw: number; costKrw: number; valueKrw: number } | null {
  const avg = costPrice(holding);
  const market = valueKrw(holding, usdKrw);
  if (avg == null || market == null || holding.price == null) return null;
  const cost = valueKrw({ quantity: holding.quantity, price: avg, currency: holding.currency }, usdKrw);
  if (cost == null || cost <= 0) return null;
  return {
    costKrw: cost,
    valueKrw: market,
    gainKrw: market - cost,
    rate: (holding.price - avg) / avg,
  };
}

/** 평균가가 있는 종목의 평가금을 합산한다. 현금처럼 평균가가 없는 행은 뺀다. */
export function portfolioHoldingGain(
  holdings: Pick<HoldingInput, "quantity" | "price" | "currency" | "avgPrice">[],
  usdKrw: number,
): { gainKrw: number; costKrw: number; valueKrw: number; rate: number } | null {
  let gainKrw = 0;
  let costKrw = 0;
  let marketKrw = 0;
  let any = false;
  for (const holding of holdings) {
    const gain = holdingGain(holding, usdKrw);
    if (!gain) continue;
    any = true;
    gainKrw += gain.gainKrw;
    costKrw += gain.costKrw;
    marketKrw += gain.valueKrw;
  }
  if (!any || !(costKrw > 0)) return null;
  return { gainKrw, costKrw, valueKrw: marketKrw, rate: gainKrw / costKrw };
}

export function emptySleeveTotals(): Record<Sleeve, number> {
  return {
    US_EQUITY: 0,
    KR_EQUITY: 0,
    BOND_10Y: 0,
    BOND_30Y: 0,
    GOLD: 0,
    BTC: 0,
    REIT: 0,
    FUND: 0,
    KRW_CASH: 0,
    USD_CASH: 0,
  };
}

/** 예전 저장본의 채권 한 줄을 10년물·30년물로 읽는다. 단기·10년은 10년물, 장기·30년은 30년물이다. */
export function resolveStoredSleeve(sleeve: string, bondDuration: string | null): Sleeve | null {
  if ((SLEEVES as readonly string[]).includes(sleeve)) return sleeve as Sleeve;
  if (sleeve === "BOND") {
    if (bondDuration === "SHORT" || bondDuration === "Y10") return "BOND_10Y";
    return "BOND_30Y";
  }
  if (sleeve === "ALT") return "GOLD";
  if (sleeve === "CASH") return "KRW_CASH";
  return null;
}

export function sumSleeves(totals: Record<Sleeve, number>): number {
  return SLEEVES.reduce((sum, sleeve) => sum + totals[sleeve], 0);
}
