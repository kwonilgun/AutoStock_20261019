"use client";

import { useEffect, useState, useTransition } from "react";
import { SeoulClock } from "@/components/home/SeoulClock";
import { formatNumber } from "@/lib/format";
import { followAutoFx, setFx } from "@/lib/server/actions";

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
  if (Math.round(value) === 0) return "text-[#8b95a1]";
  return value > 0 ? "text-[#f04452]" : "text-[#3182f6]";
}

export function AssetSummary({
  totalKrw,
  holdingCount,
  priceGainKrw,
  weightWarning,
  blockedReason,
  fx,
  fxSource,
}: {
  totalKrw: number;
  holdingCount: number;
  /** 평균가 대비 주식 시세 손익 합계. 평균가가 있는 종목이 없으면 null. */
  priceGainKrw: number | null;
  weightWarning: boolean;
  blockedReason: string | null;
  fx: number;
  fxSource: "auto" | "manual";
}) {
  const [fxInput, setFxInput] = useState(String(fx));
  const [message, setMessage] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  useEffect(() => {
    setFxInput(String(fx));
  }, [fx]);

  return (
    <section className="rounded-[22px] bg-white px-5 pt-6 pb-5">
      <div className="flex items-center justify-between gap-3">
        <p className="text-[15px] font-medium text-[#4e5968]">총 자산</p>
        <SeoulClock />
      </div>
      <p className="mt-1 text-[32px] leading-tight font-bold tracking-tight text-[#191f28] tabular-nums">{won(totalKrw)}</p>
      <p className="mt-2 flex flex-wrap items-baseline gap-x-2 text-[14px] text-[#8b95a1]">
        <span>
          {holdingCount === 0 ? "아래에 종목이나 현금을 입력하면 총자산이 계산됩니다." : `보유 ${holdingCount}개,`}
        </span>
        {holdingCount > 0 && priceGainKrw != null ? (
          <span>평가손익 {signedWon(priceGainKrw)}</span>
        ) : null}
      </p>
      {weightWarning ? (
        <p className="mt-3 text-[13px] font-medium text-[#f04452]">비중 합이 100%가 아닙니다. 입력값을 다시 확인해 주세요.</p>
      ) : null}
      {blockedReason ? <p className="mt-3 text-[13px] font-medium text-[#f04452]">{blockedReason}</p> : null}

      <form
        className="mt-4 border-t border-[#f2f4f6] pt-4"
        onSubmit={(event) => {
          event.preventDefault();
          startTransition(async () => {
            const result = await setFx({ usdKrw: Number(fxInput) });
            setMessage(result.ok ? "환율을 수동으로 고정했습니다." : result.message);
          });
        }}
      >
        <div className="flex items-center justify-between gap-3">
          <label htmlFor="usd-krw" className="text-[15px] font-medium text-[#4e5968]">
            원달러 환율
          </label>
          <div className="flex items-baseline gap-1">
            <input
              id="usd-krw"
              value={fxInput}
              onChange={(event) => setFxInput(event.target.value)}
              inputMode="decimal"
              className="w-28 bg-transparent text-right text-[18px] font-bold tabular-nums tracking-tight text-[#191f28] outline-none"
            />
            <span className="text-[15px] font-semibold text-[#191f28]">원</span>
          </div>
        </div>
        {/* <button type="submit" disabled={pending} className="rounded-lg bg-[#1c1915] px-3 py-1.5 text-sm text-white">
          환율 저장
        </button> */}
        {fxSource === "manual" ? (
          <button
            type="button"
            disabled={pending}
            className="mt-2 text-[13px] font-semibold text-[#3182f6] disabled:opacity-50"
            onClick={() =>
              startTransition(async () => {
                const result = await followAutoFx();
                setMessage(result.ok ? "자동 환율을 적용했습니다." : result.message);
              })
            }
          >
            자동 환율
          </button>
        ) : (
          <p className="mt-1 text-[13px] text-[#8b95a1]">오늘 환율은 30분 전 데이터 입니다.</p>
        )}
        {/* <button
          type="button"
          className="rounded-lg border border-[#e4dccb] px-3 py-1.5 text-sm"
          onClick={() =>
            startTransition(async () => {
              const result = await loadExample();
              setMessage(result.ok ? "1억 원 B1 예시를 불러왔습니다." : result.message);
            })
          }
        >
          예시 불러오기
        </button>
        <button
          type="button"
          className="rounded-lg border border-[#e4dccb] px-3 py-1.5 text-sm"
          onClick={() =>
            startTransition(async () => {
              const result = await clearHoldings();
              setMessage(result.ok ? "보유를 비웠습니다." : result.message);
            })
          }
        >
          보유 비우기
        </button> */}
        {message ? <p className="mt-2 text-[13px] font-medium text-[#4e5968]">{message}</p> : null}
      </form>
    </section>
  );
}
