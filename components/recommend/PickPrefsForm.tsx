"use client";

import { useState } from "react";
import {
  PICK_AIMS,
  PICK_AIM_LABEL,
  PICK_ADD_TOS,
  PICK_ADD_TO_LABEL,
  PICK_EXCLUDES,
  PICK_EXCLUDE_LABEL,
  PICK_INSTRUMENTS,
  PICK_INSTRUMENT_LABEL,
  PICK_MARKETS,
  PICK_MARKET_LABEL,
  PICK_SECTORS,
  PICK_SECTOR_LABEL,
  type PickAim,
  type PickAddTo,
  type PickExclude,
  type PickInstrument,
  type PickMarket,
  type PickPrefs,
  type PickSector,
} from "@/lib/engine/pick-prefs";
import { PICK_PLAN_WEEKS, type PickPlanWeeks } from "@/lib/engine/pick-schedule";
import { savePickPrefs } from "@/lib/server/pick-prefs-actions";

export function PickPrefsForm({
  initial,
  planWeeks: initialPlanWeeks,
  intent,
  onSaved,
}: {
  initial: PickPrefs | null;
  planWeeks: PickPlanWeeks;
  intent: "start" | "edit";
  onSaved?: (prefs: PickPrefs, planWeeks: PickPlanWeeks) => void;
}) {
  const [instrument, setInstrument] = useState<PickInstrument | null>(initial?.instrument ?? null);
  const [addTo, setAddTo] = useState<PickAddTo | null>(initial?.addTo ?? null);
  const [market, setMarket] = useState<PickMarket | null>(initial?.market ?? null);
  const [aim, setAim] = useState<PickAim | null>(initial?.aim ?? null);
  const [planWeeks, setPlanWeeks] = useState<PickPlanWeeks>(initialPlanWeeks);
  const [exclude, setExclude] = useState<PickExclude[]>(initial?.exclude ?? []);
  const [sectors, setSectors] = useState<PickSector[]>(initial?.sectors ?? []);
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);

  const singleBlocked = instrument === "stock";
  const stockBlocked = exclude.includes("single");

  function toggleExclude(id: PickExclude) {
    if (id === "single" && singleBlocked) return;
    setExclude((current) => (current.includes(id) ? current.filter((item) => item !== id) : [...current, id]));
  }

  function toggleSector(id: PickSector) {
    setSectors((current) => (current.includes(id) ? current.filter((item) => item !== id) : [...current, id]));
  }

  async function submit() {
    if (!instrument || !addTo || !market || !aim || pending) return;
    setPending(true);
    setMessage(null);
    setFailed(false);
    const result = await savePickPrefs({ instrument, addTo, market, aim, exclude, sectors, planWeeks });
    setPending(false);
    if (!result.ok) {
      setFailed(true);
      setMessage(result.message);
      return;
    }
    setMessage(
      intent === "edit"
        ? "저장했습니다. 우선을 바꿨으면 홈의 목표 비중과 괴리가 바로 바뀝니다. 종목은 추천 종목에서 다시 받기를 누르세요."
        : null,
    );
    onSaved?.(result.prefs, result.planWeeks);
  }

  return (
    <section id="pick-prefs" className="rounded-[22px] bg-white px-5 py-5">
      <h2 className="text-[17px] font-bold text-[#191f28]">추천 기준</h2>
      <p className="mt-2 text-[14px] leading-5 text-[#6b7684]">
        {intent === "start"
          ? "종목을 고르기 전에 기준을 고릅니다. 한 번만 묻고, 설정에서 바꿀 수 있습니다. 우선은 이번 달 목표 비중을 기울이고, 나머지 기준은 종목만 고릅니다."
          : "우선은 홈의 이번 달 목표 비중과 괴리의 매수·매도 금액을 바꿉니다. 나머지 기준은 종목과 향후 계획에만 씁니다."}
      </p>

      <fieldset className="mt-5">
        <legend className="text-[13px] font-bold text-[#191f28]">추진 기간</legend>
        <p className="mt-1 text-[12px] leading-5 text-[#8b95a1]">향후 계획을 이 기간으로 나눕니다. 종목은 바꾸지 않습니다.</p>
        <div className="mt-2 flex flex-wrap gap-2">
          {PICK_PLAN_WEEKS.map((value) => {
            const on = planWeeks === value;
            return (
              <button key={value} type="button" aria-pressed={on} onClick={() => setPlanWeeks(value)} className={chipClass(on, false)}>
                {value}주
              </button>
            );
          })}
        </div>
      </fieldset>

      <ChoiceGroup label="상품" value={instrument} options={PICK_INSTRUMENTS} labels={PICK_INSTRUMENT_LABEL} disabled={stockBlocked ? ["stock"] : []} onChange={setInstrument} />
      <ChoiceGroup label="매수" value={addTo} options={PICK_ADD_TOS} labels={PICK_ADD_TO_LABEL} onChange={setAddTo} />
      <ChoiceGroup label="익숙한 시장" value={market} options={PICK_MARKETS} labels={PICK_MARKET_LABEL} onChange={setMarket} />
      <ChoiceGroup label="우선" value={aim} options={PICK_AIMS} labels={PICK_AIM_LABEL} onChange={setAim} />
      <p className="mt-2 text-[12px] leading-5 text-[#8b95a1]">
        배당·이자 우선은 주식·부동산을 줄여 현금에 두고, 가격 상승 우선은 현금에서 주식·부동산으로 옮깁니다. 둘 다는 국면 비중 그대로입니다. 채권과 금은 바뀌지 않습니다.
      </p>
      <p className="mt-2 text-[12px] leading-5 text-[#8b95a1]">
        익숙한 시장은 한국주식과 미국주식의 비율을 바꾸지 않습니다. 금, 채권, 부동산처럼 어느 시장에나 있는 상품만 이 기준으로 고릅니다.
      </p>

      <fieldset className="mt-5">
        <legend className="text-[13px] font-bold text-[#191f28]">빼고 싶은 것</legend>
        <p className="mt-1 text-[12px] leading-5 text-[#8b95a1]">없으면 고르지 않아도 됩니다.</p>
        <div className="mt-2 flex flex-wrap gap-2">
          {PICK_EXCLUDES.map((id) => {
            const on = exclude.includes(id);
            const disabled = id === "single" && singleBlocked;
            return (
              <button
                key={id}
                type="button"
                aria-pressed={on}
                disabled={disabled}
                onClick={() => toggleExclude(id)}
                className={chipClass(on, disabled)}
              >
                {PICK_EXCLUDE_LABEL[id]}
              </button>
            );
          })}
        </div>
      </fieldset>

      <fieldset className="mt-5">
        <legend className="text-[13px] font-bold text-[#191f28]">넣고 싶은 섹터</legend>
        <p className="mt-1 text-[12px] leading-5 text-[#8b95a1]">고르면 그 섹터를 위주로 고릅니다. 없으면 섹터를 가리지 않습니다.</p>
        <div className="mt-2 flex flex-wrap gap-2">
          {PICK_SECTORS.map((id) => {
            const on = sectors.includes(id);
            return (
              <button key={id} type="button" aria-pressed={on} onClick={() => toggleSector(id)} className={chipClass(on, false)}>
                {PICK_SECTOR_LABEL[id]}
              </button>
            );
          })}
        </div>
      </fieldset>

      <button
        type="button"
        onClick={() => void submit()}
        disabled={pending || !instrument || !addTo || !market || !aim}
        className="mt-5 h-11 w-full rounded-2xl bg-[#3182f6] text-[15px] font-bold text-white disabled:opacity-60"
      >
        {pending ? "저장 중" : intent === "start" ? "이 기준으로 추천받기" : "저장"}
      </button>
      {message ? <p className={`mt-3 text-[13px] font-medium ${failed ? "text-[#f04452]" : "text-[#3182f6]"}`}>{message}</p> : null}
    </section>
  );
}

