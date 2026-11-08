"use client";

import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState, useTransition, type ChangeEvent, type FormEvent } from "react";
import { INCOME_KIND_LABEL, INCOME_KINDS, periodKey, type AssetPoint, type Grain, type IncomeKind } from "@/lib/engine/history";
import {
  allIncomeTotals,
  bucketDate,
  canShiftForward,
  incomeAmount,
  incomeAmountKrw,
  incomeCurrency,
  shiftPeriod,
  summarizeIncomePeriod,
  type IncomeLine,
  type IncomeTotals,
} from "@/lib/engine/income-period";
import type { Currency } from "@/lib/engine/types";
import { incomeMoney } from "@/lib/engine/value";
import { formatGroupedInput, formatNumber, formatUsd, groupedInputCaret } from "@/lib/format";
import { addReturnIncome, deleteReturnIncome, updateReturnIncome } from "@/lib/server/actions";

export type ReturnIncomeItem = IncomeLine;

const GRAINS: { id: Grain; label: string }[] = [
  { id: "day", label: "일별" },
  { id: "month", label: "월별" },
  { id: "year", label: "년도별" },
];

const KIND_COLOR: Record<IncomeKind, string> = {
  dividend: "#f04452",
  interest: "#3182f6",
  sale: "#12b76a",
};

const fieldClass =
  "h-12 w-full rounded-2xl bg-[#f2f4f6] px-4 text-[16px] font-semibold text-[#191f28] outline-none ring-[#3182f6] placeholder:font-medium placeholder:text-[#b0b8c1] focus:ring-2";
const amountFieldClass =
  "h-14 w-full rounded-2xl bg-[#eef4ff] px-4 text-[22px] font-bold tabular-nums text-[#191f28] outline-none ring-2 ring-[#3182f6] placeholder:font-semibold placeholder:text-[#c9d4e4]";
const labelClass = "text-[13px] font-medium text-[#8b95a1]";

function won(value: number): string {
  const rounded = Math.round(value);
  const sign = rounded < 0 ? "−" : "";
  return `${sign}${formatNumber(Math.abs(rounded))}원`;
}

function signedWon(value: number): string {
  const rounded = Math.round(value);
  if (rounded === 0) return "0원";
  return `${rounded > 0 ? "+" : "−"}${formatNumber(Math.abs(rounded))}원`;
}

function moneyLabel(currency: Currency, amount: number): string {
  if (currency === "USD") {
    const text = formatUsd(amount);
    return text.startsWith("-") ? `−${text.slice(1)}` : text;
  }
  return won(amount);
}

function toneClass(value: number): string {
  const rounded = Math.round(value);
  if (rounded === 0) return "text-[#8b95a1]";
  return rounded > 0 ? "text-[#f04452]" : "text-[#3182f6]";
}

function koreanDate(date: string): string {
  const [year, month, day] = date.split("-");
  if (!year || !month || !day) return date;
  return `${year}년 ${Number(month)}월 ${Number(day)}일`;
}

function periodCaption(grain: Grain, date: string, today: string): string {
  const current = periodKey(date, grain) === periodKey(today, grain);
  if (grain === "day") return current ? "오늘 받은 수익" : "이날 받은 수익";
  if (grain === "month") return current ? "이번 달 받은 수익" : "이달 받은 수익";
  return current ? "올해 받은 수익" : "이 해 받은 수익";
}

function pendingNote(date: string, points: AssetPoint[]): string | null {
  const dates = points
    .map((point) => point.date)
    .filter((value) => /^\d{4}-\d{2}-\d{2}$/.test(value))
    .sort();
  const first = dates[0];
  if (!first) return "평가 기록이 생기면 그 다음 기록부터 수익률에 들어갑니다";
  if (date < first) return null;
  if (date === first) return "첫 기록 당일이라 수익률에는 넣지 않습니다";
  if (dates.length === 1) return "비교할 이전 기록이 없어 다음 기록부터 수익률에 들어갑니다";
  return null;
}

function kindSummary(totals: IncomeTotals): string {
  return INCOME_KINDS.filter((kind) => totals[kind] !== 0)
    .map((kind) => `${INCOME_KIND_LABEL[kind]} ${won(totals[kind])}`)
    .join(" · ");
}

