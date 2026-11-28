"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { SeoulClock } from "@/components/home/SeoulClock";
import { formatNumber } from "@/lib/format";
import { refreshQuotesAndFx } from "@/lib/server/actions";

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
}: {
  totalKrw: number;
  holdingCount: number;
  /** 평균가 대비 주식 시세 손익 합계. 평균가가 있는 종목이 없으면 null. */
  priceGainKrw: number | null;
  weightWarning: boolean;
  blockedReason: string | null;
  fx: number;
}) {
  const router = useRouter();
  const [updating, startUpdate] = useTransition();
  const [updateError, setUpdateError] = useState<string | null>(null);
  const fxLabel = formatNumber(Math.round(fx * 100) / 100);

  function updateQuotes() {
    setUpdateError(null);
    startUpdate(async () => {
      const result = await refreshQuotesAndFx();
      if (!result.ok) {
        setUpdateError(result.message);
        return;
      }
      router.refresh();
    });
  }

  return (
    <section className="rounded-[22px] bg-white px-5 pt-6 pb-5">
      <div className="flex items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-2">
          <p className="text-[15px] font-medium text-[#4e5968]">총 자산</p>
          <button
            type="button"
            onClick={updateQuotes}
            disabled={updating}
            className="h-7 shrink-0 rounded-lg bg-[#f2f4f6] px-2.5 text-[12px] font-bold text-[#191f28] disabled:text-[#8b95a1]"
          >
            {updating ? "업데이트 중" : "업데이트"}
          </button>
        </div>
        <SeoulClock />
      </div>
      {updateError ? <p className="mt-1 text-[12px] leading-4 text-[#f04452]">{updateError}</p> : null}
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

      <div className="mt-4 border-t border-[#f2f4f6] pt-4">
        <div className="flex items-center justify-between gap-3">
          <p className="text-[15px] font-medium text-[#4e5968]">원달러 환율</p>
          <p className="text-[18px] font-bold tabular-nums tracking-tight text-[#191f28]">
            {fxLabel}
            <span className="ml-1 text-[15px] font-semibold">원</span>
          </p>
        </div>
        <p className="mt-1 text-[13px] text-[#8b95a1]">오늘 환율은 30분마다 자동으로 가져옵니다.</p>
      </div>
    </section>
  );
}