function ChoiceGroup<T extends string>({
  label,
  value,
  options,
  labels,
  disabled = [],
  onChange,
}: {
  label: string;
  value: T | null;
  options: readonly T[];
  labels: Record<T, string>;
  disabled?: T[];
  onChange: (next: T) => void;
}) {
  return (
    <fieldset className="mt-5">
      <legend className="text-[13px] font-bold text-[#191f28]">{label}</legend>
      <div className="mt-2 flex flex-wrap gap-2">
        {options.map((id) => {
          const off = disabled.includes(id);
          const on = value === id;
          return (
            <button
              key={id}
              type="button"
              aria-pressed={on}
              disabled={off}
              onClick={() => onChange(id)}
              className={chipClass(on, off)}
            >
              {labels[id]}
            </button>
          );
        })}
      </div>
    </fieldset>
  );
}

function chipClass(on: boolean, disabled: boolean): string {
  const state = disabled
    ? "border-[#f2f4f6] bg-[#f9fafb] text-[#d1d6db]"
    : on
      ? "border-[#3182f6] bg-[#e8f3ff] text-[#1b64da]"
      : "border-[#e5e8eb] bg-white text-[#4e5968]";
  return `rounded-full border px-3 py-1.5 text-[13px] font-semibold disabled:cursor-default ${state}`;
}
