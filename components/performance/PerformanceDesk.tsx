"use client";

import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { SeoulClock } from "@/components/home/SeoulClock";
import { AssetLine, CUMULATIVE, ReturnBars } from "@/components/performance/Charts";
import { classify, normalizeTicker } from "@/lib/engine/classify";
import {
  alignCumulative,
  buildAssetSeries,
  datedFlowLines,
  heldPositions,
  hostIncomes,
  INCOME_KIND_LABEL,
  periodKey,
  stockPricePnl,
  type AssetPoint,
  type DatedFlow,
  type FlowLine,
  type Grain,
  type HostedIncome,
  type PositionDay,
  type SeriesPoint,
} from "@/lib/engine/history";
import type { HoldingInput } from "@/lib/engine/types";
import { formatNumber, formatReturn, formatUsd } from "@/lib/format";

const GRAINS: { id: Grain; label: string }[] = [
  { id: "day", label: "날짜별" },
  { id: "month", label: "월별" },
  { id: "year", label: "년도별" },
];

const VISIBLE_ROWS = 5;

const UP = "#f04452";
const DOWN = "#3182f6";

function won(value: number): string {
  const rounded = Math.round(value);
  const sign = rounded < 0 ? "-" : "";
  return `${sign}${formatNumber(Math.abs(rounded))}원`;
}

function signedWon(value: number): string {
  const rounded = Math.round(value);
  if (rounded === 0) return "0원";
  const sign = rounded > 0 ? "+" : "−";
  return `${sign}${formatNumber(Math.abs(rounded))}원`;
}

function hasCumulativeWon(value: number | null | undefined): value is number {
  return value != null && Math.round(value) !== 0;
}

function pointHasChange(point: {
  changeKrw: number | null;
  returnRate: number | null;
  flowKrw: number;
  incomeKrw: number;
}): boolean {
  if (point.changeKrw != null && Math.round(point.changeKrw) !== 0) return true;
  if (point.returnRate != null && !flat(point.returnRate)) return true;
  if (Math.round(point.flowKrw) !== 0) return true;
  if (Math.round(point.incomeKrw) !== 0) return true;
  return false;
}

function flat(value: number): boolean {
  return Math.round(value * 1000) / 10 === 0;
}

function toneClass(value: number | null): string {
  if (value == null || flat(value)) return "text-[#8b95a1]";
  return value > 0 ? "text-[#f04452]" : "text-[#3182f6]";
}

function toneColor(value: number | null): string {
  if (value != null && !flat(value) && value > 0) return UP;
  return DOWN;
}

function ReturnPart({ label, rate, amount }: { label: string; rate: number; amount: number }) {
  return (
    <p className="min-w-0">
      <span className="block truncate text-[12px] leading-4 font-medium text-[#8b95a1]">{label}</span>
      <span className={`mt-0.5 block text-[13px] leading-4 font-semibold tabular-nums ${toneClass(rate)}`}>
        {formatReturn(rate)}
      </span>
      <span className="block truncate text-[12px] leading-4 font-medium tabular-nums text-[#8b95a1]">{signedWon(amount)}</span>
    </p>
  );
}