function Chevron({ dir }: { dir: "left" | "right" }) {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d={dir === "left" ? "M14.5 6.5 8.5 12l6 5.5" : "M9.5 6.5 15.5 12l-6 5.5"}
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function KindBar({ totals }: { totals: IncomeTotals }) {
  const positive = INCOME_KINDS.map((kind) => ({ kind, value: Math.max(0, totals[kind]) })).filter((part) => part.value > 0);
  const sum = positive.reduce((total, part) => total + part.value, 0);
  if (sum <= 0) return null;
  return (
    <div className="mt-3 flex h-2 overflow-hidden rounded-full bg-[#f2f4f6]">
      {positive.map((part) => (
        <div
          key={part.kind}
          className="h-full"
          style={{ width: `${(part.value / sum) * 100}%`, backgroundColor: KIND_COLOR[part.kind] }}
        />
      ))}
    </div>
  );
}

export function ReturnIncomeForm({
  incomes,
  points,
  today,
  usdKrw,
}: {
  incomes: ReturnIncomeItem[];
  points: AssetPoint[];
  today: string;
  usdKrw: number;
}) {
  const router = useRouter();
  const dialogRef = useRef<HTMLDialogElement>(null);
  const amountRef = useRef<HTMLInputElement>(null);
  const [grain, setGrain] = useState<Grain>("month");
  const [focusDate, setFocusDate] = useState(today);
  const [formMode, setFormMode] = useState<"add" | "edit" | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [date, setDate] = useState(today);
  const [kind, setKind] = useState<IncomeKind>("dividend");
  const [currency, setCurrency] = useState<Currency>("KRW");
  const [amount, setAmount] = useState("");
  const [note, setNote] = useState("");
  const [formMessage, setFormMessage] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const formOpen = formMode !== null;
  const lifetime = useMemo(() => allIncomeTotals(incomes, usdKrw), [incomes, usdKrw]);
  const view = useMemo(() => summarizeIncomePeriod(incomes, grain, focusDate, usdKrw), [incomes, grain, focusDate, usdKrw]);
  const typedAmount = Number(amount.replace(/,/g, "").replace(/−/g, "-").trim());
  const preview = currency === "USD" && Number.isFinite(typedAmount) ? incomeMoney(typedAmount, "USD", usdKrw) : null;
  const canNext = canShiftForward(focusDate, grain, today);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (formOpen && !dialog.open) dialog.showModal();
    if (!formOpen && dialog.open) dialog.close();
  }, [formOpen]);

  useEffect(() => {
    if (!formOpen) return;
    const frame = requestAnimationFrame(() => amountRef.current?.focus());
    return () => cancelAnimationFrame(frame);
  }, [formOpen]);

  function resetForm() {
    setDate(focusDate <= today ? focusDate : today);
    setKind("dividend");
    setCurrency("KRW");
    setAmount("");
    setNote("");
    setFormMessage(null);
    setEditingId(null);
  }

  function closeFormState() {
    setFormMode(null);
    setEditingId(null);
    setFormMessage(null);
  }

  function openAdd() {
    resetForm();
    setFormMode("add");
  }

  function openEdit(income: ReturnIncomeItem) {
    setDate(income.date);
    setKind(income.kind);
    setCurrency(incomeCurrency(income));
    setAmount(formatGroupedInput(String(incomeAmount(income))));
    setNote(income.note);
    setFormMessage(null);
    setEditingId(income.id);
    setFormMode("edit");
  }

  function changeAmount(event: ChangeEvent<HTMLInputElement>) {
    const input = event.target;
    const next = formatGroupedInput(input.value);
    const caret = groupedInputCaret(input.value, input.selectionStart ?? input.value.length, next);
    setAmount(next);
    requestAnimationFrame(() => {
      amountRef.current?.setSelectionRange(caret, caret);
    });
  }

  function closeForm() {
    const dialog = dialogRef.current;
    if (dialog?.open) {
      dialog.close();
      return;
    }
    closeFormState();
  }

  function movePeriod(delta: number) {
    if (delta > 0 && !canNext) return;
    setFocusDate(shiftPeriod(focusDate, grain, delta));
  }

  function openBucket(key: string) {
    const nextGrain = grain === "year" ? "month" : grain === "month" ? "day" : null;
    if (!nextGrain) return;
    setFocusDate(bucketDate(key, nextGrain, today));
    setGrain(nextGrain);
  }

  function submitForm(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const parsedAmount = Number(amount.replace(/,/g, "").replace(/−/g, "-").trim());
    if (!Number.isFinite(parsedAmount) || parsedAmount === 0) {
      setFormMessage("0이 아닌 금액을 입력해 주세요.");
      return;
    }
    if (kind !== "sale" && parsedAmount < 0) {
      setFormMessage("배당과 이자는 0보다 큰 금액만 입력할 수 있습니다.");
      return;
    }
    if (!incomeMoney(parsedAmount, currency, usdKrw)) {
      setFormMessage(
        currency === "USD" && !(usdKrw > 0)
          ? "달러는 현재 환율이 있어야 원화로 바꿀 수 있습니다."
          : "금액을 다시 확인해 주세요.",
      );
      return;
    }
    startTransition(async () => {
      const payload = { date, kind, currency, amount: parsedAmount, note };
      const result =
        formMode === "edit" && editingId
          ? await updateReturnIncome({ id: editingId, ...payload })
          : await addReturnIncome(payload);
      if (!result.ok) {
        setFormMessage(result.message);
        return;
      }
      setFocusDate(date);
      resetForm();
      setFormMode(null);
      setMessage(formMode === "edit" ? "수정했습니다." : "기록했습니다.");
      router.refresh();
    });
  }

  return (
    <section className="rounded-[22px] bg-white px-5 py-5">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-[17px] font-bold text-[#191f28]">배당·이자·판매 수익</h2>
        <button
          type="button"
          onClick={openAdd}
          className="h-8 rounded-xl bg-[#3182f6] px-3 text-[13px] font-bold text-white"
        >
          추가
        </button>
      </div>
      <p className="mt-1 text-[13px] leading-5 text-[#8b95a1]">
        받은 날을 기준으로 일별·월별·년도별 합을 봅니다. 발생한 날짜의 수익률에 더합니다. 판매 수익은 판 금액이 아니라 번 금액이며, 손실이면 −를 붙입니다.
      </p>

      <div className="mt-4 grid grid-cols-3 rounded-2xl bg-[#f2f4f6] p-1" role="tablist" aria-label="수익 기간">
        {GRAINS.map((item) => {
          const selected = item.id === grain;
          return (
            <button
              key={item.id}
              type="button"
              role="tab"
              aria-selected={selected}
              onClick={() => setGrain(item.id)}
              className={`rounded-xl py-2.5 text-[14px] font-semibold ${
                selected ? "bg-white text-[#191f28] shadow-sm" : "text-[#8b95a1]"
              }`}
            >
              {item.label}
            </button>
          );
        })}
      </div>

      <div className="mt-4 flex items-center justify-between gap-2">
        <button
          type="button"
          aria-label="이전 기간"
          className="flex h-11 w-11 items-center justify-center rounded-full bg-[#f2f4f6] text-[#191f28]"
          onClick={() => movePeriod(-1)}
        >
          <Chevron dir="left" />
        </button>
        <p className="min-w-0 text-center text-[18px] font-bold text-[#191f28]">{view.label}</p>
        <button
          type="button"
          aria-label="다음 기간"
          disabled={!canNext}
          className="flex h-11 w-11 items-center justify-center rounded-full bg-[#f2f4f6] text-[#191f28] disabled:text-[#c9d4e4]"
          onClick={() => movePeriod(1)}
        >
          <Chevron dir="right" />
        </button>
      </div>

      <div className="mt-3 text-center">
        <p className="text-[13px] font-medium text-[#8b95a1]">{periodCaption(grain, focusDate, today)}</p>
        <p className={`mt-1 text-[32px] leading-none font-bold tracking-tight tabular-nums ${toneClass(view.totals.all)}`}>
          {signedWon(view.totals.all)}
        </p>
        {lifetime.all !== 0 ? (
          <p className="mt-1.5 text-[12px] font-medium tabular-nums text-[#8b95a1]">전체 누적 {won(lifetime.all)}</p>
        ) : null}
      </div>

      <div className="mt-4 grid grid-cols-3 gap-2">
        {INCOME_KINDS.map((item) => (
          <div key={item} className="rounded-2xl bg-[#f9fafb] px-3 py-3">
            <p className="flex items-center gap-1.5 text-[12px] font-medium text-[#6b7684]">
              <span className="inline-block h-1.5 w-1.5 rounded-full" style={{ backgroundColor: KIND_COLOR[item] }} />
              {INCOME_KIND_LABEL[item]}
            </p>
            <p className={`mt-1 truncate text-[15px] font-bold tabular-nums ${toneClass(view.totals[item])}`}>
              {won(view.totals[item])}
            </p>
          </div>
        ))}
      </div>
      <KindBar totals={view.totals} />

      {message ? <p className="mt-3 text-[13px] text-[#4e5968]">{message}</p> : null}

      {grain === "year" && view.buckets.length > 0 ? (
        <ul className="mt-4">
          {view.buckets.map((bucket) => (
            <li key={bucket.key} className="border-b border-[#f2f4f6] last:border-b-0">
              <button type="button" className="flex w-full items-start justify-between gap-3 py-3.5 text-left" onClick={() => openBucket(bucket.key)}>
                <div className="min-w-0">
                  <p className="text-[15px] font-medium text-[#333d4b]">{bucket.label}</p>
                  {kindSummary(bucket.totals) ? (
                    <p className="mt-0.5 truncate text-[12px] text-[#8b95a1]">{kindSummary(bucket.totals)}</p>
                  ) : null}
                </div>
                <p className={`shrink-0 text-[15px] font-bold tabular-nums ${toneClass(bucket.totals.all)}`}>
                  {signedWon(bucket.totals.all)}
                </p>
              </button>
            </li>
          ))}
        </ul>
      ) : null}

      {incomes.length === 0 ? (
        <p className="mt-4 text-[14px] leading-5 text-[#8b95a1]">추가를 눌러 배당·이자·판매 수익을 입력해 주세요.</p>
      ) : view.items.length === 0 ? (
        <p className="mt-4 text-[14px] leading-5 text-[#8b95a1]">이 기간에 기록된 수익이 없습니다.</p>
      ) : grain === "year" ? null : (
        <ul className="mt-2">
          {view.groups.map((group) => (
            <li key={group.date} className="border-b border-[#f2f4f6] py-3 last:border-b-0">
              {grain === "month" ? (
                <button
                  type="button"
                  className="mb-1 flex w-full items-center justify-between gap-3 text-left"
                  onClick={() => openBucket(group.date)}
                >
                  <p className="text-[13px] font-semibold text-[#8b95a1]">{koreanDate(group.date)}</p>
                  <p className={`text-[13px] font-bold tabular-nums ${toneClass(group.totals.all)}`}>{signedWon(group.totals.all)}</p>
                </button>
              ) : null}
              {group.items.map((income) => {
                const aside = pendingNote(income.date, points);
                return (
                  <div key={income.id} className="py-2.5 first:pt-1">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="text-[15px] font-medium text-[#333d4b]">
                          {INCOME_KIND_LABEL[income.kind]}
                          {income.note ? ` · ${income.note}` : ""}
                        </p>
                        {grain === "day" ? <p className="mt-0.5 text-[12px] text-[#8b95a1]">{koreanDate(income.date)}</p> : null}
                        {aside ? <p className="mt-0.5 text-[12px] text-[#8b95a1]">{aside}</p> : null}
                      </div>
                      <div className="shrink-0 text-right">
                        <p className={`text-[15px] font-bold tabular-nums ${toneClass(income.amountKrw)}`}>
                          {moneyLabel(incomeCurrency(income), incomeAmount(income))}
                        </p>
                        {incomeCurrency(income) === "USD" ? (
                          <p className="text-[12px] tabular-nums text-[#8b95a1]">{won(incomeAmountKrw(income, usdKrw))}</p>
                        ) : null}
                      </div>
                    </div>
                    <div className="mt-2 flex items-center gap-4">
                      <button
                        type="button"
                        className="text-[13px] font-semibold text-[#3182f6]"
                        disabled={pending}
                        onClick={() => openEdit(income)}
                      >
                        수정
                      </button>
                      <button
                        type="button"
                        className="text-[13px] font-semibold text-[#f04452]"
                        disabled={pending}
                        onClick={() =>
                          startTransition(async () => {
                            const result = await deleteReturnIncome(income.id);
                            if (!result.ok) {
                              setMessage(result.message);
                              return;
                            }
                            setMessage("삭제했습니다.");
                            router.refresh();
                          })
                        }
                      >
                        삭제
                      </button>
                    </div>
                  </div>
                );
              })}
            </li>
          ))}
        </ul>
      )}

      <dialog
        ref={dialogRef}
        aria-labelledby="income-form-title"
        className="fixed inset-auto top-1/2 left-1/2 m-0 max-h-[88dvh] w-[min(100%-2rem,32rem)] -translate-x-1/2 -translate-y-1/2 overflow-y-auto rounded-[22px] border-0 bg-white p-5 text-[#191f28] shadow-[0_16px_48px_rgba(25,31,40,0.18)] backdrop:bg-[#191f28]/40"
        onClick={(event) => {
          if (event.target === event.currentTarget) closeForm();
        }}
        onClose={closeFormState}
      >
        <form className="grid gap-4" onSubmit={submitForm}>
          <div>
            <h2 id="income-form-title" className="text-[17px] font-bold text-[#191f28]">
              {formMode === "edit" ? "수익 수정" : "수익 추가"}
            </h2>
            <p className="mt-1 text-[13px] leading-5 text-[#6b7684]">
              {formMode === "edit"
                ? "종류, 통화, 금액, 날짜, 종목을 바꾼 뒤 저장을 누르세요."
                : "통화와 금액, 날짜, 종목을 입력한 뒤 추가를 누르세요."}
            </p>
          </div>
          <div className="grid grid-cols-3 rounded-2xl bg-[#f2f4f6] p-1" role="radiogroup" aria-label="수익 종류">
            {INCOME_KINDS.map((item) => {
              const selected = item === kind;
              return (
                <button
                  key={item}
                  type="button"
                  role="radio"
                  aria-checked={selected}
                  onClick={() => setKind(item)}
                  className={`rounded-xl py-2.5 text-[14px] font-semibold ${
                    selected ? "bg-white text-[#191f28] shadow-sm" : "text-[#8b95a1]"
                  }`}
                >
                  {INCOME_KIND_LABEL[item]}
                </button>
              );
            })}
          </div>
          <div className="grid gap-1.5">
            <div className="flex items-center justify-between gap-3">
              <span className={labelClass}>금액</span>
              <div className="grid grid-cols-2 rounded-xl bg-[#f2f4f6] p-0.5" role="radiogroup" aria-label="통화">
                {(
                  [
                    ["KRW", "원"],
                    ["USD", "달러"],
                  ] as const
                ).map(([value, label]) => {
                  const selected = value === currency;
                  return (
                    <button
                      key={value}
                      type="button"
                      role="radio"
                      aria-checked={selected}
                      onClick={() => setCurrency(value)}
                      className={`rounded-lg px-3 py-1 text-[13px] font-semibold ${
                        selected ? "bg-white text-[#191f28] shadow-sm" : "text-[#8b95a1]"
                      }`}
                    >
                      {label}
                    </button>
                  );
                })}
              </div>
            </div>
            <label className="grid gap-1.5">
              <span className="sr-only">{currency === "USD" ? "달러 금액" : "원화 금액"}</span>
              <span className="relative block">
                <input
                  ref={amountRef}
                  value={amount}
                  onChange={changeAmount}
                  inputMode="decimal"
                  placeholder={kind === "sale" ? "손실은 −" : currency === "USD" ? "0.00" : "0"}
                  className={`${amountFieldClass} ${currency === "USD" ? "pr-16" : "pr-11"}`}
                  required
                />
                <span className="pointer-events-none absolute inset-y-0 right-4 flex items-center text-[15px] font-semibold text-[#6b7a90]">
                  {currency === "USD" ? "달러" : "원"}
                </span>
              </span>
            </label>
            {currency === "USD" ? (
              <p className="text-[12px] leading-5 text-[#8b95a1]">
                {preview
                  ? `환율 ${formatNumber(Math.round(usdKrw * 100) / 100)}원 · 수익률에는 ${won(preview.amountKrw)}`
                  : usdKrw > 0
                    ? `지금 환율 ${formatNumber(Math.round(usdKrw * 100) / 100)}원을 곱해 원화로 바꿉니다.`
                    : "현재 환율이 없어 달러를 원화로 바꿀 수 없습니다."}
              </p>
            ) : null}
          </div>
          <label className="grid gap-1.5">
            <span className={labelClass}>날짜</span>
            <input type="date" value={date} onChange={(event) => setDate(event.target.value)} className={fieldClass} required />
          </label>
          <label className="grid gap-1.5">
            <span className={labelClass}>
              종목 <span className="font-normal text-[#b0b8c1]">선택</span>
            </span>
            <input
              value={note}
              onChange={(event) => setNote(event.target.value)}
              maxLength={40}
              placeholder="예: JEPI, 삼성전자"
              className={fieldClass}
              autoComplete="off"
            />
          </label>
          {formMessage ? <p className="text-[14px] font-medium text-[#f04452]">{formMessage}</p> : null}
          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              disabled={pending}
              className="h-12 rounded-2xl bg-[#f2f4f6] text-[16px] font-bold text-[#4e5968] disabled:opacity-50"
              onClick={closeForm}
            >
              취소
            </button>
            <button type="submit" disabled={pending} className="h-12 rounded-2xl bg-[#3182f6] text-[16px] font-bold text-white disabled:opacity-50">
              {formMode === "edit" ? "저장" : "추가"}
            </button>
          </div>
        </form>
      </dialog>
    </section>
  );
}
