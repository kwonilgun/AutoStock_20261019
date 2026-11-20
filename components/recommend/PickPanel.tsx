"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { formatPp, formatWon } from "@/lib/format";
import type { PickBuy, PickSnapshot } from "@/lib/engine/pick-context";
import type { PickItem } from "@/lib/engine/pick-parse";
import { pickLogText } from "@/lib/pick-log";
import { requestPick } from "@/lib/server/pick-actions";
import type { SavedPick } from "@/lib/server/pick-cache";
import { logPick } from "@/lib/server/pick-log";

function reportPick(entry: Record<string, unknown>): void {
  const text = pickLogText(entry);
  console.info(text);
  void logPick(entry).catch(() => undefined);
}

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

export function PickPanel({ initial }: { initial: SavedPick | null }) {
  const [pending, setPending] = useState(!initial);
  const [error, setError] = useState<string | null>(null);
  const [snapshot, setSnapshot] = useState<PickSnapshot | null>(initial?.snapshot ?? null);
  const [items, setItems] = useState<PickItem[]>(initial?.items ?? []);
  const [cachedAt, setCachedAt] = useState<string | null>(initial?.cachedAt ?? null);
  const [empty, setEmpty] = useState(false);
  const requestId = useRef(0);

  const load = useCallback(async (refresh: boolean) => {
    const id = requestId.current + 1;
    requestId.current = id;
    setError(null);
    setPending(true);
    const result = await requestPick(refresh);
    if (requestId.current !== id) {
      reportPick({ step: "panel", refresh, ok: false, kind: "cancelled" });
      return;
    }
    reportPick({
      step: "panel",
      refresh,
      ok: result.ok,
      kind: result.ok ? result.kind : "error",
      message: result.ok ? "" : result.message,
      items: result.ok && result.kind === "picks" ? result.items.length : 0,
    });
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
    }
    setPending(false);
  }, []);

  useEffect(() => {
    if (initial) {
      reportPick({
        step: "panel",
        ok: true,
        kind: "initial",
        model: initial.engine,
        buys: initial.snapshot.buys.length,
        items: initial.items.length,
      });
      return;
    }
    void load(false);
    return () => {
      requestId.current += 1;
    };
  }, [initial, load]);

  const buys = snapshot?.buys ?? [];
  const saved = savedLabel(cachedAt);

  return (
    <div className="mx-auto flex w-full max-w-lg flex-col gap-3">
      <section className="rounded-[22px] bg-white px-5 pt-6 pb-5">
        <div className="flex items-center justify-between gap-3">
          <p className="text-[15px] font-medium text-[#4e5968]">추천종목</p>
          <button
            type="button"
            onClick={() => void load(true)}
            disabled={pending}
            className="rounded-full bg-[#3182f6] px-3 py-1.5 text-[13px] font-semibold text-white disabled:opacity-60"
          >
            {pending ? "받는 중" : "다시 받기"}
          </button>
        </div>
        <p className="mt-2 text-[14px] leading-5 text-[#6b7684]">
          차이가 2%포인트를 넘어 부족한 자산군만 고릅니다. 관리자가 지정한 모델의 저장본이 있으면 다시 부르지 않습니다.
          다시 받기를 누르면 지금 괴리로 새로 받습니다. 주문은 넣지 않습니다.
        </p>
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

      <p className="px-1 text-[12px] leading-5 text-[#8b95a1]">추천은 투자 판단을 돕기 위한 참고 자료이며 수익을 보장하지 않습니다.</p>
    </div>
  );
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
