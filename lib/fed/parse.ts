export type FedTarget = {
  date: string;
  low: number;
  high: number;
};

/** 뉴욕 연준 EFFR 응답에서 기준금리 목표 범위를 읽는다. 외부 요청은 하지 않는다. */
export function parseNyFedTarget(payload: unknown): FedTarget | null {
  if (!payload || typeof payload !== "object") return null;
  const rates = (payload as { refRates?: unknown }).refRates;
  const first = Array.isArray(rates) ? rates[0] : null;
  if (!first || typeof first !== "object") return null;
  const row = first as { effectiveDate?: unknown; targetRateFrom?: unknown; targetRateTo?: unknown };
  const date = typeof row.effectiveDate === "string" ? row.effectiveDate.slice(0, 10) : "";
  const low = finitePercent(row.targetRateFrom);
  const high = finitePercent(row.targetRateTo);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || low == null || high == null || high < low) return null;
  return { date, low, high };
}

function finitePercent(value: unknown): number | null {
  if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) return null;
  return Math.round(value * 100) / 100;
}
