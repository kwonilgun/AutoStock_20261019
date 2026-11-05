import { ANCHOR, SLEEVE_LABEL, defaultBuyInstrument, isCashSleeve } from "./config";
import { settleBondGap, sleeveStatus } from "./gap";
import { targetWeights } from "./targets";
import { SLEEVES, type BondDuration, type Currency, type HoldingInput, type OrderLine, type RebalanceInput, type RebalanceResult, type Sleeve, type SleeveSnapshot } from "./types";
import { emptySleeveTotals, fxRate, sumSleeves, valueKrw, won } from "./value";

type Valued = {
  ticker: string;
  name: string;
  sleeve: Sleeve;
  bondDuration: BondDuration | null;
  quantity: number;
  currency: Currency;
  price: number;
  valueKrw: number;
};

function emptyResult(partial: Partial<RebalanceResult> & Pick<RebalanceResult, "blockedReason" | "incomeKrw">): RebalanceResult {
  return {
    totalKrw: 0,
    sleeves: [],
    orders: [],
    holds: [],
    deferred: [],
    incomeTargetSleeve: null,
    residualKrw: 0,
    ...partial,
  };
}

export function holdingsWithIncome(holdings: HoldingInput[], incomeKrw: number): HoldingInput[] {
  if (incomeKrw <= 0) return holdings.map((holding) => ({ ...holding }));
  const next = holdings.map((holding) => ({ ...holding }));
  const cash = next.find((holding) => holding.sleeve === "KRW_CASH" && holding.currency === "KRW");
  if (cash && cash.price != null && cash.price > 0) {
    cash.quantity += incomeKrw / cash.price;
    return next;
  }
  next.push({
    ticker: "CASH",
    name: "원화·MMF",
    sleeve: "KRW_CASH",
    quantity: incomeKrw,
    currency: "KRW",
    price: 1,
    bondDuration: null,
    altKind: null,
    isCoveredCall: false,
  });
  return next;
}

function splitByWeight(total: number, parts: { weight: number }[]): number[] {
  const amount = won(total);
  if (parts.length === 0 || amount <= 0) return parts.map(() => 0);
  const basis = parts.reduce((sum, part) => sum + part.weight, 0);
  if (basis <= 0) return parts.map(() => 0);
  const raw = parts.map((part) => Math.floor((amount * part.weight) / basis));
  let left = amount - raw.reduce((sum, value) => sum + value, 0);
  const order = parts
    .map((part, index) => ({ index, weight: part.weight }))
    .sort((a, b) => b.weight - a.weight);
  for (const item of order) {
    if (left <= 0) break;
    raw[item.index] += 1;
    left -= 1;
  }
  return raw;
}

function allocateSell(pool: Valued[], amount: number): { item: Valued; amountKrw: number }[] {
  const shares = splitByWeight(Math.min(won(amount), pool.reduce((sum, item) => sum + item.valueKrw, 0)), pool.map((item) => ({ weight: item.valueKrw })));
  const out: { item: Valued; amountKrw: number }[] = [];
  pool.forEach((item, index) => {
    if (shares[index] > 0) out.push({ item, amountKrw: shares[index] });
  });
  return out;
}

function toLots(
  action: OrderLine["action"],
  sleeve: Sleeve,
  item: { ticker: string; name: string; currency: Currency; price: number | null; bondDuration: BondDuration | null },
  amountKrw: number,
  usdKrw: number,
): { order: OrderLine | null; deferred: RebalanceResult["deferred"][number] | null; lotResidual: number } {
  if (isCashSleeve(sleeve) || action === "use_cash" || action === "add_cash") {
    return {
      order: {
        action,
        sleeve,
        ticker: item.ticker,
        name: item.name,
        amountKrw,
        quantity: null,
        price: item.price,
        currency: item.currency,
        priceKrw: null,
        residualKrw: 0,
        bondDuration: null,
      },
      deferred: null,
      lotResidual: 0,
    };
  }
  if (item.price == null || item.price <= 0) {
    return {
      order: {
        action,
        sleeve,
        ticker: item.ticker,
        name: item.name,
        amountKrw,
        quantity: null,
        price: null,
        currency: item.currency,
        priceKrw: null,
        residualKrw: amountKrw,
        bondDuration: item.bondDuration,
      },
      deferred: null,
      lotResidual: amountKrw,
    };
  }
  const priceKrw = won(item.price * fxRate(item.currency, usdKrw));
  if (priceKrw <= 0) {
    return { order: null, deferred: null, lotResidual: amountKrw };
  }
  const quantity = Math.floor(amountKrw / priceKrw);
  const residualKrw = amountKrw - quantity * priceKrw;
  if (quantity <= 0) {
    return {
      order: null,
      deferred: {
        sleeve,
        ticker: item.ticker,
        name: item.name,
        amountKrw,
        reason: "1주 미만이라 이번 달 보류",
      },
      lotResidual: amountKrw,
    };
  }
  return {
    order: {
      action,
      sleeve,
      ticker: item.ticker,
      name: item.name,
      amountKrw,
      quantity,
      price: item.price,
      currency: item.currency,
      priceKrw,
      residualKrw,
      bondDuration: item.bondDuration,
    },
    deferred: null,
    lotResidual: residualKrw,
  };
}