function ClockIcon() {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" aria-hidden>
      <circle cx="12" cy="12" r="8.25" stroke="currentColor" strokeWidth="1.8" />
      <path d="M12 7.75V12l2.75 1.75" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function PeriodChevron({ dir }: { dir: "left" | "right" }) {
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

function koreanDate(date: string): string {
  const [year, month, day] = date.split("-");
  if (!year || !month || !day) return date;
  return `${year}년 ${Number(month)}월 ${Number(day)}일`;
}

function cashKind(ticker: string): "krw" | "usd" | null {
  const key = normalizeTicker(ticker);
  if (key === "CASH" || key === "MMF") return "krw";
  if (key === "USD") return "usd";
  return null;
}

function stockLabel(holdings: { ticker: string; name?: string }[], ticker: string): string {
  const cash = cashKind(ticker);
  if (cash === "krw") return "원화 현금";
  if (cash === "usd") return "달러 현금";
  const key = normalizeTicker(ticker);
  const holding = holdings.find((item) => normalizeTicker(item.ticker) === key);
  const name = holding?.name?.trim();
  if (name && normalizeTicker(name) !== key) return `${name} (${ticker})`;
  const known = classify(ticker).name;
  if (known && normalizeTicker(known) !== key) return `${known} (${ticker})`;
  return ticker;
}

function quantityText(ticker: string, quantity: number): string {
  const cash = cashKind(ticker);
  if (cash === "krw") return `${formatNumber(Math.round(quantity))}원`;
  if (cash === "usd") return formatUsd(quantity);
  const whole = Math.abs(quantity - Math.round(quantity)) < 1e-6;
  return `${whole ? formatNumber(Math.round(quantity)) : formatNumber(Math.round(quantity * 1000) / 1000)}주`;
}

function signedQuantity(ticker: string, delta: number): string {
  const body = quantityText(ticker, Math.abs(delta));
  if (Math.abs(delta) < 1e-6) return body;
  return `${delta > 0 ? "+" : "−"}${body}`;
}

function priceText(line: FlowLine): string | null {
  if (cashKind(line.ticker) || !(line.price > 0)) return null;
  return line.currency === "USD" ? formatUsd(line.price) : `${formatNumber(line.price)}원`;
}

function objectParticle(text: string): string {
  return text.endsWith("주") || text.startsWith("$") ? "를" : "을";
}

function directionParticle(text: string): string {
  return text.endsWith("주") || text.startsWith("$") ? "로" : "으로";
}

function flowSentence(line: FlowLine, name: string): string {
  const after = quantityText(line.ticker, line.after);
  const before = quantityText(line.ticker, line.before);
  if (line.kind === "start") {
    return `${name} ${after}${objectParticle(after)} 처음 기록했습니다.`;
  }
  const move =
    line.kind === "add"
      ? `${after}${objectParticle(after)} 새로 넣었습니다`
      : line.kind === "remove"
        ? `${before}${objectParticle(before)} 모두 정리했습니다`
        : `${before}에서 ${after}${directionParticle(after)} 바꿨습니다 (${signedQuantity(line.ticker, line.after - line.before)})`;
  const price = priceText(line);
  const basis = price ? `${line.usedAvg ? "평균가" : "그날 가격"} ${price}로 계산한 ` : "";
  return `${name} ${move}. ${basis}${signedWon(line.amountKrw)}은 새로 넣거나 뺀 돈이라 수익률에서 제외합니다.`;
}

function incomeSentence(income: HostedIncome): string {
  const amount = `${INCOME_KIND_LABEL[income.kind]} ${signedWon(income.amountKrw)}`;
  const named = income.note.trim();
  const who = named ? `기록된 종목·메모는 “${named}”입니다.` : "어느 종목인지는 기록에 적혀 있지 않습니다.";
  const placed =
    income.date === income.hostDate
      ? "이 날짜의 수익률에 반영합니다."
      : `${koreanDate(income.date)}에 발생한 금액이고, ${koreanDate(income.hostDate)} 기록의 수익률에 반영합니다.`;
  const sale = income.kind === "sale" ? "판매 수익은 판 금액이 아니라 번 금액입니다. " : "";
  return `${amount}. ${sale}${who} ${placed}`;
}

type ExplainDay = {
  date: string;
  flow: DatedFlow | null;
  incomes: HostedIncome[];
};

type ExplainPeriod = {
  key: string;
  label: string;
  days: ExplainDay[];
};

function explainPeriods(
  grain: Grain,
  points: AssetPoint[],
  seriesLabels: { key: string; label: string }[],
  positionDays: PositionDay[],
  incomes: { date: string; kind: HostedIncome["kind"]; amountKrw: number; note: string }[],
  holdings: HoldingInput[],
  usdKrw: number,
): ExplainPeriod[] {
  const flows = new Map(datedFlowLines(positionDays, usdKrw, holdings).map((day) => [day.date, day]));
  const hosted = hostIncomes(points, incomes);
  const incomeByHost = new Map<string, HostedIncome[]>();
  for (const income of hosted) {
    const list = incomeByHost.get(income.hostDate) ?? [];
    list.push(income);
    incomeByHost.set(income.hostDate, list);
  }
  const dates = [...new Set(points.map((point) => point.date).filter((date) => /^\d{4}-\d{2}-\d{2}$/.test(date)))].sort();
  return [...seriesLabels].reverse().flatMap((period) => {
    const days = dates
      .filter((date) => periodKey(date, grain) === period.key)
      .reverse()
      .flatMap((date) => {
        const flow = flows.get(date) ?? null;
        const dayIncomes = incomeByHost.get(date) ?? [];
        const hasFlow = (flow?.lines.length ?? 0) > 0 || flow?.unknown;
        if (!hasFlow && dayIncomes.length === 0) return [];
        return [{ date, flow, incomes: dayIncomes }];
      });
    if (days.length === 0) return [];
    return [{ key: period.key, label: period.label, days }];
  });
}

function explainCount(day: ExplainDay): number {
  const flows = day.flow?.unknown ? 1 : (day.flow?.lines.length ?? 0);
  return flows + day.incomes.length;
}

function compareCaption(grain: Grain): string {
  if (grain === "day") return "이전 날짜 대비";
  if (grain === "month") return "이전 달 대비";
  return "이전 해 대비";
}

export function PerformanceDesk({
  points,
  positionDays,
  incomes,
  holdings,
  usdKrw,
}: {
  points: AssetPoint[];
  positionDays: PositionDay[];
  incomes: { date: string; kind: HostedIncome["kind"]; amountKrw: number; note: string }[];
  holdings: HoldingInput[];
  usdKrw: number;
}) {
  const [grain, setGrain] = useState<Grain>("day");
  const [focusDate, setFocusDate] = useState<string | null>(null);
  const [explaining, setExplaining] = useState(false);
  const [openExplainDates, setOpenExplainDates] = useState<string[]>([]);
  const explainRef = useRef<HTMLDialogElement>(null);
  const current = useMemo(() => heldPositions(holdings), [holdings]);
  const seriesInput = useMemo(
    () => ({
      positionDays,
      current,
      incomes,
      usdKrw,
    }),
    [positionDays, current, incomes, usdKrw],
  );
  const series = useMemo(() => {
    const built = buildAssetSeries(points, grain, seriesInput);
    const aligned = alignCumulative(built.points);
    const last = aligned[aligned.length - 1] ?? null;
    return { ...built, points: aligned, changeKrw: last?.cumulativeKrw ?? null, returnRate: last?.cumulativeRate ?? null };
  }, [points, grain, seriesInput]);
  const focus = useMemo(() => {
    const entries = series.points;
    if (entries.length === 0) return null;
    if (!focusDate) return entries[entries.length - 1];
    const key = periodKey(focusDate, grain);
    return (
      entries.find((point) => point.key === key) ??
      [...entries].reverse().find((point) => point.asOf <= focusDate) ??
      entries[entries.length - 1]
    );
  }, [series.points, focusDate, grain]);
  const focusIndex = focus ? series.points.findIndex((point) => point.key === focus.key) : -1;
  const headline = focus?.totalKrw ?? 0;
  const change = focus?.changeKrw ?? null;
  const rate = focus?.returnRate ?? null;
  const changeShown = change != null && Math.round(change) !== 0;
  const rateShown = rate != null && !flat(rate);
  const caption =
    focus == null ? "비교할 이전 기록이 없습니다" : focus.changeKrw == null ? "첫 기록" : compareCaption(grain);
  const cumulativeKrw = focus && hasCumulativeWon(focus.cumulativeKrw) ? focus.cumulativeKrw : null;
  const cumulativeRate = cumulativeKrw != null ? (focus?.cumulativeRate ?? null) : null;
  const color = toneColor(cumulativeRate ?? series.returnRate);
  const activeKey = focus?.key ?? null;
  const records = useMemo(() => [...series.points].reverse().filter(pointHasChange), [series.points]);
  const reserveIncome = series.points.some((point) => point.incomeKrw !== 0);
  const incomeInReturn =
    focus == null || focusIndex < 0
      ? 0
      : series.points.slice(0, focusIndex + 1).reduce((sum, point) => sum + point.incomeKrw, 0);
  const priceKrw = stockPricePnl(focus, incomeInReturn);
  const returnBase = focus != null && focus.totalKrw > 0 ? focus.totalKrw : null;
  const priceRate = priceKrw != null && returnBase != null ? priceKrw / returnBase : null;
  const incomeRate = returnBase != null && incomeInReturn !== 0 ? incomeInReturn / returnBase : null;
  const listRef = useRef<HTMLUListElement>(null);
  const [listMaxHeight, setListMaxHeight] = useState<number | null>(null);
  const periods = useMemo(
    () =>
      explainPeriods(
        grain,
        points,
        series.points.map((point) => ({ key: point.key, label: point.label })),
        positionDays,
        incomes,
        holdings,
        usdKrw,
      ),
    [grain, points, series.points, positionDays, incomes, holdings, usdKrw],
  );

  useEffect(() => {
    const dialog = explainRef.current;
    if (!dialog) return;
    if (explaining && !dialog.open) dialog.showModal();
  }, [explaining]);

  useLayoutEffect(() => {
    const list = listRef.current;
    if (!list) {
      setListMaxHeight(null);
      return;
    }
    function measure() {
      if (!list) return;
      const rows = list.children;
      if (rows.length <= VISIBLE_ROWS) {
        setListMaxHeight(null);
        return;
      }
      const last = rows[VISIBLE_ROWS - 1] as HTMLElement;
      setListMaxHeight(last.offsetTop - list.offsetTop + last.offsetHeight);
    }
    measure();
    if (focus) {
      const row = list.querySelector(`[data-key="${CSS.escape(focus.key)}"]`);
      if (row instanceof HTMLElement) {
        const top = row.offsetTop - list.offsetTop;
        const bottom = top + row.offsetHeight;
        if (top < list.scrollTop || bottom > list.scrollTop + list.clientHeight) {
          list.scrollTop = Math.max(0, top - 8);
        }
      }
    }
    window.addEventListener("resize", measure);
    return () => window.removeEventListener("resize", measure);
  }, [records, focus]);

  function selectGrain(next: Grain) {
    setGrain(next);
  }

  function selectKey(key: string | null) {
    if (!key) return;
    const point = series.points.find((item) => item.key === key);
    if (!point || point.asOf === focusDate) return;
    setFocusDate(point.asOf);
  }

  function movePeriod(delta: number) {
    const next = series.points[focusIndex + delta];
    if (next) setFocusDate(next.asOf);
  }

  function openRecord(point: SeriesPoint) {
    setFocusDate(point.asOf);
  }

  function openExplain() {
    setOpenExplainDates([]);
    setExplaining(true);
  }

  function toggleExplainDate(date: string) {
    setOpenExplainDates((current) =>
      current.includes(date) ? current.filter((item) => item !== date) : [...current, date],
    );
  }

  function closeExplain() {
    const dialog = explainRef.current;
    if (dialog?.open) {
      dialog.close();
      return;
    }
    setExplaining(false);
    setOpenExplainDates([]);
  }

  const canPrev = focusIndex > 0;
  const canNext = focusIndex >= 0 && focusIndex < series.points.length - 1;
  const recordHint =
    grain === "day"
      ? "날짜를 누르면 그 시점의 내 자산과 수익률이 바뀝니다."
      : grain === "month"
        ? "달을 누르면 그 달의 내 자산과 수익률이 바뀝니다."
        : "해를 누르면 그 해의 내 자산과 수익률이 바뀝니다.";

  return (
    <div className="flex flex-col gap-3">
      <section className="rounded-[22px] bg-white px-5 py-5">
        <h2 className="text-[17px] font-bold text-[#191f28]">기간</h2>
        <p className="mt-1 text-[13px] leading-5 text-[#8b95a1]">
          날짜별·월별·년도별 선택이 내 자산, 수익률, 기록에 함께 적용됩니다.
        </p>
        <div className="mt-4 grid grid-cols-3 rounded-2xl bg-[#f2f4f6] p-1" role="tablist" aria-label="기간">
          {GRAINS.map((item) => {
            const selected = item.id === grain;
            return (
              <button
                key={item.id}
                type="button"
                role="tab"
                aria-selected={selected}
                onClick={() => selectGrain(item.id)}
                className={`rounded-xl py-2.5 text-[14px] font-semibold ${
                  selected ? "bg-white text-[#191f28] shadow-sm" : "text-[#8b95a1]"
                }`}
              >
                {item.label}
              </button>
            );
          })}
        </div>
        {grain === "day" ? null : (
          <div className="mt-4 flex items-center justify-between gap-2">
            <button
              type="button"
              aria-label="이전 기간"
              disabled={!canPrev}
              className="flex h-11 w-11 items-center justify-center rounded-full bg-[#f2f4f6] text-[#191f28] disabled:text-[#c9d4e4]"
              onClick={() => movePeriod(-1)}
            >
              <PeriodChevron dir="left" />
            </button>
            <p className="min-w-0 text-center text-[18px] font-bold text-[#191f28]">{focus?.label ?? "기록 없음"}</p>
            <button
              type="button"
              aria-label="다음 기간"
              disabled={!canNext}
              className="flex h-11 w-11 items-center justify-center rounded-full bg-[#f2f4f6] text-[#191f28] disabled:text-[#c9d4e4]"
              onClick={() => movePeriod(1)}
            >
              <PeriodChevron dir="right" />
            </button>
          </div>
        )}
      </section>

      <section className="rounded-[22px] bg-white px-5 pt-6 pb-5">
        <div className="flex items-center justify-between gap-3">
          <p className="min-w-0 truncate text-[15px] font-medium text-[#4e5968]">{focus?.label ?? "내 자산"}</p>
          <SeoulClock />
        </div>
        <p className="mt-1 truncate text-[32px] leading-tight font-bold tracking-tight text-[#191f28] tabular-nums">{won(headline)}</p>
        {focus?.cumulativeKrw != null ? (
          <p className="mt-2 truncate text-[15px] font-semibold tabular-nums">
            <span className="font-medium text-[#8b95a1]">누적 수익</span>
            <span className={`ml-1.5 ${toneClass(focus.cumulativeRate)}`}>
              {signedWon(focus.cumulativeKrw)}
              {focus.cumulativeRate != null ? <span className="ml-1.5">{formatReturn(focus.cumulativeRate)}</span> : null}
            </span>
          </p>
        ) : null}
        <p className={`truncate text-[15px] font-semibold tabular-nums ${focus?.cumulativeKrw != null ? "mt-1" : "mt-2"}`}>
          {change == null ? (
            <span className="font-medium text-[#8b95a1]">{caption}</span>
          ) : !changeShown && !rateShown ? (
            <span className="font-medium text-[#8b95a1]">{"\u00a0"}</span>
          ) : (
            <>
              <span className={toneClass(rate)}>
                {changeShown ? signedWon(change) : null}
                {rateShown ? <span className="ml-1.5">{formatReturn(rate)}</span> : null}
              </span>
              <span className="ml-1.5 font-medium text-[#8b95a1]">{caption}</span>
            </>
          )}
        </p>

        <div className="mt-2">
          {series.points.length > 0 ? (
            <AssetLine points={series.points} color={color} activeKey={activeKey} onHover={selectKey} />
          ) : (
            <div className="flex h-52 items-center justify-center rounded-2xl bg-[#f9fafb] text-[14px] text-[#8b95a1]">
              평가액이 기록되면 그래프가 그려집니다
            </div>
          )}
        </div>
        <p className="mt-1 text-center text-[12px] text-[#8b95a1]">
          그래프를 누르면 그 시점의 내 자산, 수익률, 기록이 함께 바뀝니다
        </p>
      </section>

      <section className="rounded-[22px] bg-white px-5 py-5">
        <h2 className="text-[17px] font-bold text-[#191f28]">수익률</h2>
        <p className="mt-1 text-[13px] text-[#8b95a1]">
          누적은 주식 시세와 배당·이자·판매를 더한 손익을 그날 자산으로 나눈 값입니다. 그래프도 이 누적을 그립니다
        </p>
        <div className="mt-3 grid grid-cols-2 gap-2">
          <div className="rounded-2xl bg-[#f9fafb] px-4 py-3">
            <p className="truncate text-[13px] font-medium text-[#6b7684]">
              {grain === "day" ? "전 날보다" : grain === "month" ? "전 달보다" : "전 해보다"}
              {focus ? <span className="ml-1 text-[#8b95a1]">· {focus.axisLabel}</span> : null}
            </p>
            <p className={`mt-1 truncate text-[20px] font-bold tabular-nums ${toneClass(rateShown ? rate : null)}`}>
              {rateShown && rate != null ? formatReturn(rate) : "—"}
            </p>
            <p className="mt-0.5 truncate text-[13px] font-medium tabular-nums text-[#8b95a1]">
              {changeShown && change != null ? signedWon(change) : change == null ? "비교할 기록 없음" : "\u00a0"}
            </p>
            {reserveIncome ? (
              <p
                className="mt-0.5 h-4 truncate text-[12px] leading-4 font-medium tabular-nums text-[#8b95a1]"
                aria-hidden={!(focus && focus.incomeKrw !== 0)}
              >
                {focus && focus.incomeKrw !== 0 ? `배당·이자·판매 ${signedWon(focus.incomeKrw)} 포함` : "\u00a0"}
              </p>
            ) : null}
          </div>
          <div className="rounded-2xl bg-[#f9fafb] px-4 py-3">
            <p className="truncate text-[13px] font-medium text-[#6b7684]">
              누적 수익률
              {series.points[0] ? <span className="ml-1 text-[#8b95a1]">· {series.points[0].axisLabel}부터</span> : null}
            </p>
            <p className={`mt-1 truncate text-[20px] font-bold tabular-nums ${toneClass(cumulativeRate)}`}>
              {cumulativeRate != null ? formatReturn(cumulativeRate) : "—"}
            </p>
            <p className="mt-0.5 truncate text-[13px] font-medium tabular-nums text-[#8b95a1]">
              {cumulativeKrw != null ? signedWon(cumulativeKrw) : focus?.cumulativeKrw == null ? "비교할 기록 없음" : "\u00a0"}
            </p>
            {priceRate != null && priceKrw != null && (focus?.costKrw != null || incomeRate != null) ? (
              <div className="mt-2 space-y-2 border-t border-[#e5e8eb] pt-2">
                <ReturnPart label="주식 시세" rate={priceRate} amount={priceKrw} />
                {incomeRate != null ? <ReturnPart label="배당·이자·판매" rate={incomeRate} amount={incomeInReturn} /> : null}
              </div>
            ) : reserveIncome ? (
              <p className="mt-0.5 h-4" aria-hidden>
                {"\u00a0"}
              </p>
            ) : null}
          </div>
        </div>
        <div className="mt-2">
          <ReturnBars points={series.points} activeKey={activeKey} onHover={selectKey} />
        </div>
        <div className="flex items-center justify-center gap-4 text-[12px] text-[#8b95a1]">
          <span className="flex items-center gap-1.5">
            <span className="inline-block h-2.5 w-2.5 rounded-[3px] bg-[#f04452]" />
            <span className="-ml-1 inline-block h-2.5 w-2.5 rounded-[3px] bg-[#3182f6]" />
            <span className="inline-block h-0.5 w-4 rounded-full" style={{ backgroundColor: CUMULATIVE }} />
            누적
          </span>
        </div>
      </section>

      <section className="rounded-[22px] bg-white px-5 py-2">
        <div className="flex items-center justify-between gap-2 pt-3">
          <h2 className="text-[17px] font-bold text-[#191f28]">
            {grain === "day" ? "날짜별 기록" : grain === "month" ? "월별 기록" : "년도별 기록"}
          </h2>
          <button
            type="button"
            aria-label="history"
            title="history"
            onClick={openExplain}
            className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-[#f2f4f6] text-[#4e5968]"
          >
            <ClockIcon />
          </button>
        </div>
        {focus ? <p className="pb-1 text-[13px] leading-5 text-[#8b95a1]">{recordHint}</p> : null}
        {records.length === 0 ? (
          <p className="py-4 text-[14px] text-[#8b95a1]">
            {series.points.length === 0 ? "아직 평가액 기록이 없습니다" : "변화가 있는 기록이 없습니다"}
          </p>
        ) : (
          <ul
            ref={listRef}
            className={listMaxHeight != null ? "overflow-y-auto overscroll-contain" : undefined}
            style={listMaxHeight != null ? { maxHeight: listMaxHeight } : undefined}
          >
            {records.map((point) => {
              const selected = point.key === focus?.key;
              return (
                <li key={point.key} className="border-b border-[#f2f4f6] last:border-b-0">
                  <button
                    type="button"
                    data-key={point.key}
                    aria-current={selected ? "true" : undefined}
                    onClick={() => openRecord(point)}
                    className={`flex w-full items-center justify-between gap-3 py-3.5 text-left ${
                      selected ? "bg-[#f9fafb]" : ""
                    }`}
                  >
                    <p className="text-[15px] font-medium text-[#333d4b]">{point.label}</p>
                    <div className="text-right">
                      <p className="text-[15px] font-bold tabular-nums text-[#191f28]">{won(point.totalKrw)}</p>
                      <p className={`mt-0.5 text-[13px] font-semibold tabular-nums ${toneClass(point.returnRate)}`}>
                        {point.changeKrw == null || point.returnRate == null
                          ? "첫 기록"
                          : Math.round(point.changeKrw) === 0
                            ? flat(point.returnRate)
                              ? "\u00a0"
                              : formatReturn(point.returnRate)
                            : `${signedWon(point.changeKrw)} ${formatReturn(point.returnRate)}`}
                      </p>
                      {point.cumulativeKrw != null ? (
                        <p className="mt-0.5 text-[13px] font-semibold tabular-nums">
                          <span className="font-medium text-[#8b95a1]">누적 수익 </span>
                          <span className={toneClass(point.cumulativeRate)}>
                            {signedWon(point.cumulativeKrw)}
                            {point.cumulativeRate != null ? ` ${formatReturn(point.cumulativeRate)}` : ""}
                          </span>
                        </p>
                      ) : null}
                      {point.incomeKrw !== 0 ? (
                        <p className="mt-0.5 text-[12px] font-medium tabular-nums text-[#8b95a1]">
                          배당·이자·판매 {signedWon(point.incomeKrw)} 포함
                        </p>
                      ) : null}
                      {Math.round(point.flowKrw) !== 0 ? (
                        <p className="mt-0.5 text-[12px] font-medium tabular-nums text-[#8b95a1]">
                          {point.flowKrw > 0 ? "종목·현금 추가" : "종목·현금 감소"} {signedWon(point.flowKrw)} 제외
                        </p>
                      ) : null}
                    </div>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <dialog
        ref={explainRef}
        aria-labelledby="performance-explain-title"
        className="fixed inset-auto top-1/2 left-1/2 m-0 max-h-[88dvh] w-[min(100%-2rem,32rem)] -translate-x-1/2 -translate-y-1/2 overflow-y-auto rounded-[22px] border-0 bg-white p-5 text-[#191f28] shadow-[0_16px_48px_rgba(25,31,40,0.18)] backdrop:bg-[#191f28]/40"
        onClick={(event) => {
          if (event.target === event.currentTarget) closeExplain();
        }}
        onClose={() => {
          setExplaining(false);
          setOpenExplainDates([]);
        }}
      >
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h2 id="performance-explain-title" className="text-[17px] font-bold text-[#191f28]">
              {grain === "day" ? "날짜별 변경" : grain === "month" ? "월별 변경" : "년도별 변경"}
            </h2>
            <p className="mt-1 text-[13px] leading-5 text-[#8b95a1]">
              날짜를 누르면 그날의 변경이 펼쳐집니다. 종목과 현금은 수량이 바뀐 금액만 빼고, 배당·이자·판매 수익은 그 날짜의 수익률에 더합니다.
            </p>
          </div>
          <button type="button" className="shrink-0 text-[14px] font-semibold text-[#4e5968]" onClick={closeExplain}>
            닫기
          </button>
        </div>
        {periods.length === 0 ? (
          <p className="mt-4 text-[14px] leading-6 text-[#8b95a1]">
            아직 종목·현금 수량이나 배당·이자가 바뀐 기록이 없습니다.
          </p>
        ) : (
          <div className="mt-2">
            {periods.map((period) => (
              <section key={period.key} className="border-b border-[#f2f4f6] py-1 last:border-b-0">
                {grain === "day" ? null : <h3 className="pt-3 text-[15px] font-bold text-[#191f28]">{period.label}</h3>}
                {period.days.map((day) => {
                  const open = openExplainDates.includes(day.date);
                  return (
                    <div key={day.date}>
                      <button
                        type="button"
                        aria-expanded={open}
                        onClick={() => toggleExplainDate(day.date)}
                        className="flex w-full items-center justify-between gap-3 py-3 text-left"
                      >
                        <span className="text-[14px] font-bold text-[#191f28]">
                          {grain === "day" ? period.label : koreanDate(day.date)}
                        </span>
                        <span className="flex shrink-0 items-center gap-1 text-[13px] font-semibold text-[#8b95a1]">
                          {explainCount(day)}건
                          <ChevronIcon open={open} />
                        </span>
                      </button>
                      {open ? (
                        <div className="pb-3">
                          <p className="text-[13px] font-bold text-[#333d4b]">종목·현금 증감</p>
                          {day.flow?.unknown ? (
                            <p className="mt-1 text-[13px] leading-5 text-[#4e5968]">
                              이날 보유 수량이 남아 있지 않아 어떤 종목인지 나누지 못했습니다. 수익률에서 제외한 금액은{" "}
                              {signedWon(day.flow.flowKrw)}입니다.
                            </p>
                          ) : day.flow && day.flow.lines.length > 0 ? (
                            <ul className="mt-1 flex flex-col gap-2">
                              {day.flow.lines.map((line) => (
                                <li key={`${day.date}-${line.ticker}-${line.kind}`} className="text-[13px] leading-5 text-[#4e5968]">
                                  {flowSentence(line, stockLabel(holdings, line.ticker))}
                                </li>
                              ))}
                            </ul>
                          ) : (
                            <p className="mt-1 text-[13px] leading-5 text-[#8b95a1]">수량이 바뀐 종목이나 현금이 없습니다.</p>
                          )}
                          <p className="mt-3 text-[13px] font-bold text-[#333d4b]">배당·이자·판매 증감</p>
                          {day.incomes.length > 0 ? (
                            <ul className="mt-1 flex flex-col gap-2">
                              {day.incomes.map((income, index) => (
                                <li key={`${day.date}-${income.kind}-${income.date}-${index}`} className="text-[13px] leading-5 text-[#4e5968]">
                                  {incomeSentence(income)}
                                </li>
                              ))}
                            </ul>
                          ) : (
                            <p className="mt-1 text-[13px] leading-5 text-[#8b95a1]">이 날짜에 반영된 배당·이자·판매 수익이 없습니다.</p>
                          )}
                        </div>
                      ) : null}
                    </div>
                  );
                })}
              </section>
            ))}
          </div>
        )}
      </dialog>
    </div>
  );
}

