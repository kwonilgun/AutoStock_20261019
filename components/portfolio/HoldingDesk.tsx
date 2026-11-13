"use client";

import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState, useTransition, type FormEvent, type Ref } from "react";
import { DEFAULT_TICKERS, SLEEVE_LABEL, isCashSleeve, isFundSleeve } from "@/lib/engine/config";
import { classify, normalizeTicker, sleeveForSecurity } from "@/lib/engine/classify";
import { SLEEVES, type Currency, type HoldingInput, type Sleeve } from "@/lib/engine/types";
import { QUANTITY_EVENT_LABEL, type QuantityEvent } from "@/lib/engine/history";
import { holdingGain } from "@/lib/engine/value";
import { formatNumber, formatReturn, formatUsd } from "@/lib/format";
import type { RecommendAddSeed } from "@/lib/recommendations";
import type { SecurityMatch } from "@/lib/quotes/parse";
import { isPlainCashTicker } from "@/lib/quotes/symbol";
import { deleteHolding, saveHolding, suggestSecurities } from "@/lib/server/actions";

type Draft = {
  ticker: string;
  quantity: string;
  currency: Currency;
  price: string;
  avgPrice: string;
  sleeve: Sleeve;
  isCoveredCall: boolean;
};

type Editing = {
  id?: string;
  originalTicker: string;
  name?: string;
  draft: Draft;
};

const EMPTY: Draft = {
  ticker: "",
  quantity: "",
  currency: "KRW",
  price: "",
  avgPrice: "",
  sleeve: "US_EQUITY",
  isCoveredCall: false,
};

const GROUPS: { label: string; sleeves: Sleeve[] }[] = [
  { label: "주식", sleeves: ["US_EQUITY", "KR_EQUITY"] },
  { label: "채권", sleeves: ["BOND_10Y", "BOND_30Y"] },
  { label: "자산", sleeves: ["GOLD", "BTC", "REIT"] },
  { label: "펀드", sleeves: ["FUND"] },
  { label: "현금", sleeves: ["KRW_CASH", "USD_CASH"] },
];

type SleeveChoice = Sleeve | "BOND";

const SLEEVE_MENU: { value: SleeveChoice; label: string }[] = SLEEVES.flatMap((sleeve): { value: SleeveChoice; label: string }[] => {
  if (sleeve === "BOND_30Y") return [];
  if (sleeve === "BOND_10Y") return [{ value: "BOND", label: "채권" }];
  return [{ value: sleeve, label: SLEEVE_LABEL[sleeve] }];
});

function isBondSleeve(sleeve: Sleeve): boolean {
  return sleeve === "BOND_10Y" || sleeve === "BOND_30Y";
}

function menuValue(sleeve: Sleeve): SleeveChoice {
  return isBondSleeve(sleeve) ? "BOND" : sleeve;
}

function bondSleeveFor(draft: Draft): Sleeve {
  if (isBondSleeve(draft.sleeve)) return draft.sleeve;
  const known = classify(draft.ticker);
  if (known.sleeve && isBondSleeve(known.sleeve)) return known.sleeve;
  return "BOND_30Y";
}

const fieldClass =
  "h-12 w-full rounded-2xl bg-[#f2f4f6] px-4 text-[16px] font-semibold text-[#191f28] outline-none ring-[#3182f6] placeholder:font-medium placeholder:text-[#b0b8c1] focus:ring-2";

const compactFieldClass =
  "h-10 w-full rounded-xl bg-[#f2f4f6] px-3 text-[14px] font-semibold text-[#191f28] outline-none ring-[#3182f6] placeholder:font-medium placeholder:text-[#b0b8c1] focus:ring-2";

function fundMarketValue(holding: HoldingInput): number | null {
  if (holding.price == null || !Number.isFinite(holding.price) || holding.price <= 0) return null;
  if (!Number.isFinite(holding.quantity) || holding.quantity <= 0) return null;
  return Math.round(holding.quantity * holding.price);
}

function fundGainAmount(holding: HoldingInput): number | null {
  const value = fundMarketValue(holding);
  if (value == null || holding.avgPrice == null || !(holding.avgPrice > 0)) return null;
  return value - Math.round(holding.quantity * holding.avgPrice);
}

function toDraft(holding: HoldingInput): Draft {
  if (holding.sleeve != null && isFundSleeve(holding.sleeve)) {
    const value = fundMarketValue(holding);
    const gain = fundGainAmount(holding);
    return {
      ticker: holding.name?.trim() || holding.ticker,
      quantity: value == null ? "" : String(value),
      currency: "KRW",
      price: value == null ? "" : String(value),
      avgPrice: gain == null ? "" : String(gain),
      sleeve: "FUND",
      isCoveredCall: false,
    };
  }
  return {
    ticker: holding.ticker,
    quantity: String(holding.quantity),
    currency: holding.currency,
    price: holding.price == null ? "" : String(holding.price),
    avgPrice: holding.avgPrice == null ? "" : String(holding.avgPrice),
    sleeve: holding.sleeve ?? "US_EQUITY",
    isCoveredCall: holding.isCoveredCall ?? false,
  };
}

function withTicker(current: Draft, ticker: string): Draft {
  if (isFundSleeve(current.sleeve)) return { ...current, ticker, currency: "KRW", isCoveredCall: false };
  const known = classify(ticker);
  return {
    ...current,
    ticker,
    sleeve: known.sleeve ?? current.sleeve,
    isCoveredCall: known.isCoveredCall,
    currency: known.market === "US" ? "USD" : known.market === "KR" ? "KRW" : current.currency,
  };
}

function withChoice(current: Draft, choice: SleeveChoice, mode: "add" | "edit"): Draft {
  return withSleeve(current, choice === "BOND" ? bondSleeveFor(current) : choice, mode);
}

function keepsSelectedTicker(ticker: string): boolean {
  const key = normalizeTicker(ticker);
  return key !== "" && !isPlainCashTicker(key);
}

function faceCashDraft(draft: Draft): boolean {
  return isCashSleeve(draft.sleeve) && !keepsSelectedTicker(draft.ticker);
}

function withSleeve(current: Draft, sleeve: Sleeve, mode: "add" | "edit" = "edit"): Draft {
  if (isFundSleeve(sleeve)) {
    const leavingCash = isCashSleeve(current.sleeve) && isPlainCashTicker(current.ticker);
    const entering = !isFundSleeve(current.sleeve);
    return {
      ...current,
      sleeve,
      ticker: leavingCash ? "" : current.ticker,
      currency: "KRW",
      quantity: entering ? "" : current.quantity,
      avgPrice: entering ? "" : current.avgPrice,
      price: entering ? "" : current.price,
      isCoveredCall: false,
    };
  }
  const base: Draft =
    isFundSleeve(current.sleeve)
      ? { ...current, quantity: "", avgPrice: "", price: "" }
      : current;
  if (sleeve === "KRW_CASH" || sleeve === "USD_CASH") {
    // 수정에서 이미 고른 초단기 ETF는 유지한다. 추가는 금액만 받는다.
    if (mode !== "add" && keepsSelectedTicker(base.ticker)) return { ...base, sleeve, isCoveredCall: false };
    return {
      ...base,
      sleeve,
      ticker: DEFAULT_TICKERS[sleeve].ticker,
      currency: sleeve === "USD_CASH" ? "USD" : "KRW",
      quantity: mode === "add" ? "" : base.quantity,
      avgPrice: mode === "add" ? "" : base.avgPrice,
      price: mode === "add" ? "" : base.price,
      isCoveredCall: false,
    };
  }
  const leavingCash = isCashSleeve(base.sleeve) && isPlainCashTicker(base.ticker);
  return { ...base, sleeve, ticker: leavingCash ? "" : base.ticker };
}

