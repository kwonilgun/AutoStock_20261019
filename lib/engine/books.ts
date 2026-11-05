import { DEFAULT_TICKERS } from "./config";
import { holdingsWithIncome } from "./rebalance";
import type { BondDuration, Currency, HoldingInput, OrderLine, Sleeve } from "./types";
import { fxRate, won } from "./value";

export type BookPosition = {
  ticker: string;
  name: string;
  sleeve: Sleeve;
  quantity: number;
  price: number;
  currency: Currency;
  bondDuration: BondDuration | null;
};

export type StoredBooks = {
  usdKrw: number;
  before: BookPosition[];
  after: BookPosition[];
};

function toPosition(holding: HoldingInput): BookPosition | null {
  if (holding.sleeve == null || holding.price == null || holding.price <= 0 || holding.quantity <= 0) return null;
  return {
    ticker: holding.ticker,
    name: holding.name || holding.ticker,
    sleeve: holding.sleeve,
    quantity: holding.quantity,
    price: holding.price,
    currency: holding.currency,
    bondDuration: holding.bondDuration ?? null,
  };
}

function filledShareKrw(order: OrderLine): number {
  if (order.quantity == null || order.priceKrw == null || order.quantity <= 0) return 0;
  return order.quantity * order.priceKrw;
}

function cashFlow(orders: OrderLine[], action: "add_cash" | "use_cash", sleeve: Sleeve): number {
  return orders
    .filter((order) => order.action === action && order.sleeve === sleeve)
    .reduce((sum, order) => sum + order.amountKrw, 0);
}

export function applyOrders(before: BookPosition[], orders: OrderLine[], usdKrw: number): BookPosition[] {
  const next = before.map((position) => ({ ...position }));

  for (const order of orders) {
    if (order.action === "sell" && order.quantity != null && order.quantity > 0) {
      const position = next.find((item) => item.ticker === order.ticker);
      if (position) position.quantity = Math.max(0, position.quantity - order.quantity);
    }
    if (order.action === "buy" && order.quantity != null && order.quantity > 0 && order.price != null && order.price > 0) {
      const position = next.find((item) => item.ticker === order.ticker);
      if (position) {
        position.quantity += order.quantity;
      } else {
        next.push({
          ticker: order.ticker,
          name: order.name,
          sleeve: order.sleeve,
          quantity: order.quantity,
          price: order.price,
          currency: order.currency,
          bondDuration: order.bondDuration,
        });
      }
    }
  }

  const shareSells = orders.filter((order) => order.action === "sell").reduce((sum, order) => sum + filledShareKrw(order), 0);
  const shareBuys = orders.filter((order) => order.action === "buy").reduce((sum, order) => sum + filledShareKrw(order), 0);
  const usdAdd = cashFlow(orders, "add_cash", "USD_CASH");
  const usdUse = cashFlow(orders, "use_cash", "USD_CASH");
  const krwBefore = before
    .filter((position) => position.sleeve === "KRW_CASH")
    .reduce((sum, position) => sum + won(position.quantity * position.price * fxRate(position.currency, usdKrw)), 0);
  const usdBefore = before
    .filter((position) => position.sleeve === "USD_CASH")
    .reduce((sum, position) => sum + position.quantity * position.price, 0);

  const krwEnd = Math.max(0, won(krwBefore + shareSells - shareBuys - usdAdd + usdUse));
  const usdNative = usdKrw > 0 ? usdBefore + (usdAdd - usdUse) / usdKrw : usdBefore;

  const assets = next.filter((position) => position.sleeve !== "KRW_CASH" && position.sleeve !== "USD_CASH" && position.quantity > 0);
  if (krwEnd > 0) {
    assets.push({
      ticker: DEFAULT_TICKERS.KRW_CASH.ticker,
      name: DEFAULT_TICKERS.KRW_CASH.name,
      sleeve: "KRW_CASH",
      quantity: krwEnd,
      price: 1,
      currency: "KRW",
      bondDuration: null,
    });
  }
  if (usdNative > 0 && won(usdNative * usdKrw) > 0) {
    assets.push({
      ticker: DEFAULT_TICKERS.USD_CASH.ticker,
      name: DEFAULT_TICKERS.USD_CASH.name,
      sleeve: "USD_CASH",
      quantity: usdNative,
      price: 1,
      currency: "USD",
      bondDuration: null,
    });
  }
  return assets;
}

export function buildAdjustmentBooks(input: {
  holdings: HoldingInput[];
  incomeKrw: number;
  orders: OrderLine[];
  usdKrw: number;
}): StoredBooks {
  const before = holdingsWithIncome(input.holdings, input.incomeKrw)
    .map(toPosition)
    .filter((position): position is BookPosition => position != null);
  return {
    usdKrw: input.usdKrw,
    before,
    after: applyOrders(before, input.orders, input.usdKrw),
  };
}

export function readBooks(json: string): StoredBooks | null {
  if (!json) return null;
  try {
    const parsed = JSON.parse(json) as StoredBooks;
    if (!parsed || !Array.isArray(parsed.before) || !Array.isArray(parsed.after) || !Number.isFinite(parsed.usdKrw)) return null;
    return parsed;
  } catch {
    return null;
  }
}
