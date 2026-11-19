"use client";

import { classify, normalizeTicker, sleeveForSecurity } from "@/lib/engine/classify";
import { SLEEVE_LABEL } from "@/lib/engine/config";
import type { Currency, Sleeve } from "@/lib/engine/types";
import { formatNumber } from "@/lib/format";
import { holdingAvgWarning, holdingImportChange, preferredMatch, sameHoldingPrice, type HeldPosition, type ImportedHolding } from "@/lib/holdings-import";
import type { SecurityMatch } from "@/lib/quotes/parse";
import { saveHolding, suggestSecurities } from "@/lib/server/actions";

export type PreviewRow = {
  name: string;
  quantity: string;
  avgPrice: string;
  /** 표에서 읽은 현재가. 저장하지 않는다. */
  currentPrice: number | null;
  matches: SecurityMatch[];
  ticker: string;
  include: boolean;
};

function marketOf(ticker: string, match?: SecurityMatch): "KR" | "US" {
  if (match) return match.market;
  const known = classify(ticker).market;
  if (known) return known;
  return /^\d{6}$/.test(ticker) ? "KR" : "US";
}

function sleeveOf(ticker: string, match?: SecurityMatch): Sleeve {
  if (match) return sleeveForSecurity(match.code, match.name, match.market);
  return classify(ticker).sleeve ?? (marketOf(ticker) === "US" ? "US_EQUITY" : "KR_EQUITY");
}

function heldPosition(held: HeldPosition[], ticker: string): HeldPosition | undefined {
  const code = normalizeTicker(ticker);
  return held.find((item) => item.ticker === code);
}

export function rowChange(held: HeldPosition[], ticker: string, quantityText: string, avgText: string): "new" | "changed" | "same" | null {
  const code = normalizeTicker(ticker);
  if (!code) return null;
  const quantity = Number(quantityText.replace(/,/g, ""));
  const avgPrice = Number(avgText.replace(/,/g, ""));
  if (!(quantity > 0) || !(avgPrice > 0)) return null;
  return holdingImportChange(heldPosition(held, code), { quantity, avgPrice });
}

export async function matchRows(holdings: ImportedHolding[], held: HeldPosition[]): Promise<PreviewRow[]> {
  const rows: PreviewRow[] = new Array(holdings.length);
  let cursor = 0;
  async function worker() {
    while (cursor < holdings.length) {
      const index = cursor;
      cursor += 1;
      const holding = holdings[index];
      const matches = await suggestSecurities(holding.name);
      const picked = preferredMatch(holding.name, matches);
      const ticker = picked?.code ?? "";
      const avgPrice = holding.avgPrice == null ? "" : String(holding.avgPrice);
      const warning = holdingAvgWarning(avgPrice, holding.currentPrice);
      const change = ticker && !warning ? rowChange(held, ticker, String(holding.quantity), avgPrice) : null;
      rows[index] = {
        name: holding.name,
        quantity: String(holding.quantity),
        avgPrice,
        currentPrice: holding.currentPrice,
        matches,
        ticker,
        include: Boolean(ticker) && !warning && change !== "same",
      };
    }
  }
  await Promise.all(Array.from({ length: Math.min(4, holdings.length) }, () => worker()));
  return rows;
}

export function applyRowPatch(rows: PreviewRow[], held: HeldPosition[], index: number, patch: Partial<PreviewRow>): PreviewRow[] {
  return rows.map((row, rowIndex) => {
    if (rowIndex !== index) return row;
    const next = { ...row, ...patch };
    const warning = holdingAvgWarning(next.avgPrice, next.currentPrice);
    const change = warning ? null : rowChange(held, next.ticker, next.quantity, next.avgPrice);
    const include = warning || change === "same" ? false : patch.include !== undefined ? patch.include : change ? true : next.include;
    return { ...next, include };
  });
}

