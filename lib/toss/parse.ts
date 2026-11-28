export type TossHolding = {
  symbol: string;
  name: string;
  currency: "KRW" | "USD";
  marketCountry: "KR" | "US";
  quantity: number;
  lastPrice: number;
  averagePurchasePrice: number;
};

function decimal(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value !== "string") return null;
  const parsed = Number(value.trim());
  return Number.isFinite(parsed) ? parsed : null;
}

function text(value: unknown, limit: number): string {
  if (typeof value !== "string") return "";
  return value.trim().slice(0, limit);
}

/** 보유 조회 응답의 items만 종목 행으로 바꾼다. 수량 없는 행은 뺀다. */
export function parseTossHoldings(payload: unknown): TossHolding[] {
  const result = payload && typeof payload === "object" ? (payload as { result?: unknown }).result : null;
  const items = result && typeof result === "object" ? (result as { items?: unknown }).items : null;
  if (!Array.isArray(items)) throw new Error("보유 응답 형식이 아닙니다.");
  const holdings: TossHolding[] = [];
  for (const row of items) {
    if (!row || typeof row !== "object") continue;
    const item = row as Record<string, unknown>;
    const currency = item.currency === "USD" ? "USD" : item.currency === "KRW" ? "KRW" : null;
    const marketCountry = item.marketCountry === "US" ? "US" : item.marketCountry === "KR" ? "KR" : null;
    const quantity = decimal(item.quantity);
    const lastPrice = decimal(item.lastPrice);
    const averagePurchasePrice = decimal(item.averagePurchasePrice);
    const symbol = text(item.symbol, 32);
    const name = text(item.name, 80);
    if (!currency || !marketCountry || !symbol || !name) continue;
    if (quantity == null || !(quantity > 0) || lastPrice == null || !(lastPrice > 0)) continue;
    if (averagePurchasePrice == null || !(averagePurchasePrice > 0)) continue;
    holdings.push({
      symbol,
      name,
      currency,
      marketCountry,
      quantity,
      lastPrice,
      averagePurchasePrice,
    });
  }
  return holdings;
}

/** 계좌 목록에서 종합매매 계좌의 accountSeq를 고른다. 계좌번호는 읽지 않는다. */
export function parseTossAccountSeq(payload: unknown): number | null {
  const result = payload && typeof payload === "object" ? (payload as { result?: unknown }).result : null;
  if (!Array.isArray(result)) return null;
  for (const row of result) {
    if (!row || typeof row !== "object") continue;
    const item = row as { accountSeq?: unknown; accountType?: unknown };
    if (item.accountType != null && item.accountType !== "BROKERAGE") continue;
    const seq = typeof item.accountSeq === "number" ? item.accountSeq : Number(item.accountSeq);
    if (Number.isInteger(seq) && seq >= 0) return seq;
  }
  return null;
}
