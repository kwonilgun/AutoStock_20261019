import { formatNumber } from "@/lib/format";

export type MarketRateView = {
  fed: string;
  fedWhen: string;
  fx: string;
  fxNote: string;
};

export function formatFedTarget(low: number, high: number): string {
  const bottom = low.toFixed(2);
  const top = high.toFixed(2);
  if (bottom === top) return `${bottom}%`;
  return `${bottom}~${top}%`;
}

export function formatFedDate(date: string): string {
  const [, month, day] = date.split("-");
  return `${Number(month)}월 ${Number(day)}일`;
}

export function formatFx(value: number): string {
  const rounded = Math.round(value * 100) / 100;
  return `${formatNumber(rounded)}원`;
}

export function RateBoxes({ rates }: { rates: MarketRateView }) {
  return (
    <div className="mt-4 grid grid-cols-2 gap-2">
      <div className="rounded-2xl bg-[#f2f4f6] px-4 py-3">
        <p className="text-[13px] text-[#8b95a1]">연준 기준금리</p>
        <p className="mt-1 text-[22px] font-bold tabular-nums tracking-tight text-[#191f28]">{rates.fed}</p>
        <p className="mt-1 text-[12px] text-[#8b95a1]">{rates.fedWhen}</p>
      </div>
      <div className="rounded-2xl bg-[#f2f4f6] px-4 py-3">
        <p className="text-[13px] text-[#8b95a1]">원달러 환율</p>
        <p className="mt-1 text-[22px] font-bold tabular-nums tracking-tight text-[#191f28]">{rates.fx}</p>
        <p className="mt-1 text-[12px] text-[#8b95a1]">{rates.fxNote}</p>
      </div>
    </div>
  );
}
