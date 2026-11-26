"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { PickPrefsForm } from "@/components/recommend/PickPrefsForm";
import { formatPp, formatWon } from "@/lib/format";
import type { PickBuy, PickSnapshot } from "@/lib/engine/pick-context";
import type { PickItem } from "@/lib/engine/pick-parse";
import { pickPrefsKey, pickPrefsSummary, type PickPrefs } from "@/lib/engine/pick-prefs";
import {
  formatScheduleWeek,
  PICK_PLAN_WEEKS,
  type PickPlanWeeks,
  type PickScheduleLine,
  type PickScheduleWeek,
} from "@/lib/engine/pick-schedule";
import { PICK_LIMIT_MESSAGE, type PickQuota } from "@/lib/pick-engine";
import { requestPick, requestPickPlan, requestPickReason } from "@/lib/server/pick-actions";
import { savePickPlanWeeks } from "@/lib/server/pick-prefs-actions";
import type { SavedPick } from "@/lib/server/pick-cache";

function savedLabel(cachedAt: string | null): string | null {
  if (!cachedAt) return null;
  const date = new Date(cachedAt);
  if (Number.isNaN(date.getTime())) return null;
  const text = new Intl.DateTimeFormat("ko-KR", {
    timeZone: "Asia/Seoul",
    month: "numeric",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(date);
  return `저장된 추천 · ${text}`;
}

export function PickPanel({
  initial,
  quota,
  prefs: initialPrefs,
  planWeeks,
}: {
  initial: SavedPick | null;
  quota: PickQuota;
  prefs: PickPrefs | null;
  planWeeks: PickPlanWeeks;
}) {
  const [prefs, setPrefs] = useState(initialPrefs);
  const blockedAtStart = !initial && quota.used >= quota.limit;
  const [pending, setPending] = useState(prefs != null && !initial && !blockedAtStart);
  const [error, setError] = useState<string | null>(blockedAtStart ? PICK_LIMIT_MESSAGE : null);
  const [used, setUsed] = useState(quota.used);
  const [limit, setLimit] = useState(quota.limit);
  const [snapshot, setSnapshot] = useState<PickSnapshot | null>(initial?.snapshot ?? null);
  const [items, setItems] = useState<PickItem[]>(initial?.items ?? []);
  const [cachedAt, setCachedAt] = useState<string | null>(initial?.cachedAt ?? null);
  const [empty, setEmpty] = useState(false);
  const [reason, setReason] = useState<string | null>(initial?.reason ?? null);
  const [reasonError, setReasonError] = useState<string | null>(null);
  const [reasonPending, setReasonPending] = useState(false);
  const [span, setSpan] = useState<PickPlanWeeks>(planWeeks);
  const spanRequest = useRef(0);
  const [weeks, setWeeks] = useState<PickScheduleWeek[] | null>(null);
  const [planError, setPlanError] = useState<string | null>(null);
  const [planPending, setPlanPending] = useState(false);
  const requestId = useRef(0);
  const reasonId = useRef(0);
  const planId = useRef(0);
  const planAsked = useRef<string | null>(null);

  const load = useCallback(async (refresh: boolean) => {
    const id = requestId.current + 1;
    requestId.current = id;
    reasonId.current += 1;
    planId.current += 1;
    planAsked.current = null;
    setError(null);
    setReason(null);
    setReasonError(null);
    setReasonPending(false);
    setWeeks(null);
    setPlanError(null);
    setPlanPending(false);
    setPending(true);
    const result = await requestPick(refresh);
    if (result.quota) {
      setUsed(result.quota.used);
      setLimit(result.quota.limit);
    }
    if (requestId.current !== id) return;
    if (!result.ok) setError(result.message);
    else if (result.kind === "empty") {
      setEmpty(true);
      setSnapshot(null);
      setItems([]);
      setCachedAt(null);
    } else {
      setEmpty(false);
      setSnapshot(result.snapshot);
      setItems(result.items);
      setCachedAt(result.cachedAt);
      setReason(result.reason);
    }
    setPending(false);
  }, []);

  const explain = useCallback(async () => {
    const id = reasonId.current + 1;
    reasonId.current = id;
    setReasonError(null);
    setReasonPending(true);
    const result = await requestPickReason();
    if (reasonId.current !== id) return;
    if (!result.ok) setReasonError(result.message);
    else setReason(result.text);
    setReasonPending(false);
  }, []);

  const askPlan = useCallback(async (next: PickPlanWeeks) => {
    const id = planId.current + 1;
    planId.current = id;
    setPlanError(null);
    setPlanPending(true);
    const result = await requestPickPlan(next);
    if (planId.current !== id) return;
    if (!result.ok) setPlanError(result.message);
    else {
      setSpan(result.span);
      setWeeks(result.weeks);
    }
    setPlanPending(false);
  }, []);

  useEffect(() => {
    setUsed(quota.used);
    setLimit(quota.limit);
  }, [quota.used, quota.limit]);

  useEffect(() => {
    if (!prefs) return;
    if (initial) return;
    if (quota.used >= quota.limit) return;
    void load(false);
    return () => {
      requestId.current += 1;
    };
  }, [prefs, initial, load, quota.used, quota.limit]);

  const listKey = itemKey(items);
  useEffect(() => {
    if (pending || items.length === 0) return;
    const key = `${listKey}:${span}`;
    if (planAsked.current === key) return;
    planAsked.current = key;
    void askPlan(span);
  }, [pending, items.length, listKey, span, askPlan]);

  const buys = snapshot?.buys ?? [];
  const saved = savedLabel(cachedAt);
  const left = Math.max(0, limit - used);
  const exhausted = used >= limit;
  const prefsDiffer = prefs != null && items.length > 0 && pickPrefsKey(snapshot?.prefs) !== pickPrefsKey(prefs);

  return (
    <div className="mx-auto flex w-full max-w-lg flex-col gap-3">
      {!prefs ? (
        <PickPrefsForm
          initial={null}
          planWeeks={span}
          intent={initial ? "edit" : "start"}
          onSaved={(next, savedWeeks) => {
            setPrefs(next);
            setSpan(savedWeeks);
            if (!initial && quota.used < quota.limit) setPending(true);
          }}
        />
      ) : null}

      {prefs || initial ? (
      <>
      <section className="rounded-[22px] bg-white px-5 pt-6 pb-5">
        <div className="flex items-center justify-between gap-3">
          <p className="text-[15px] font-medium text-[#4e5968]">추천종목</p>
          <button
            type="button"
            onClick={() => void load(true)}
            disabled={pending || exhausted || !prefs}
            className="rounded-full bg-[#3182f6] px-3 py-1.5 text-[13px] font-semibold text-white disabled:opacity-60"
          >
            {pending ? "받는 중" : exhausted ? "횟수 소진" : "다시 받기"}
          </button>
        </div>
        <p className="mt-2 text-[14px] leading-5 text-[#6b7684]">
          차이가 2%포인트를 넘어 부족한 자산군만 고릅니다. 살 금액은 우선이 반영된 내 목표에서 나오고, 종목 추천이 그 금액을 바꾸지 않습니다. 설정에서 고른 모델의 저장본이 있으면 다시 부르지 않습니다.
          다시 받기를 누르면 지금 괴리로 새로 받고, 저장된 추천 이유는 지웁니다. 향후 계획은 고른 주 수에 맞춰 그 종목으로 다시 나눕니다.
          주문은 넣지 않습니다. 종목을 새로 받을 때마다 횟수가 1 줄어듭니다.
        </p>
        <p className="mt-2 text-[12px] font-medium text-[#8b95a1]">
          남은 횟수 {left}회 · 제한 {limit}회
        </p>
        {prefs ? (
          <p className="mt-2 text-[13px] font-medium leading-5 text-[#4e5968]">
            {pickPrefsSummary(prefs)}
            {" · "}
            <Link href="/settings#pick-prefs" className="font-semibold text-[#3182f6]">
              기준 바꾸기
            </Link>
          </p>
        ) : null}
        {prefsDiffer ? (
          <p className="mt-2 text-[13px] font-medium leading-5 text-[#3182f6]">
            추천 기준이 바뀌었습니다. 다시 받기를 누르면 새 기준으로 받습니다.
          </p>
        ) : null}
        {snapshot ? <p className="mt-2 text-[12px] font-medium text-[#8b95a1]">{snapshot.phase.id} {snapshot.phase.name} 국면</p> : null}
        {saved ? <p className="mt-1 text-[12px] font-medium text-[#8b95a1]">{saved}</p> : null}
        {error ? <p className="mt-2 text-[13px] font-medium text-[#f04452]">{error}</p> : null}
      </section>

      {pending ? (
        <section className="flex flex-col items-center gap-3 rounded-[22px] bg-white px-5 py-16" aria-busy="true" aria-live="polite">
          <span className="h-8 w-8 animate-spin rounded-full border-2 border-[#d1d6db] border-t-[#3182f6]" />
          <p className="text-[14px] text-[#6b7684]">부족한 자산의 종목을 받고 있습니다.</p>
        </section>
      ) : null}

      {!pending && empty ? (
        <section className="rounded-[22px] bg-white px-5 py-8">
          <p className="text-[15px] font-medium text-[#4e5968]">
            지금 살 자산군이 없습니다. 목표보다 2%포인트 넘게 부족한 자산만 종목을 받습니다.
          </p>
        </section>
      ) : null}

      {!pending
        ? buys.map((buy) => (
            <BuyCard key={buy.sleeve} buy={buy} items={items.filter((item) => item.sleeve === buy.sleeve)} />
          ))
        : null}

      {!pending && items.length > 0 ? (
        <section className="rounded-[22px] bg-white px-5 py-5">
          {reason ? (
            <>
              <h2 className="text-[15px] font-bold text-[#191f28]">이렇게 추천한 이유</h2>
              <p className="mt-2 whitespace-pre-line text-[14px] leading-6 text-[#4e5968]" aria-live="polite">
                {reason}
              </p>
              <p className="mt-3 text-[13px] leading-5 text-[#8b95a1]">저장된 이유입니다. 다시 받기를 누르면 지워집니다.</p>
            </>
          ) : (
            <>
              <button
                type="button"
                onClick={() => void explain()}
                disabled={reasonPending}
                className="h-11 w-full rounded-2xl bg-[#3182f6] text-[15px] font-bold text-white disabled:opacity-60"
              >
                {reasonPending ? "이유를 받는 중" : "추천 이유"}
              </button>
              <p className="mt-3 text-[13px] leading-5 text-[#8b95a1]">
                이번 괴리와 위 종목으로 이렇게 추천한 이유를 받습니다. 받은 이유는 저장됩니다.
              </p>
              {reasonError ? <p className="mt-3 text-[13px] font-medium text-[#f04452]">{reasonError}</p> : null}
              {reasonPending ? (
                <p className="mt-4 text-[14px] text-[#6b7684]" aria-live="polite">
                  추천 이유를 묻고 있습니다.
                </p>
              ) : null}
            </>
          )}
        </section>
      ) : null}

      {!pending && items.length > 0 ? (
        <ScheduleCard
          weeks={weeks}
          span={span}
          pending={planPending}
          error={planError}
          onSpan={(next) => {
            if (next === span) return;
            const id = spanRequest.current + 1;
            spanRequest.current = id;
            setWeeks(null);
            setPlanError(null);
            setSpan(next);
            void savePickPlanWeeks(next).then((result) => {
              if (spanRequest.current !== id) return;
              if (!result.ok) setPlanError(result.message);
            });
          }}
          onRetry={() => void askPlan(span)}
        />
      ) : null}
      </>
      ) : null}

      <p className="px-1 text-[12px] leading-5 text-[#8b95a1]">추천은 투자 판단을 돕기 위한 참고 자료이며 수익을 보장하지 않습니다.</p>
    </div>
  );
}

function ScheduleCard({
  weeks,
  span,
  pending,
  error,
  onSpan,
  onRetry,
}: {
  weeks: PickScheduleWeek[] | null;
  span: PickPlanWeeks;
  pending: boolean;
  error: string | null;
  onSpan: (next: PickPlanWeeks) => void;
  onRetry: () => void;
}) {
  return (
    <section className="rounded-[22px] bg-white px-5 py-5">
      <h2 className="text-[15px] font-bold text-[#191f28]">향후 추진 계획</h2>
      <div className="mt-3 flex gap-2" role="group" aria-label="추진 기간">
        {PICK_PLAN_WEEKS.map((value) => {
          const on = span === value;
          return (
            <button
              key={value}
              type="button"
              aria-pressed={on}
              onClick={() => onSpan(value)}
              className={`rounded-full border px-3 py-1.5 text-[13px] font-semibold ${
                on ? "border-[#3182f6] bg-[#e8f3ff] text-[#1b64da]" : "border-[#e5e8eb] bg-white text-[#4e5968]"
              }`}
            >
              {value}주
            </button>
          );
        })}
      </div>
      <p className="mt-2 text-[13px] leading-5 text-[#8b95a1]">
        앞주에는 넘친 자산을 줄이고, 그다음 주에는 부족한 자산을 삽니다. 한 주에는 금액이 큰 자산을 추천 첫 종목으로 사고, 나머지 종목은 대신 살 수 있습니다. 10만 원보다 작게 나뉘면 한 주에 모으고, 1주는 나누지 않습니다. 주말은 건너뛰고 휴장일은 빼지 않습니다. 주문은 넣지 않습니다.
      </p>
      {pending && !weeks ? <p className="mt-4 text-[14px] text-[#6b7684]">일정을 나누고 있습니다.</p> : null}
      {error ? <p className="mt-3 text-[13px] font-medium text-[#f04452]">{error}</p> : null}
      {error ? (
        <button type="button" onClick={onRetry} disabled={pending} className="mt-3 h-11 w-full rounded-2xl bg-[#3182f6] text-[15px] font-bold text-white disabled:opacity-60">
          다시 계산
        </button>
      ) : null}
      {weeks ? (
        <ol className="mt-4 flex flex-col gap-4">
          {weeks.map((week) => (
            <li key={week.index}>
              <p className="text-[13px] font-bold text-[#191f28]">{formatScheduleWeek(week)}</p>
              {week.sells.length === 0 && week.buys.length === 0 ? (
                <p className="mt-1 text-[13px] text-[#8b95a1]">이번 주는 금액이 작아 다른 주로 모았습니다.</p>
              ) : (
                <ul className="mt-1">
                  {week.sells.map((line) => (
                    <ScheduleRow key={`sell-${week.index}-${line.ticker}-${line.label}`} side="sell" line={line} />
                  ))}
                  {week.buys.map((line) => (
                    <ScheduleRow key={`buy-${week.index}-${line.ticker}-${line.label}`} side="buy" line={line} />
                  ))}
                </ul>
              )}
            </li>
          ))}
        </ol>
      ) : null}
    </section>
  );
}

function ScheduleRow({ side, line }: { side: "sell" | "buy"; line: PickScheduleLine }) {
  return (
    <li className="border-b border-[#f2f4f6] py-2.5 last:border-b-0">
      <span className="flex items-baseline justify-between gap-3">
        <span className="flex min-w-0 items-baseline gap-2">
          <span className={`shrink-0 text-[12px] font-bold ${side === "sell" ? "text-[#f04452]" : "text-[#3182f6]"}`}>
            {side === "sell" ? "매도" : "매수"}
          </span>
          <span className="min-w-0 truncate text-[14px] font-bold text-[#191f28]">{line.name}</span>
          {line.ticker ? <span className="shrink-0 text-[12px] font-medium text-[#8b95a1]">{line.ticker}</span> : null}
        </span>
        <span className="shrink-0 text-[13px] font-semibold text-[#4e5968]">{formatWon(line.amountKrw)}</span>
      </span>
      {line.alternates && line.alternates.length > 0 ? (
        <p className="mt-1 text-[12px] leading-5 text-[#8b95a1]">
          대신 살 수 있는 종목 {line.alternates.map((item) => (item.ticker ? `${item.name} ${item.ticker}` : item.name)).join(", ")}
        </p>
      ) : null}
    </li>
  );
}

function itemKey(rows: PickItem[]): string {
  return rows.map((item) => `${item.sleeve}:${item.ticker}`).join("|");
}

function BuyCard({ buy, items }: { buy: PickBuy; items: PickItem[] }) {
  return (
    <section className="rounded-[22px] bg-white px-5 py-5">
      <h2 className="flex items-baseline justify-between gap-3 text-[17px] font-bold text-[#191f28]">
        {buy.label}
        <span className="text-[13px] font-medium text-[#8b95a1]">{items.length}개</span>
      </h2>
      <p className="mt-1 text-[13px] text-[#8b95a1]">
        괴리 {formatPp(buy.gapPp)} · 살 금액 {formatWon(buy.buyKrw)}
      </p>
      {buy.holdings.length > 0 ? (
        <p className="mt-1 text-[13px] text-[#8b95a1]">지금 보유 {buy.holdings.map((row) => row.ticker).join(", ")}</p>
      ) : (
        <p className="mt-1 text-[13px] text-[#8b95a1]">이 자산군에 가진 종목이 없습니다.</p>
      )}
      {items.length === 0 ? (
        <p className="mt-3 text-[14px] text-[#8b95a1]">이 자산군 추천을 읽지 못했습니다.</p>
      ) : (
        <ul className="mt-1">
          {items.map((item) => (
            <li key={`${item.sleeve}-${item.ticker}`} className="border-b border-[#f2f4f6] py-3 last:border-b-0">
              <span className="flex items-baseline gap-2">
                <span className="min-w-0 truncate text-[16px] font-bold text-[#191f28]">{item.name}</span>
                <span className="shrink-0 text-[13px] font-medium text-[#8b95a1]">{item.ticker}</span>
              </span>
              {item.note ? <span className="mt-1 block text-[13px] leading-5 text-[#4e5968]">{item.note}</span> : null}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