export async function saveChosenHoldings(
  rows: PreviewRow[],
  held: HeldPosition[],
): Promise<{ ok: true; message: string } | { ok: false; message: string }> {
  const chosen = rows.filter((row) => row.include);
  const pending = rows.some((row) => rowChange(held, row.ticker, row.quantity, row.avgPrice) !== "same");
  if (chosen.length === 0) {
    if (!pending) return { ok: true, message: "수량과 1주 평균금액이 같은 종목은 그대로 두었습니다." };
    return { ok: false, message: "등록할 종목을 골라 주세요." };
  }
  const codes = chosen.map((row) => normalizeTicker(row.ticker));
  if (codes.some((code) => !code)) return { ok: false, message: "고른 종목의 코드를 확인해 주세요." };
  if (new Set(codes).size !== codes.length) return { ok: false, message: "같은 종목을 두 번 골랐습니다. 하나만 남겨 주세요." };

  let added = 0;
  let updated = 0;
  let unchanged = 0;
  const failures: string[] = [];
  for (const row of chosen) {
    const ticker = normalizeTicker(row.ticker);
    const quantity = Number(row.quantity.replace(/,/g, ""));
    const avgPrice = Number(row.avgPrice.replace(/,/g, ""));
    if (!(quantity > 0) || !(avgPrice > 0)) {
      failures.push(`${row.name}: 수량과 1주 평균금액을 숫자로 입력해 주세요.`);
      continue;
    }
    if (row.currentPrice != null && sameHoldingPrice(avgPrice, row.currentPrice)) {
      failures.push(`${row.name}: 표의 현재가입니다. 1주 평균금액을 입력해 주세요.`);
      continue;
    }
    const change = holdingImportChange(heldPosition(held, ticker), { quantity, avgPrice });
    if (change === "same") {
      unchanged += 1;
      continue;
    }
    const match = row.matches.find((item) => normalizeTicker(item.code) === ticker);
    const market = marketOf(ticker, match);
    const sleeve = sleeveOf(ticker, match);
    const result = await saveHolding({
      ticker,
      quantity,
      currency: (market === "US" ? "USD" : "KRW") as Currency,
      avgPrice,
      sleeve,
      isCoveredCall: sleeve === "US_EQUITY" ? classify(ticker).isCoveredCall : false,
    });
    if (!result.ok) {
      failures.push(`${row.name}: ${result.message}`);
      continue;
    }
    if (change === "new") added += 1;
    else updated += 1;
  }
  if (added + updated === 0) {
    if (failures.length === 0) {
      return { ok: true, message: unchanged > 0 ? "수량과 1주 평균금액이 같은 종목은 그대로 두었습니다." : "저장하지 못했습니다." };
    }
    return { ok: false, message: failures[0] };
  }
  const parts: string[] = [];
  if (added > 0) parts.push(`새 종목 ${added}개를 추가했습니다.`);
  if (updated > 0) parts.push(`${updated}개는 수량 또는 1주 평균금액이 달라 바꿨습니다.`);
  if (unchanged > 0) parts.push(`같은 ${unchanged}개는 그대로 두었습니다.`);
  if (failures.length > 0) parts.push(`${failures.length}개는 저장하지 못했습니다.`);
  return { ok: true, message: parts.join(" ") };
}