function amountNumber(value: string): number {
  const text = value.replace(/,/g, "").trim();
  if (!text) return Number.NaN;
  return Number(text);
}

function holdingPayload(draft: Draft, mode: "add" | "edit", addTo = 0) {
  if (isFundSleeve(draft.sleeve)) {
    const value = amountNumber(draft.quantity);
    const gainText = draft.avgPrice.replace(/,/g, "").trim();
    const gain = gainText === "" ? 0 : Number(gainText);
    const cost = value - gain;
    return {
      ticker: draft.ticker.trim(),
      quantity: 1,
      currency: "KRW" as Currency,
      price: value,
      avgPrice: cost,
      sleeve: draft.sleeve,
      isCoveredCall: false,
    };
  }
  const cash = faceCashDraft(draft);
  const known = classify(draft.ticker);
  const avgPrice = Number(draft.avgPrice.replace(/,/g, ""));
  return {
    ticker: cash ? DEFAULT_TICKERS[draft.sleeve as "KRW_CASH" | "USD_CASH"].ticker : draft.ticker,
    quantity: Number(draft.quantity.replace(/,/g, "")) + addTo,
    currency: (cash ? (draft.sleeve === "USD_CASH" ? "USD" : "KRW") : draft.currency) as Currency,
    price: cash ? 1 : mode === "edit" ? Number(draft.price) : undefined,
    avgPrice: cash || !(avgPrice > 0) ? undefined : avgPrice,
    sleeve: draft.sleeve,
    isCoveredCall: draft.sleeve === "US_EQUITY" ? (mode === "edit" ? draft.isCoveredCall : known.isCoveredCall) : false,
  };
}

function won(value: number): string {
  const rounded = Math.round(value);
  const sign = rounded < 0 ? "-" : "";
  return `${sign}${formatNumber(Math.abs(rounded))}원`;
}

function signedWon(value: number): string {
  const rounded = Math.round(value);
  if (rounded === 0) return "0원";
  return `${rounded > 0 ? "+" : "−"}${formatNumber(Math.abs(rounded))}원`;
}

function toneClass(value: number): string {
  if (Math.round(value * 1000) / 10 === 0) return "text-[#8b95a1]";
  return value > 0 ? "text-[#f04452]" : "text-[#3182f6]";
}

function quantityLabel(holding: HoldingInput): string {
  if (holding.sleeve != null && isFundSleeve(holding.sleeve)) {
    const value = fundMarketValue(holding);
    return value == null ? "펀드" : won(value);
  }
  const cash = holding.sleeve != null && isCashSleeve(holding.sleeve) && isPlainCashTicker(holding.ticker);
  if (cash) return holding.currency === "USD" ? formatUsd(holding.quantity) : `${formatNumber(holding.quantity)}원`;
  const qty = Number.isInteger(holding.quantity) ? formatNumber(holding.quantity) : String(holding.quantity);
  return `${qty}주`;
}

function holdingTitle(holding: HoldingInput): string {
  if (holding.sleeve != null && isFundSleeve(holding.sleeve)) return holding.name?.trim() || holding.ticker;
  const name = holding.name?.trim();
  if (!name || normalizeTicker(name) === normalizeTicker(holding.ticker)) return holding.ticker;
  return `${name}-${holding.ticker}`;
}

function priceText(price: number, currency: Currency): string {
  return currency === "USD" ? formatUsd(price) : `${formatNumber(price)}원`;
}

function priceLabel(holding: HoldingInput): string {
  if (holding.price == null || (holding.sleeve != null && isCashSleeve(holding.sleeve) && isPlainCashTicker(holding.ticker))) return "";
  const current = priceText(holding.price, holding.currency);
  if (holding.avgPrice == null || !(holding.avgPrice > 0)) return current;
  return `${current} · 평단가 ${priceText(holding.avgPrice, holding.currency)}`;
}

function quoteFetchedLabel(value: string | undefined): string {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Seoul",
    month: "numeric",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(date);
  const pick = (type: Intl.DateTimeFormatPartTypes) => parts.find((part) => part.type === type)?.value ?? "";
  const hour = pick("hour");
  const minute = pick("minute");
  if (!hour || !minute) return "";
  return `${Number(pick("month"))}월 ${Number(pick("day"))}일 ${hour}:${minute}`;
}

function amountText(holding: HoldingInput, quantity: number): string {
  const cash = holding.sleeve != null && isCashSleeve(holding.sleeve) && isPlainCashTicker(holding.ticker);
  if (cash) return holding.currency === "USD" ? formatUsd(quantity) : `${formatNumber(Math.round(quantity))}원`;
  const rounded = Math.round(quantity);
  const whole = Math.abs(quantity - rounded) < 1e-6;
  return `${whole ? formatNumber(rounded) : formatNumber(quantity)}주`;
}

function signedAmount(holding: HoldingInput, delta: number): string {
  if (Math.abs(delta) < 1e-6) return amountText(holding, 0);
  const body = amountText(holding, Math.abs(delta));
  return `${delta > 0 ? "+" : "−"}${body}`;
}

function dateLabel(date: string): string {
  const [year, month, day] = date.split("-");
  if (!year || !month || !day) return date;
  return `${year}년 ${Number(month)}월 ${Number(day)}일`;
}

function eventTone(kind: QuantityEvent["kind"]): string {
  if (kind === "decrease" || kind === "remove") return "text-[#f04452]";
  if (kind === "add" || kind === "increase") return "text-[#3182f6]";
  return "text-[#4e5968]";
}

function holdingByTicker(holdings: HoldingInput[], ticker: string): HoldingInput | undefined {
  const key = normalizeTicker(ticker);
  return holdings.find((holding) => normalizeTicker(holding.ticker) === key);
}

function plainAmount(ticker: string, quantity: number): string {
  const key = normalizeTicker(ticker);
  if (key === "CASH" || key === "MMF") return `${formatNumber(Math.round(quantity))}원`;
  if (key === "USD") return formatUsd(quantity);
  const rounded = Math.round(quantity);
  const whole = Math.abs(quantity - rounded) < 1e-6;
  return `${whole ? formatNumber(rounded) : formatNumber(quantity)}주`;
}

function eventAmount(holdings: HoldingInput[], ticker: string, quantity: number): string {
  const holding = holdingByTicker(holdings, ticker);
  return holding ? amountText(holding, quantity) : plainAmount(ticker, quantity);
}

function eventSignedAmount(holdings: HoldingInput[], ticker: string, delta: number): string {
  const holding = holdingByTicker(holdings, ticker);
  if (holding) return signedAmount(holding, delta);
  if (Math.abs(delta) < 1e-6) return plainAmount(ticker, 0);
  const body = plainAmount(ticker, Math.abs(delta));
  return `${delta > 0 ? "+" : "−"}${body}`;
}

function eventName(holdings: HoldingInput[], ticker: string): string {
  const holding = holdingByTicker(holdings, ticker);
  return holding ? holdingTitle(holding) : ticker;
}

const EVENT_RANK: Record<QuantityEvent["kind"], number> = {
  add: 0,
  increase: 1,
  decrease: 2,
  remove: 3,
  start: 4,
};

function overviewByDate(events: QuantityEvent[]): { date: string; events: QuantityEvent[] }[] {
  const byDate = new Map<string, QuantityEvent[]>();
  for (const event of events) {
    const day = byDate.get(event.date) ?? [];
    day.push(event);
    byDate.set(event.date, day);
  }
  return [...byDate.entries()]
    .sort(([left], [right]) => right.localeCompare(left))
    .map(([date, day]) => ({
      date,
      events: [...day].sort(
        (left, right) => EVENT_RANK[left.kind] - EVENT_RANK[right.kind] || left.ticker.localeCompare(right.ticker),
      ),
    }));
}

function ClockIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden>
      <circle cx="12" cy="12" r="8.25" stroke="currentColor" strokeWidth="1.8" />
      <path d="M12 7.75V12l2.75 1.75" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function ChevronIcon({ open }: { open: boolean }) {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden
      className={`shrink-0 transition-transform ${open ? "rotate-180" : ""}`}
    >
      <path d="M6 9.5 12 15.5 18 9.5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function withSecurity(current: Draft, match: SecurityMatch): Draft {
  const next = withTicker(current, match.code);
  return {
    ...next,
    sleeve: sleeveForSecurity(match.code, match.name, match.market),
    currency: match.market === "US" ? "USD" : "KRW",
  };
}

function AddTickerField({
  draft,
  onChange,
  guide = false,
  tickerRef,
}: {
  draft: Draft;
  onChange: (next: Draft) => void;
  guide?: boolean;
  tickerRef?: Ref<HTMLInputElement>;
}) {
  const [active, setActive] = useState(false);
  const [picked, setPicked] = useState<SecurityMatch | null>(null);
  const [suggestions, setSuggestions] = useState<SecurityMatch[]>([]);
  const [status, setStatus] = useState<"idle" | "loading" | "done">("idle");
  const listId = "ticker-suggestions";
  const hideTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pickedNow = picked != null && normalizeTicker(picked.code) === normalizeTicker(draft.ticker);

  useEffect(() => {
    if (picked && normalizeTicker(picked.code) !== normalizeTicker(draft.ticker)) setPicked(null);
  }, [draft.ticker, picked]);

  useEffect(() => {
    if (!active || isFundSleeve(draft.sleeve)) return;
    const text = draft.ticker.trim();
    if (text.length < 2 || pickedNow) {
      setSuggestions([]);
      setStatus("idle");
      return;
    }
    setSuggestions([]);
    setStatus("loading");
    let cancelled = false;
    const timer = setTimeout(() => {
      suggestSecurities(text)
        .then((rows) => {
          if (cancelled) return;
          setSuggestions(rows);
          setStatus("done");
        })
        .catch(() => {
          if (cancelled) return;
          setSuggestions([]);
          setStatus("done");
        });
    }, 250);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [active, draft.sleeve, draft.ticker, pickedNow]);

  function choose(match: SecurityMatch) {
    setPicked(match);
    setSuggestions([]);
    setStatus("idle");
    onChange(withSecurity(draft, match));
  }

  const fund = isFundSleeve(draft.sleeve);
  const showList = !fund && active && !pickedNow && (status === "loading" || status === "done");

  return (
    <div className="grid gap-1.5">
      <label className="grid gap-1.5" htmlFor="add-ticker">
        <span className={`text-[13px] ${guide ? "font-bold text-[#3182f6]" : "font-medium text-[#8b95a1]"}`}>
          {fund ? "펀드명" : guide ? "여기에 티커를 입력" : "종목명"}
        </span>
        <input
          id="add-ticker"
          ref={tickerRef}
          required
          value={picked && pickedNow ? picked.name : draft.ticker}
          onChange={(event) => {
            setPicked(null);
            onChange(withTicker(draft, event.target.value));
          }}
          onFocus={() => {
            if (hideTimer.current) clearTimeout(hideTimer.current);
            setActive(true);
          }}
          onBlur={() => {
            hideTimer.current = setTimeout(() => setActive(false), 200);
          }}
          className={guide ? `${fieldClass} ring-2 ring-[#3182f6]` : fieldClass}
          placeholder={fund ? "예: 미래에셋 TDF2050" : "종목명 또는 코드"}
          maxLength={fund ? 80 : undefined}
          autoComplete="off"
          role="combobox"
          aria-autocomplete="list"
          aria-expanded={showList}
          aria-controls={listId}
          aria-describedby={guide ? "ticker-guide" : undefined}
        />
      </label>
      {picked && pickedNow ? <p className="px-1 text-[12px] font-medium text-[#8b95a1]">{picked.code}</p> : null}
      {showList ? (
        <div id={listId} className="overflow-hidden rounded-2xl border border-[#e5e8eb] bg-white">
          {status === "loading" ? <p className="px-4 py-3 text-[14px] text-[#8b95a1]">찾는 중</p> : null}
          {status === "done" && suggestions.length === 0 ? (
            <p className="px-4 py-3 text-[14px] text-[#8b95a1]">해당하는 종목이 없습니다.</p>
          ) : null}
          {suggestions.length > 0 ? (
            <ul className="max-h-60 overflow-y-auto">
              {suggestions.map((match) => (
                <li key={match.code}>
                  <button
                    type="button"
                    className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left hover:bg-[#f2f4f6]"
                    onPointerDown={(event) => {
                      event.preventDefault();
                      choose(match);
                    }}
                  >
                    <span className="min-w-0 truncate text-[15px] font-semibold text-[#191f28]">{match.name}</span>
                    <span className="shrink-0 text-[13px] font-medium text-[#8b95a1]">{match.code}</span>
                  </button>
                </li>
              ))}
            </ul>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

function HoldingFields({
  draft,
  onChange,
  mode,
  compact = false,
  guide = false,
  tickerRef,
}: {
  draft: Draft;
  onChange: (next: Draft) => void;
  mode: "add" | "edit";
  compact?: boolean;
  guide?: boolean;
  tickerRef?: Ref<HTMLInputElement>;
}) {
  const cash = (mode === "add" && isCashSleeve(draft.sleeve)) || faceCashDraft(draft);
  const fund = isFundSleeve(draft.sleeve);
  if (compact) {
    const sleeveField = (
      <label className="grid gap-1">
        <span className="text-[12px] font-medium text-[#8b95a1]">자산군</span>
        <select
          value={menuValue(draft.sleeve)}
          onChange={(event) => onChange(withChoice(draft, event.target.value as SleeveChoice, mode))}
          className={compactFieldClass}
        >
          {SLEEVE_MENU.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      </label>
    );
    const amountField = (
      <label className="grid gap-1">
        <span className="text-[12px] font-medium text-[#8b95a1]">
          {cash ? (draft.sleeve === "USD_CASH" ? "금액(달러)" : "금액(원)") : "수량"}
        </span>
        <input
          required
          value={draft.quantity}
          onChange={(event) => onChange({ ...draft, quantity: event.target.value })}
          inputMode="decimal"
          className={compactFieldClass}
          placeholder={cash ? (draft.sleeve === "USD_CASH" ? "1000" : "1000000") : undefined}
        />
      </label>
    );
    return (
      <div className="grid grid-cols-2 gap-2">
        {cash ? null : (
          <label className="grid gap-1">
            <span className={`text-[12px] ${guide ? "font-bold text-[#3182f6]" : "font-medium text-[#8b95a1]"}`}>
              {fund ? "펀드명" : guide ? "여기에 티커를 입력" : "티커 또는 종목명"}
            </span>
            <input
              ref={tickerRef}
              required
              value={draft.ticker}
              onChange={(event) => onChange(withTicker(draft, event.target.value))}
              className={guide ? `${compactFieldClass} ring-2 ring-[#3182f6]` : compactFieldClass}
              placeholder={fund ? "예: 미래에셋 TDF2050" : guide ? "예: 005930, VOO" : "005930"}
              maxLength={fund ? 80 : undefined}
              autoComplete="off"
              aria-describedby={guide ? "ticker-guide" : undefined}
            />
          </label>
        )}
        {cash ? sleeveField : fund ? null : amountField}
        {cash ? (
          <label className="grid gap-1">
            <span className="text-[12px] font-medium text-[#8b95a1]">
              {draft.sleeve === "USD_CASH" ? "금액(달러)" : "금액(원)"}
            </span>
            <input
              required
              value={draft.quantity}
              onChange={(event) => onChange({ ...draft, quantity: event.target.value })}
              inputMode="decimal"
              className={compactFieldClass}
              placeholder={draft.sleeve === "USD_CASH" ? "1000" : "1000000"}
            />
          </label>
        ) : (
          sleeveField
        )}
        {fund ? (
          <>
            <label className="grid gap-1">
              <span className="text-[12px] font-medium text-[#8b95a1]">평가금액(원)</span>
              <input
                required
                value={draft.quantity}
                onChange={(event) => onChange({ ...draft, quantity: event.target.value })}
                inputMode="decimal"
                className={compactFieldClass}
                placeholder="10000000"
              />
            </label>
            <label className="grid gap-1">
              <span className="text-[12px] font-medium text-[#8b95a1]">손익(원)</span>
              <input
                value={draft.avgPrice}
                onChange={(event) => onChange({ ...draft, avgPrice: event.target.value })}
                inputMode="decimal"
                className={compactFieldClass}
                placeholder="0"
              />
            </label>
          </>
        ) : null}
        {cash || fund ? null : (
          <label className="grid gap-1">
            <span className="text-[12px] font-medium text-[#8b95a1]">통화</span>
            <select
              value={draft.currency}
              onChange={(event) => onChange({ ...draft, currency: event.target.value as Currency })}
              className={compactFieldClass}
            >
              <option value="KRW">KRW</option>
              <option value="USD">USD</option>
            </select>
          </label>
        )}
        {cash || fund ? null : (
          <label className="grid gap-1">
            <span className="text-[12px] font-medium text-[#8b95a1]">{mode === "edit" ? "평균 단가" : "평균단가"}</span>
            <input
              required={mode === "add"}
              value={draft.avgPrice}
              onChange={(event) => onChange({ ...draft, avgPrice: event.target.value })}
              inputMode="decimal"
              className={compactFieldClass}
              placeholder={draft.currency === "USD" ? "100" : "50000"}
            />
          </label>
        )}
      </div>
    );
  }
  return (
    <div className="grid gap-4">
      {isCashSleeve(draft.sleeve) && !cash ? (
        <p className="rounded-2xl bg-[#f2f4f6] px-4 py-3 text-[14px] font-medium leading-5 text-[#4e5968]">
          고른 종목은 그대로 둡니다. 원화·달러와 같은 초단기 금리 ETF는 현금으로 셉니다.
        </p>
      ) : null}
      {cash ? (
        <p className="rounded-2xl bg-[#f2f4f6] px-4 py-3 text-[14px] font-medium leading-5 text-[#4e5968]">
          {draft.sleeve === "USD_CASH" ? "달러 현금" : "원화 현금"}은 티커 없이 금액만 입력하면 됩니다.
        </p>
      ) : fund ? (
        <>
          <p className="rounded-2xl bg-[#f2f4f6] px-4 py-3 text-[14px] font-medium leading-5 text-[#4e5968]">
            펀드는 수량과 평균단가 없이 평가금액과 손익만 입력합니다. 손실은 마이너스로 적습니다.
          </p>
          {mode === "add" ? (
            <AddTickerField draft={draft} onChange={onChange} guide={guide} tickerRef={tickerRef} />
          ) : (
            <label className="grid gap-1.5">
              <span className="text-[13px] font-medium text-[#8b95a1]">펀드명</span>
              <input
                required
                value={draft.ticker}
                onChange={(event) => onChange(withTicker(draft, event.target.value))}
                className={fieldClass}
                placeholder="예: 미래에셋 TDF2050"
                maxLength={80}
                autoComplete="off"
              />
            </label>
          )}
        </>
      ) : mode === "add" ? (
        <AddTickerField draft={draft} onChange={onChange} guide={guide} tickerRef={tickerRef} />
      ) : (
        <label className="grid gap-1.5">
          <span className="text-[13px] font-medium text-[#8b95a1]">티커(종목코드) 또는 종목명</span>
          <input
            ref={tickerRef}
            required
            value={draft.ticker}
            onChange={(event) => onChange(withTicker(draft, event.target.value))}
            className={fieldClass}
            placeholder="005930"
            autoComplete="off"
          />
        </label>
      )}
      <label className="grid gap-1.5">
        <span className="text-[13px] font-medium text-[#8b95a1]">자산군</span>
        <select
          value={menuValue(draft.sleeve)}
          onChange={(event) => onChange(withChoice(draft, event.target.value as SleeveChoice, mode))}
          className={fieldClass}
        >
          {SLEEVE_MENU.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      </label>
      {fund ? (
        <div className="grid grid-cols-2 gap-3">
          <label className="grid gap-1.5">
            <span className="text-[13px] font-medium text-[#8b95a1]">평가금액(원)</span>
            <input
              required
              value={draft.quantity}
              onChange={(event) => onChange({ ...draft, quantity: event.target.value })}
              inputMode="decimal"
              className={fieldClass}
              placeholder="10000000"
            />
          </label>
          <label className="grid gap-1.5">
            <span className="text-[13px] font-medium text-[#8b95a1]">손익(원)</span>
            <input
              value={draft.avgPrice}
              onChange={(event) => onChange({ ...draft, avgPrice: event.target.value })}
              inputMode="text"
              className={fieldClass}
              placeholder="0"
            />
          </label>
        </div>
      ) : cash ? (
        <label className="grid gap-1.5">
          <span className="text-[13px] font-medium text-[#8b95a1]">
            {draft.sleeve === "USD_CASH" ? "금액(달러)" : "금액(원)"}
          </span>
          <input
            required
            value={draft.quantity}
            onChange={(event) => onChange({ ...draft, quantity: event.target.value })}
            inputMode="decimal"
            className={fieldClass}
            placeholder={draft.sleeve === "USD_CASH" ? "1000" : "1000000"}
          />
        </label>
      ) : (
        <div className="grid grid-cols-2 gap-3">
          <label className="grid gap-1.5">
            <span className="text-[13px] font-medium text-[#8b95a1]">수량</span>
            <input
              required
              value={draft.quantity}
              onChange={(event) => onChange({ ...draft, quantity: event.target.value })}
              inputMode="decimal"
              className={fieldClass}
            />
          </label>
          <label className="grid gap-1.5">
            <span className="text-[13px] font-medium text-[#8b95a1]">통화</span>
            <select
              value={draft.currency}
              onChange={(event) => onChange({ ...draft, currency: event.target.value as Currency })}
              className={fieldClass}
            >
              <option value="KRW">KRW</option>
              <option value="USD">USD</option>
            </select>
          </label>
        </div>
      )}
      {cash || fund ? null : (
        <label className="grid gap-1.5">
          <span className="text-[13px] font-medium text-[#8b95a1]">{mode === "edit" ? "평균 단가" : "평균단가"}</span>
          <input
            required={mode === "add"}
            value={draft.avgPrice}
            onChange={(event) => onChange({ ...draft, avgPrice: event.target.value })}
            inputMode="decimal"
            className={fieldClass}
            placeholder={draft.currency === "USD" ? "100" : "50000"}
          />
        </label>
      )}
      {mode === "edit" && !cash && !fund ? (
        <label className="grid gap-1.5">
          <span className="text-[13px] font-medium text-[#8b95a1]">현재가</span>
          <input
            required
            value={draft.price}
            onChange={(event) => onChange({ ...draft, price: event.target.value })}
            inputMode="decimal"
            className={fieldClass}
          />
        </label>
      ) : null}
      {mode === "edit" && draft.sleeve === "US_EQUITY" ? (
        <label className="flex h-12 items-center justify-between rounded-2xl bg-[#f2f4f6] px-4 text-[15px] font-semibold text-[#191f28]">
          커버드콜
          <input
            type="checkbox"
            checked={draft.isCoveredCall}
            onChange={(event) => onChange({ ...draft, isCoveredCall: event.target.checked })}
            className="h-5 w-5 accent-[#3182f6]"
          />
        </label>
      ) : null}
    </div>
  );
}

function draftFromSeed(seed: RecommendAddSeed): Draft {
  return withTicker({ ...EMPTY, sleeve: seed.sleeve, currency: seed.currency }, seed.ticker);
}

export function HoldingDesk({
  holdings: source,
  fx,
  quantityEvents = [],
  seed = null,
}: {
  holdings: HoldingInput[];
  fx: number;
  quantityEvents?: QuantityEvent[];
  seed?: RecommendAddSeed | null;
}) {
  const router = useRouter();
  const [draft, setDraft] = useState<Draft>(EMPTY);
  const tickerRef = useRef<HTMLInputElement>(null);
  const appliedSeed = useRef("");
  const wasEmpty = useRef(source.length === 0);
  const [adding, setAdding] = useState(source.length === 0);
  const [addError, setAddError] = useState<string | null>(null);
  const [addNotice, setAddNotice] = useState<string | null>(null);
  const [editing, setEditing] = useState<Editing | null>(null);
  const [historyHolding, setHistoryHolding] = useState<HoldingInput | null>(null);
  const [pendingDelete, setPendingDelete] = useState<HoldingInput | null>(null);
  const [overview, setOverview] = useState(false);
  const [openOverviewDates, setOpenOverviewDates] = useState<string[]>([]);
  const [editError, setEditError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [removedIds, setRemovedIds] = useState<string[]>([]);
  const [pending, startTransition] = useTransition();
  const addDialogRef = useRef<HTMLDialogElement>(null);
  const addNoticeRef = useRef<HTMLDialogElement>(null);
  const dialogRef = useRef<HTMLDialogElement>(null);
  const historyDialogRef = useRef<HTMLDialogElement>(null);
  const deleteDialogRef = useRef<HTMLDialogElement>(null);
  const overviewDialogRef = useRef<HTMLDialogElement>(null);
  const holdings = useMemo(
    () => source.filter((holding) => !holding.id || !removedIds.includes(holding.id)),
    [source, removedIds],
  );
  const guide = holdings.length === 0;

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog || !editing || dialog.open) return;
    dialog.showModal();
  }, [editing]);

  useEffect(() => {
    const dialog = historyDialogRef.current;
    if (!dialog || !historyHolding || dialog.open) return;
    dialog.showModal();
  }, [historyHolding]);

  useEffect(() => {
    const dialog = deleteDialogRef.current;
    if (!dialog || !pendingDelete || dialog.open) return;
    dialog.showModal();
  }, [pendingDelete]);

  useEffect(() => {
    const dialog = overviewDialogRef.current;
    if (!dialog) return;
    if (overview && !dialog.open) dialog.showModal();
    if (!overview && dialog.open) dialog.close();
  }, [overview]);

  useEffect(() => {
    const dialog = addDialogRef.current;
    if (!dialog) return;
    if (adding && !dialog.open) dialog.showModal();
    if (!adding && dialog.open) dialog.close();
  }, [adding]);

  useEffect(() => {
    const dialog = addNoticeRef.current;
    if (!dialog) return;
    if (addNotice && !dialog.open) dialog.showModal();
    if (!addNotice && dialog.open) dialog.close();
  }, [addNotice]);

  useEffect(() => {
    if (guide && !wasEmpty.current) setAdding(true);
    wasEmpty.current = guide;
  }, [guide]);

  useEffect(() => {
    if (!adding || !guide || isCashSleeve(draft.sleeve)) return;
    const frame = requestAnimationFrame(() => tickerRef.current?.focus());
    return () => cancelAnimationFrame(frame);
  }, [adding, guide, draft.sleeve]);

  const seedKey = seed ? `${seed.ticker}|${seed.sleeve}|${seed.currency}` : "";
  useEffect(() => {
    if (!seed || !seedKey || appliedSeed.current === seedKey) return;
    appliedSeed.current = seedKey;
    setDraft(draftFromSeed(seed));
    setAddError(null);
    setAdding(true);
    setMessage("추천 종목을 채워 두었습니다. 수량과 평균단가를 입력한 뒤 추가해 주세요.");
  }, [seed, seedKey]);

  const rows = useMemo(
    () =>
      holdings.map((holding) => {
        const value =
          holding.price == null
            ? null
            : Math.round(holding.quantity * holding.price * (holding.currency === "USD" ? fx : 1));
        return { holding, value };
      }),
    [holdings, fx],
  );
  const quoteFetched = useMemo(() => {
    const times = holdings
      .filter(
        (holding) =>
          holding.price != null &&
          holding.priceSource !== "manual" &&
          !(holding.sleeve != null && isCashSleeve(holding.sleeve) && isPlainCashTicker(holding.ticker)),
      )
      .map((holding) => (holding.priceUpdatedAt ? new Date(holding.priceUpdatedAt).getTime() : Number.NaN))
      .filter((time) => !Number.isNaN(time));
    if (times.length === 0) return "";
    return quoteFetchedLabel(new Date(Math.min(...times)).toISOString());
  }, [holdings]);

  const grouped = GROUPS.map((group) => ({
    label: group.label,
    rows: rows.filter((row) => row.holding.sleeve != null && group.sleeves.includes(row.holding.sleeve)),
  })).filter((group) => group.rows.length > 0);

  const ungrouped = rows.filter(
    (row) => row.holding.sleeve == null || !GROUPS.some((group) => group.sleeves.includes(row.holding.sleeve!)),
  );

  function tickerTaken(ticker: string, except?: { id?: string; ticker: string }) {
    const key = normalizeTicker(ticker);
    return holdings.some((holding) => {
      if (except?.id && holding.id === except.id) return false;
      if (!except?.id && except && normalizeTicker(holding.ticker) === normalizeTicker(except.ticker)) return false;
      return normalizeTicker(holding.ticker) === key;
    });
  }

  function openAdd() {
    if (dialogRef.current?.open) dialogRef.current.close();
    if (overviewDialogRef.current?.open) overviewDialogRef.current.close();
    setAddError(null);
    setAdding(true);
  }

  function closeAddNotice() {
    const dialog = addNoticeRef.current;
    if (dialog?.open) {
      dialog.close();
      return;
    }
    setAddNotice(null);
  }

  function closeAdd() {
    const dialog = addDialogRef.current;
    if (dialog?.open) {
      dialog.close();
      return;
    }
    setAdding(false);
    setAddError(null);
  }

  function openEdit(holding: HoldingInput) {
    setEditError(null);
    setEditing({
      id: holding.id,
      originalTicker: holding.ticker,
      name: holding.name,
      draft: toDraft(holding),
    });
  }

  function closeEdit() {
    const dialog = dialogRef.current;
    if (dialog?.open) {
      dialog.close();
      return;
    }
    setEditing(null);
    setEditError(null);
  }

  function openHistory(holding: HoldingInput) {
    if (dialogRef.current?.open) dialogRef.current.close();
    if (addDialogRef.current?.open) addDialogRef.current.close();
    if (overviewDialogRef.current?.open) overviewDialogRef.current.close();
    setHistoryHolding(holding);
  }

  function openOverview() {
    if (dialogRef.current?.open) dialogRef.current.close();
    if (addDialogRef.current?.open) addDialogRef.current.close();
    if (historyDialogRef.current?.open) historyDialogRef.current.close();
    if (deleteDialogRef.current?.open) deleteDialogRef.current.close();
    setOpenOverviewDates([]);
    setOverview(true);
  }

  function toggleOverviewDate(date: string) {
    setOpenOverviewDates((current) =>
      current.includes(date) ? current.filter((item) => item !== date) : [...current, date],
    );
  }

  function closeOverview() {
    const dialog = overviewDialogRef.current;
    if (dialog?.open) {
      dialog.close();
      return;
    }
    setOverview(false);
  }

  function closeHistory() {
    const dialog = historyDialogRef.current;
    if (dialog?.open) {
      dialog.close();
      return;
    }
    setHistoryHolding(null);
  }

  function openDelete(holding: HoldingInput) {
    if (!holding.id) return;
    if (dialogRef.current?.open) dialogRef.current.close();
    if (addDialogRef.current?.open) addDialogRef.current.close();
    if (historyDialogRef.current?.open) historyDialogRef.current.close();
    if (overviewDialogRef.current?.open) overviewDialogRef.current.close();
    setPendingDelete(holding);
  }

  function closeDelete() {
    const dialog = deleteDialogRef.current;
    if (dialog?.open) {
      dialog.close();
      return;
    }
    setPendingDelete(null);
  }

  function confirmDelete() {
    const holding = pendingDelete;
    if (!holding?.id) return;
    const id = holding.id;
    const dialog = deleteDialogRef.current;
    if (dialog?.open) dialog.close();
    setPendingDelete(null);
    setRemovedIds((current) => (current.includes(id) ? current : [...current, id]));
    void deleteHolding(id).then((result) => {
      if (!result.ok) {
        setRemovedIds((current) => current.filter((item) => item !== id));
        setMessage(result.message);
        return;
      }
      router.refresh();
    });
  }

  const historyRows = historyHolding
    ? quantityEvents
        .filter((event) => event.ticker === normalizeTicker(historyHolding.ticker))
        .sort((left, right) => right.date.localeCompare(left.date))
    : [];
  const overviewDays = useMemo(() => overviewByDate(quantityEvents), [quantityEvents]);

  function renderRow(holding: HoldingInput, value: number | null) {
    const fund = holding.sleeve != null && isFundSleeve(holding.sleeve);
    const detail = fund ? "펀드" : [quantityLabel(holding), priceLabel(holding)].filter(Boolean).join(" · ");
    const gain = holdingGain(holding, fx);
    const gainTone = gain ? toneClass(gain.rate) : "";
    return (
      <li key={holding.id ?? holding.ticker} className="border-b border-[#f2f4f6] py-3.5 last:border-b-0">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="truncate text-[16px] font-bold text-[#191f28]">{holdingTitle(holding)}</p>
            <p className="mt-0.5 text-[13px] leading-5 text-[#8b95a1]">{detail}</p>
          </div>
          <div className="shrink-0 text-right">
            <p className="text-[16px] font-bold tabular-nums text-[#191f28]">{value == null ? "시세 없음" : won(value)}</p>
            {gain ? (
              <p className={`mt-0.5 text-[12px] font-semibold tabular-nums ${gainTone}`}>
                {signedWon(gain.gainKrw)} {formatReturn(gain.rate)}
              </p>
            ) : holding.currency === "USD" && holding.price != null ? (
              <p className="mt-0.5 text-[12px] tabular-nums text-[#8b95a1]">{formatUsd(holding.quantity * holding.price)}</p>
            ) : null}
            {gain && holding.currency === "USD" && holding.price != null ? (
              <p className="mt-0.5 text-[12px] tabular-nums text-[#8b95a1]">{formatUsd(holding.quantity * holding.price)}</p>
            ) : null}
          </div>
        </div>
        <div className="mt-2 flex items-center gap-4">
          {fund ? null : (
            <button
              type="button"
              aria-label={`${holdingTitle(holding)} 수량 변화 기록`}
              title="수량 변화 기록"
              className="flex h-7 w-7 items-center justify-center rounded-full bg-[#f2f4f6] text-[#4e5968]"
              onClick={() => openHistory(holding)}
            >
              <ClockIcon />
            </button>
          )}
          <button type="button" className="text-[13px] font-semibold text-[#3182f6]" onClick={() => openEdit(holding)}>
            수정
          </button>
          {holding.id ? (
            <button type="button" className="text-[13px] font-semibold text-[#f04452]" onClick={() => openDelete(holding)}>
              삭제
            </button>
          ) : null}
        </div>
      </li>
    );
  }

  const addingCash = faceCashDraft(draft);
  const keepingTicker = isCashSleeve(draft.sleeve) && !addingCash;

  function submitAdd(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const cash = faceCashDraft(draft);
    const payload = holdingPayload(draft, "add");
    const existingCash = cash
      ? holdings.find((holding) => normalizeTicker(holding.ticker) === normalizeTicker(payload.ticker))
      : undefined;
    const fund = isFundSleeve(draft.sleeve);
    if (!cash && tickerTaken(draft.ticker)) {
      setAddError(fund ? "이미 있는 펀드입니다. 목록의 수정으로 바꿔 주세요." : "이미 있는 종목입니다. 목록의 수정으로 바꿔 주세요.");
      return;
    }
    if (fund) {
      const value = amountNumber(draft.quantity);
      const gainText = draft.avgPrice.replace(/,/g, "").trim();
      const gain = gainText === "" ? 0 : Number(gainText);
      if (!(value > 0)) {
        setAddError("평가금액을 숫자로 입력해 주세요.");
        return;
      }
      if (!Number.isFinite(gain) || !(value - gain > 0)) {
        setAddError("손익은 평가금액보다 작아야 합니다.");
        return;
      }
    }
    if (!fund && !(payload.quantity > 0)) {
      setAddError(cash ? "금액을 숫자로 입력해 주세요." : "수량을 숫자로 입력해 주세요.");
      return;
    }
    if (!cash && !fund && !(payload.avgPrice && payload.avgPrice > 0)) {
      setAddError("평균단가를 입력해 주세요.");
      return;
    }
    startTransition(async () => {
      const result = await saveHolding(holdingPayload(draft, "add", existingCash?.quantity ?? 0));
      if (result.ok) {
        setDraft(EMPTY);
        setAdding(false);
        setMessage(null);
        router.refresh();
      } else {
        setAddNotice(result.message);
      }
    });
  }

  return (
    <div className="flex flex-col gap-3">
      <section className="rounded-[22px] bg-white px-5 py-5">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h2 className="text-[17px] font-bold text-[#191f28]">보유 종목</h2>
            {quoteFetched ? <p className="mt-0.5 text-[12px] leading-4 text-[#8b95a1]">시세 {quoteFetched}</p> : null}
          </div>
          <div className="flex shrink-0 items-center gap-1.5">
            <button
              type="button"
              aria-label="전체 자산 변화 기록"
              title="전체 자산 변화"
              onClick={openOverview}
              className="flex h-8 w-8 items-center justify-center rounded-xl bg-[#f2f4f6] text-[#4e5968]"
            >
              <ClockIcon />
            </button>
            <button
              type="button"
              onClick={openAdd}
              className="h-8 rounded-xl bg-[#3182f6] px-3 text-[13px] font-bold text-white"
            >
              추가
            </button>
          </div>
        </div>
        {/* {holdings.some(
          (holding) =>
            holding.priceSource !== "manual" && holding.sleeve !== "KRW_CASH" && holding.sleeve !== "USD_CASH",
        ) ? (
          <p className="mt-1 text-[13px] text-[#8b95a1]">오늘 시세는 30분전 데이터 입니다.</p>
        ) : null} */}
        {message ? <p className="mt-2 text-[13px] font-medium text-[#4e5968]">{message}</p> : null}
        {rows.length === 0 ? (
          <p className="mt-3 text-[14px] leading-5 text-[#8b95a1]">보유 종목이 없습니다. 추가를 눌러 종목이나 현금을 입력해 주세요.</p>
        ) : null}
        {grouped.map((group) => (
          <div key={group.label}>
            <p className="pt-4 text-[13px] font-semibold text-[#8b95a1]">{group.label}</p>
            <ul>{group.rows.map(({ holding, value }) => renderRow(holding, value))}</ul>
          </div>
        ))}
        {ungrouped.length > 0 ? (
          <div>
            <p className="pt-4 text-[13px] font-semibold text-[#8b95a1]">기타</p>
            <ul>{ungrouped.map(({ holding, value }) => renderRow(holding, value))}</ul>
          </div>
        ) : null}
        {rows.some((row) => row.holding.sleeve === "KRW_CASH" || row.holding.sleeve === "USD_CASH") ? (
          <p className="mt-3 text-[13px] leading-5 text-[#8b95a1]">원화와 달러 현금은 다음 국면의 매수 실탄으로 따로 둡니다.</p>
        ) : null}
      </section>

      <dialog
        ref={deleteDialogRef}
        aria-labelledby="delete-holding-title"
        className="fixed inset-auto top-1/2 left-1/2 m-0 w-[min(100%-2rem,24rem)] -translate-x-1/2 -translate-y-1/2 rounded-[22px] border-0 bg-white p-5 text-[#191f28] shadow-[0_16px_48px_rgba(25,31,40,0.18)] backdrop:bg-[#191f28]/40"
        onClick={(event) => {
          if (event.target === event.currentTarget) closeDelete();
        }}
        onClose={() => setPendingDelete(null)}
      >
        <h2 id="delete-holding-title" className="text-[17px] font-bold text-[#191f28]">
          삭제할까요?
        </h2>
        {pendingDelete ? (
          <p className="mt-2 text-[16px] font-bold text-[#191f28]">
            {holdingTitle(pendingDelete)}
            <span className="ml-1.5 font-semibold text-[#8b95a1]">{quantityLabel(pendingDelete)}</span>
          </p>
        ) : null}
        <p className="mt-2 text-[14px] leading-6 text-[#4e5968]">
          보유 종목에서 삭제합니다. 삭제한 뒤에는 되돌릴 수 없습니다.
        </p>
        <div className="mt-5 grid grid-cols-2 gap-2">
          <button
            type="button"
            className="h-12 rounded-2xl bg-[#f2f4f6] text-[15px] font-bold text-[#4e5968]"
            onClick={closeDelete}
          >
            취소
          </button>
          <button
            type="button"
            className="h-12 rounded-2xl bg-[#f04452] text-[15px] font-bold text-white"
            onClick={confirmDelete}
          >
            삭제
          </button>
        </div>
      </dialog>

      <dialog
        ref={overviewDialogRef}
        aria-labelledby="holding-overview-title"
        className="fixed inset-auto top-1/2 left-1/2 m-0 max-h-[88dvh] w-[min(100%-2rem,32rem)] -translate-x-1/2 -translate-y-1/2 overflow-y-auto rounded-[22px] border-0 bg-white p-5 text-[#191f28] shadow-[0_16px_48px_rgba(25,31,40,0.18)] backdrop:bg-[#191f28]/40"
        onClick={(event) => {
          if (event.target === event.currentTarget) closeOverview();
        }}
        onClose={() => {
          setOverview(false);
          setOpenOverviewDates([]);
        }}
      >
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h2 id="holding-overview-title" className="text-[17px] font-bold text-[#191f28]">
              전체 자산 변화
            </h2>
            <p className="mt-1 text-[13px] leading-5 text-[#8b95a1]">
              날짜를 누르면 그날 추가하고, 늘리고, 줄인 종목이 펼쳐집니다.
            </p>
          </div>
          <button type="button" className="shrink-0 text-[14px] font-semibold text-[#4e5968]" onClick={closeOverview}>
            닫기
          </button>
        </div>
        {overviewDays.length === 0 ? (
          <p className="mt-4 text-[14px] leading-6 text-[#8b95a1]">
            아직 수량 기록이 없습니다. 보유 수량이 바뀐 날부터 여기에 쌓입니다.
          </p>
        ) : (
          <div className="mt-2">
            {overviewDays.map((day) => {
              const open = openOverviewDates.includes(day.date);
              return (
                <section key={day.date} className="border-b border-[#f2f4f6] last:border-b-0">
                  <button
                    type="button"
                    aria-expanded={open}
                    onClick={() => toggleOverviewDate(day.date)}
                    className="flex w-full items-center justify-between gap-3 py-3 text-left"
                  >
                    <span className="text-[14px] font-bold text-[#191f28]">{dateLabel(day.date)}</span>
                    <span className="flex shrink-0 items-center gap-1 text-[13px] font-semibold text-[#8b95a1]">
                      {day.events.length}건
                      <ChevronIcon open={open} />
                    </span>
                  </button>
                  {open ? (
                    <ul className="pb-1">
                      {day.events.map((event) => (
                        <li
                          key={`${day.date}-${event.ticker}-${event.kind}`}
                          className="border-t border-[#f2f4f6] py-2.5"
                        >
                          <div className="flex items-start justify-between gap-3">
                            <p className="min-w-0 truncate text-[14px] font-semibold text-[#191f28]">
                              {eventName(holdings, event.ticker)}
                            </p>
                            <p className={`shrink-0 text-[13px] font-bold ${eventTone(event.kind)}`}>
                              {QUANTITY_EVENT_LABEL[event.kind]}
                              {event.kind === "start"
                                ? ""
                                : ` ${eventSignedAmount(holdings, event.ticker, event.after - event.before)}`}
                            </p>
                          </div>
                          <p className="mt-0.5 text-[12px] tabular-nums text-[#8b95a1]">
                            {event.kind === "start"
                              ? eventAmount(holdings, event.ticker, event.after)
                              : `${eventAmount(holdings, event.ticker, event.before)} → ${eventAmount(holdings, event.ticker, event.after)}`}
                          </p>
                        </li>
                      ))}
                    </ul>
                  ) : null}
                </section>
              );
            })}
          </div>
        )}
        <p className="mt-3 text-[12px] leading-5 text-[#8b95a1]">
          수량을 남긴 날만 비교합니다. 같은 날 여러 번 바꾼 경우는 그날의 마지막 수량으로 보입니다.
        </p>
      </dialog>

      <dialog
        ref={historyDialogRef}
        aria-labelledby="holding-history-title"
        className="fixed inset-auto top-1/2 left-1/2 m-0 max-h-[88dvh] w-[min(100%-2rem,32rem)] -translate-x-1/2 -translate-y-1/2 overflow-y-auto rounded-[22px] border-0 bg-white p-5 text-[#191f28] shadow-[0_16px_48px_rgba(25,31,40,0.18)] backdrop:bg-[#191f28]/40"
        onClick={(event) => {
          if (event.target === event.currentTarget) closeHistory();
        }}
        onClose={() => setHistoryHolding(null)}
      >
        {historyHolding ? (
          <>
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <h2 id="holding-history-title" className="truncate text-[17px] font-bold text-[#191f28]">
                  {holdingTitle(historyHolding)}
                </h2>
                <p className="mt-1 text-[13px] leading-5 text-[#8b95a1]">
                  날짜별로 수량을 추가하거나 늘리거나 줄인 기록입니다.
                </p>
              </div>
              <button type="button" className="shrink-0 text-[14px] font-semibold text-[#4e5968]" onClick={closeHistory}>
                닫기
              </button>
            </div>
            {historyRows.length === 0 ? (
              <p className="mt-4 text-[14px] leading-6 text-[#8b95a1]">
                아직 이 종목의 수량 기록이 없습니다. 보유 수량이 바뀐 날부터 여기에 쌓입니다.
              </p>
            ) : (
              <ul className="mt-3">
                {historyRows.map((event) => (
                  <li
                    key={`${event.date}-${event.kind}`}
                    className="border-b border-[#f2f4f6] py-3 last:border-b-0"
                  >
                    <div className="flex items-center justify-between gap-3">
                      <p className="text-[14px] font-semibold text-[#4e5968]">{dateLabel(event.date)}</p>
                      <p className={`text-[14px] font-bold ${eventTone(event.kind)}`}>
                        {QUANTITY_EVENT_LABEL[event.kind]}
                        {event.kind === "start" ? "" : ` ${signedAmount(historyHolding, event.after - event.before)}`}
                      </p>
                    </div>
                    <p className="mt-1 text-[13px] tabular-nums text-[#8b95a1]">
                      {event.kind === "start"
                        ? amountText(historyHolding, event.after)
                        : `${amountText(historyHolding, event.before)} → ${amountText(historyHolding, event.after)}`}
                    </p>
                  </li>
                ))}
              </ul>
            )}
            <p className="mt-3 text-[12px] leading-5 text-[#8b95a1]">
              수량을 남긴 날만 비교합니다. 같은 날 여러 번 바꾼 경우는 그날의 마지막 수량으로 보입니다.
            </p>
          </>
        ) : null}
      </dialog>

      <dialog
        ref={addDialogRef}
        aria-labelledby="add-holding-title"
        className="fixed inset-auto top-1/2 left-1/2 m-0 max-h-[88dvh] w-[min(100%-2rem,32rem)] -translate-x-1/2 -translate-y-1/2 overflow-y-auto rounded-[22px] border-0 bg-white p-5 text-[#191f28] shadow-[0_16px_48px_rgba(25,31,40,0.18)] backdrop:bg-[#191f28]/40"
        onClick={(event) => {
          if (event.target === event.currentTarget) closeAdd();
        }}
        onClose={() => {
          setAdding(false);
          setAddError(null);
        }}
      >
        <form className="grid gap-4" onSubmit={submitAdd}>
          <div>
            <h2 id="add-holding-title" className="text-[17px] font-bold text-[#191f28]">
              종목 추가
            </h2>
            <p id="ticker-guide" className="mt-1 text-[13px] leading-5 text-[#6b7684]">
              {addingCash
                ? "현금은 금액만 입력하면 됩니다."
                : isFundSleeve(draft.sleeve)
                  ? "펀드명을 적고 평가금액과 손익을 입력하세요. 수량은 받지 않습니다."
                : keepingTicker
                  ? "고른 종목은 그대로 두고 현금으로 셉니다. 수량과 평균단가를 입력하세요."
                  : guide
                  ? "파란 칸에 종목명이나 티커를 입력하면 목록이 나옵니다. 고른 뒤 수량과 평균단가를 적고 추가를 누르세요."
                  : "종목명을 입력하면 목록이 나옵니다. 고른 뒤 수량과 평균단가를 입력하세요."}
            </p>
          </div>
          <HoldingFields
            draft={draft}
            mode="add"
            guide={guide && !addingCash}
            tickerRef={tickerRef}
            onChange={(next) => {
              setAddError(null);
              setDraft(next);
            }}
          />
          {addError ? <p className="text-[14px] font-medium text-[#f04452]">{addError}</p> : null}
          {message && adding ? <p className="text-[14px] font-medium text-[#4e5968]">{message}</p> : null}
          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              disabled={pending}
              className="h-12 rounded-2xl bg-[#f2f4f6] text-[16px] font-bold text-[#4e5968] disabled:opacity-50"
              onClick={closeAdd}
            >
              취소
            </button>
            <button
              type="submit"
              disabled={pending}
              className="h-12 rounded-2xl bg-[#3182f6] text-[16px] font-bold text-white disabled:opacity-50"
            >
              추가
            </button>
          </div>
        </form>
      </dialog>

      <dialog
        ref={addNoticeRef}
        aria-labelledby="add-notice-title"
        className="fixed inset-auto top-1/2 left-1/2 m-0 w-[min(100%-2rem,24rem)] -translate-x-1/2 -translate-y-1/2 rounded-[22px] border-0 bg-white p-5 text-[#191f28] shadow-[0_16px_48px_rgba(25,31,40,0.18)] backdrop:bg-[#191f28]/40"
        onClick={(event) => {
          if (event.target === event.currentTarget) closeAddNotice();
        }}
        onClose={() => setAddNotice(null)}
      >
        <h2 id="add-notice-title" className="text-[17px] font-bold text-[#191f28]">
          추가할 수 없습니다
        </h2>
        <p className="mt-2 text-[15px] leading-6 text-[#4e5968]">{addNotice}</p>
        <button
          type="button"
          className="mt-5 h-12 w-full rounded-2xl bg-[#3182f6] text-[16px] font-bold text-white"
          onClick={closeAddNotice}
        >
          확인
        </button>
      </dialog>

      <dialog
        ref={dialogRef}
        aria-labelledby="edit-holding-title"
        className="mx-auto mt-auto mb-0 w-full max-w-lg max-h-[88dvh] overflow-y-auto rounded-t-[22px] border-0 bg-white p-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] text-[#191f28] shadow-[0_-12px_40px_rgba(25,31,40,0.12)] backdrop:bg-[#191f28]/40"
        onClick={(event) => {
          if (event.target === event.currentTarget) closeEdit();
        }}
        onClose={() => {
          setEditing(null);
          setEditError(null);
        }}
      >
        {editing ? (
          <form
            className="grid gap-4"
            onSubmit={(event) => {
              event.preventDefault();
              const current = editing;
              if (tickerTaken(current.draft.ticker, { id: current.id, ticker: current.originalTicker })) {
                setEditError(isFundSleeve(current.draft.sleeve) ? "이미 있는 펀드입니다." : "이미 있는 티커입니다.");
                return;
              }
              if (isFundSleeve(current.draft.sleeve)) {
                const value = amountNumber(current.draft.quantity);
                const gainText = current.draft.avgPrice.replace(/,/g, "").trim();
                const gain = gainText === "" ? 0 : Number(gainText);
                if (!(value > 0)) {
                  setEditError("평가금액을 숫자로 입력해 주세요.");
                  return;
                }
                if (!Number.isFinite(gain) || !(value - gain > 0)) {
                  setEditError("손익은 평가금액보다 작아야 합니다.");
                  return;
                }
              }
              startTransition(async () => {
                const result = await saveHolding(holdingPayload(current.draft, "edit"));
                if (!result.ok) {
                  setEditError(result.message);
                  return;
                }
                const renamed = normalizeTicker(current.originalTicker) !== normalizeTicker(current.draft.ticker);
                if (renamed && current.id) {
                  const removed = await deleteHolding(current.id);
                  if (!removed.ok) {
                    setEditError(removed.message);
                    return;
                  }
                }
                closeEdit();
                setMessage("종목을 수정했습니다.");
                router.refresh();
              });
            }}
          >
            <div className="mx-auto h-1 w-10 rounded-full bg-[#e5e8eb]" />
            <div>
              <h2 id="edit-holding-title" className="text-[17px] font-bold text-[#191f28]">
                종목 수정
              </h2>
              <p className="mt-1 text-[13px] text-[#8b95a1]">
                {editing.name && normalizeTicker(editing.name) !== normalizeTicker(editing.originalTicker)
                  ? `${editing.name}-${editing.originalTicker}`
                  : editing.originalTicker}
              </p>
            </div>
            <HoldingFields
              draft={editing.draft}
              mode="edit"
              onChange={(next) => setEditing((current) => (current ? { ...current, draft: next } : current))}
            />
            {editError ? <p className="text-[14px] font-medium text-[#f04452]">{editError}</p> : null}
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                disabled={pending}
                className="h-12 rounded-2xl bg-[#f2f4f6] text-[16px] font-bold text-[#4e5968] disabled:opacity-50"
                onClick={closeEdit}
              >
                취소
              </button>
              <button
                type="submit"
                disabled={pending}
                className="h-12 rounded-2xl bg-[#3182f6] text-[16px] font-bold text-white disabled:opacity-50"
              >
                저장
              </button>
            </div>
          </form>
        ) : null}
      </dialog>
    </div>
  );
}