export function rebalance(input: RebalanceInput): RebalanceResult {
  const incomeKrw = won(input.incomes.reduce((sum, income) => sum + income.amountKrw, 0));
  const active = input.holdings.filter((holding) => holding.quantity > 0);
  const missing = active.filter((holding) => holding.price == null || holding.price <= 0).map((holding) => holding.ticker);
  if (missing.length > 0) {
    const fx = input.fx.USDKRW;
    const totalKrw =
      Number.isFinite(fx) && fx > 0
        ? active.reduce((sum, holding) => sum + (valueKrw(holding, fx) ?? 0), 0)
        : 0;
    return emptyResult({
      incomeKrw,
      totalKrw,
      blockedReason: `시세 없음: ${missing.join(", ")}`,
    });
  }
  const unclassified = active.filter((holding) => holding.sleeve == null).map((holding) => holding.ticker);
  if (unclassified.length > 0) {
    return emptyResult({
      incomeKrw,
      blockedReason: `자산군을 고르지 않은 종목이 있습니다: ${unclassified.join(", ")}`,
    });
  }
  if (!Number.isFinite(input.fx.USDKRW) || input.fx.USDKRW <= 0) {
    return emptyResult({ incomeKrw, blockedReason: "원달러 환율이 없습니다." });
  }

  const prepared = holdingsWithIncome(active, incomeKrw);
  const valued: Valued[] = [];
  for (const holding of prepared) {
    if (holding.sleeve == null) continue;
    const priced = valueKrw(holding, input.fx.USDKRW);
    if (priced == null) continue;
    valued.push({
      ticker: holding.ticker,
      name: holding.name || holding.ticker,
      sleeve: holding.sleeve,
      bondDuration: holding.bondDuration ?? null,
      quantity: holding.quantity,
      currency: holding.currency,
      price: holding.price ?? 0,
      valueKrw: priced,
    });
  }

  const totals = emptySleeveTotals();
  for (const item of valued) totals[item.sleeve] += item.valueKrw;
  const totalKrw = sumSleeves(totals);
  if (totalKrw <= 0) {
    return emptyResult({
      incomeKrw,
      blockedReason: null,
      totalKrw: 0,
    });
  }

  const { weights, notes } = targetWeights(input.phase, input.weights);
  const measured: SleeveSnapshot[] = SLEEVES.map((sleeve) => {
    const currentKrw = totals[sleeve];
    const currentWeight = currentKrw / totalKrw;
    const targetWeight = weights[sleeve];
    const targetKrw = won(totalKrw * targetWeight);
    const gapKrw = targetKrw - currentKrw;
    const gapPp = (currentWeight - targetWeight) * 100;
    const status = sleeveStatus(currentWeight, targetWeight);
    const insideBand = status === "hold" || status === "match";
    return {
      sleeve,
      currentKrw,
      currentWeight,
      targetWeight,
      targetKrw,
      gapKrw,
      gapPp,
      status,
      tradeKrw: insideBand ? 0 : gapKrw,
      guardNote: notes[sleeve] ?? null,
    };
  });
  const settled = settleBondGap(measured);
  const sleeves = settled.sleeves;

  const orders: OrderLine[] = [];
  const deferred: RebalanceResult["deferred"] = [];

  for (const sleeve of sleeves) {
    const amount = sleeve.tradeKrw;
    if (amount === 0) continue;
    const pool = valued.filter((item) => item.sleeve === sleeve.sleeve && item.valueKrw > 0);
    if (amount < 0) {
      const pieces = allocateSell(pool, Math.abs(amount));
      for (const piece of pieces) {
        const action = isCashSleeve(sleeve.sleeve) ? "use_cash" : "sell";
        const lot = toLots(action, sleeve.sleeve, piece.item, piece.amountKrw, input.fx.USDKRW);
        if (lot.order) orders.push(lot.order);
        if (lot.deferred) deferred.push(lot.deferred);
      }
    } else {
      const action = isCashSleeve(sleeve.sleeve) ? "add_cash" : "buy";
      if (pool.length === 0) {
        const instrument = defaultBuyInstrument(sleeve.sleeve);
        if (!instrument) continue;
        const quote = input.holdings.find(
          (holding) => holding.ticker === instrument.ticker && holding.price != null && holding.price > 0,
        );
        const lot = toLots(
          action,
          sleeve.sleeve,
          {
            ticker: instrument.ticker,
            name: quote?.name || instrument.name,
            currency:
              quote?.currency ??
              (instrument.ticker === "069500" || instrument.ticker === "CASH" || sleeve.sleeve === "KRW_CASH" ? "KRW" : "USD"),
            price: quote?.price ?? null,
            bondDuration: instrument.bondDuration ?? quote?.bondDuration ?? null,
          },
          amount,
          input.fx.USDKRW,
        );
        if (lot.order) orders.push(lot.order);
        if (lot.deferred) deferred.push(lot.deferred);
        continue;
      }
      const shares = splitByWeight(amount, pool.map((item) => ({ weight: item.valueKrw })));
      pool.forEach((item, index) => {
        if (shares[index] <= 0) return;
        const lot = toLots(action, sleeve.sleeve, item, shares[index], input.fx.USDKRW);
        if (lot.order) orders.push(lot.order);
        if (lot.deferred) deferred.push(lot.deferred);
      });
    }
  }

  const holds = sleeves
    .filter((sleeve) => sleeve.status === "hold")
    .filter((sleeve) => !(settled.grouped && (sleeve.sleeve === "BOND_10Y" || sleeve.sleeve === "BOND_30Y")))
    .map((sleeve) => ({
      sleeve: sleeve.sleeve,
      gapPp: sleeve.gapPp,
      reason: `${SLEEVE_LABEL[sleeve.sleeve]} · 괴리 ${formatGap(sleeve.gapPp)} · 기준 ±2%p 안쪽`,
    }));
  if (settled.hold) holds.push(settled.hold);

  const filled = (order: OrderLine) => {
    if (order.action === "use_cash" || order.action === "add_cash") return order.amountKrw;
    if (order.quantity == null || order.priceKrw == null) return 0;
    return order.quantity * order.priceKrw;
  };
  const sellFilled = orders
    .filter((order) => order.action === "sell" || order.action === "use_cash")
    .reduce((sum, order) => sum + filled(order), 0);
  const buyFilled = orders
    .filter((order) => order.action === "buy" || order.action === "add_cash")
    .reduce((sum, order) => sum + filled(order), 0);

  const buySleeves = sleeves.filter((sleeve) => sleeve.tradeKrw > 0);
  const incomeTarget =
    incomeKrw > 0 && buySleeves.length > 0
      ? buySleeves.reduce((best, sleeve) => (sleeve.gapKrw > best.gapKrw ? sleeve : best)).sleeve
      : null;

  return {
    totalKrw,
    sleeves,
    orders,
    holds,
    deferred,
    incomeKrw,
    incomeTargetSleeve: incomeTarget,
    residualKrw: won(sellFilled - buyFilled),
    blockedReason: null,
  };
}

function formatGap(gapPp: number): string {
  const rounded = Math.round(gapPp * 10) / 10;
  const sign = rounded > 0 ? "+" : "";
  return `${sign}${rounded}%p`;
}

export function anchorDeltaPp(sleeve: Sleeve, targetWeight: number): number {
  return (targetWeight - ANCHOR[sleeve]) * 100;
}

export function emptyMessage(result: RebalanceResult): string | null {
  if (result.blockedReason) return result.blockedReason;
  if (result.totalKrw <= 0) return "자산을 입력하세요";
  return null;
}