export function HoldingImportRows({
  rows,
  held,
  busy,
  onUpdate,
  onClose,
  onConfirm,
}: {
  rows: PreviewRow[];
  held: HeldPosition[];
  busy: string | null;
  onUpdate: (index: number, patch: Partial<PreviewRow>) => void;
  onClose: () => void;
  onConfirm: () => void;
}) {
  return (
    <div className="mt-4 flex flex-col gap-3">
      <p className="text-[13px] leading-5 text-[#4e5968]">
        새 종목은 추가하고, 수량이나 1주 평균금액이 다른 종목만 바꿉니다. 같은 값은 그대로 둡니다. 표의 현재가는 저장하지 않습니다. 비슷한 ETF는 코드를 확인한 뒤 등록해 주세요.
      </p>
      {rows.map((row, index) => {
        const ticker = normalizeTicker(row.ticker);
        const listed = row.matches.some((match) => normalizeTicker(match.code) === ticker);
        const match = row.matches.find((item) => normalizeTicker(item.code) === ticker);
        const ambiguous = row.matches.length > 1 && !preferredMatch(row.name, row.matches);
        const warning = holdingAvgWarning(row.avgPrice, row.currentPrice);
        const change = warning ? null : rowChange(held, row.ticker, row.quantity, row.avgPrice);
        return (
          <div key={`${row.name}-${index}`} className="rounded-2xl bg-[#f2f4f6] px-3 py-3">
            <label className="flex items-start gap-2">
              <input
                type="checkbox"
                className="mt-1 h-4 w-4 accent-[#3182f6]"
                checked={row.include}
                disabled={change === "same" || warning != null}
                onChange={(event) => onUpdate(index, { include: event.target.checked })}
              />
              <span className="min-w-0 flex-1">
                <span className="block text-[14px] font-bold text-[#191f28]">{row.name}</span>
                {ticker && match ? (
                  <span className="mt-0.5 block text-[12px] font-medium text-[#4e5968]">
                    {SLEEVE_LABEL[sleeveOf(ticker, match)]} · {match.market}
                  </span>
                ) : null}
              </span>
            </label>
            <div className="mt-2 grid grid-cols-2 gap-2">
              <label className="grid gap-1">
                <span className="text-[12px] font-medium text-[#8b95a1]">수량</span>
                <input
                  value={row.quantity}
                  inputMode="decimal"
                  onChange={(event) => onUpdate(index, { quantity: event.target.value })}
                  className="h-10 rounded-xl bg-white px-3 text-[14px] font-semibold outline-none ring-[#3182f6] focus:ring-2"
                />
              </label>
              <label className="grid gap-1">
                <span className="text-[12px] font-medium text-[#8b95a1]">1주 평균금액</span>
                <input
                  value={row.avgPrice}
                  inputMode="decimal"
                  onChange={(event) => onUpdate(index, { avgPrice: event.target.value })}
                  className="h-10 rounded-xl bg-white px-3 text-[14px] font-semibold outline-none ring-[#3182f6] focus:ring-2"
                />
              </label>
            </div>
            {row.currentPrice != null ? (
              <p className="mt-2 text-[12px] leading-4 text-[#8b95a1]">표의 현재가 {formatNumber(row.currentPrice)}</p>
            ) : null}
            {warning === "current" ? (
              <p className="mt-2 text-[12px] leading-4 text-[#f04452]">표의 현재가입니다. 1주 평균금액을 입력해 주세요.</p>
            ) : null}
            {warning === "missing" ? <p className="mt-2 text-[12px] leading-4 text-[#f04452]">1주 평균금액을 입력해 주세요.</p> : null}
            {row.matches.length > 0 ? (
              <select
                value={listed ? row.ticker : ""}
                onChange={(event) => onUpdate(index, { ticker: event.target.value, include: event.target.value !== "" })}
                className="mt-2 h-10 w-full rounded-xl bg-white px-3 text-[13px] font-semibold outline-none ring-[#3182f6] focus:ring-2"
              >
                <option value="">종목 선택</option>
                {row.matches.map((item) => (
                  <option key={item.code} value={item.code}>
                    {item.name} · {item.code}
                  </option>
                ))}
              </select>
            ) : (
              <p className="mt-2 text-[12px] leading-4 text-[#f04452]">종목 목록에서 찾지 못했습니다. 코드를 직접 입력해 주세요.</p>
            )}
            <input
              value={listed ? "" : row.ticker}
              onChange={(event) => onUpdate(index, { ticker: event.target.value, include: event.target.value.trim() !== "" })}
              placeholder="코드 직접 입력"
              className="mt-2 h-10 w-full rounded-xl bg-white px-3 text-[13px] font-semibold outline-none ring-[#3182f6] placeholder:font-medium placeholder:text-[#b0b8c1] focus:ring-2"
            />
            {ambiguous ? <p className="mt-2 text-[12px] leading-4 text-[#f04452]">이름이 비슷한 종목이 여러 개입니다. 코드를 확인해 주세요.</p> : null}
            {change === "same" ? <p className="mt-2 text-[12px] leading-4 text-[#8b95a1]">수량과 1주 평균금액이 같아서 그대로 둡니다.</p> : null}
            {change === "changed" ? <p className="mt-2 text-[12px] leading-4 text-[#8b95a1]">수량 또는 1주 평균금액이 달라 바꿉니다.</p> : null}
            {change === "new" ? <p className="mt-2 text-[12px] leading-4 text-[#8b95a1]">새 종목이라 추가합니다.</p> : null}
          </div>
        );
      })}
      <div className="grid grid-cols-2 gap-2">
        <button
          type="button"
          disabled={Boolean(busy)}
          onClick={onClose}
          className="h-12 rounded-2xl bg-[#f2f4f6] text-[15px] font-bold text-[#4e5968] disabled:opacity-60"
        >
          취소
        </button>
        <button
          type="button"
          disabled={Boolean(busy)}
          onClick={onConfirm}
          className="h-12 rounded-2xl bg-[#3182f6] text-[15px] font-bold text-white disabled:opacity-60"
        >
          {busy || "확인하고 등록"}
        </button>
      </div>
    </div>
  );
}
