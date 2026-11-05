"use client";

import { useState, useTransition } from "react";
import { PHASE_META, SLEEVE_LABEL } from "@/lib/engine/config";
import { PHASES, SLEEVES, type Phase, type Sleeve, type WeightTable } from "@/lib/engine/types";
import { adminResetWeights, adminSaveWeights } from "@/lib/server/admin-actions";

function toPercent(weight: number): string {
  return String(Math.round(weight * 10000) / 100);
}

export function WeightEditor({
  weights,
  customized,
  activePhase,
}: {
  weights: WeightTable;
  customized: Phase[];
  activePhase: Phase;
}) {
  const [selected, setSelected] = useState<Phase>(activePhase);
  const [message, setMessage] = useState<Notice>(null);

  return (
    <section className="rounded-[22px] bg-white px-5 py-5">
      <h2 className="text-[17px] font-bold text-[#191f28]">국면별 목표 비중</h2>
      <p className="mt-1 text-[13px] leading-5 text-[#8b95a1]">
        저장하면 그 국면을 쓰는 모든 사용자의 목표 비중과 실행서가 바로 바뀝니다. 한 자산군(주식 합계, 채권 합계, 그 밖의 각 자산)은 60%를 넘을 수 없습니다.
      </p>
      <div className="mt-4 grid grid-cols-6 gap-1.5">
        {PHASES.map((phase) => {
          const active = phase === selected;
          return (
            <button
              key={phase}
              type="button"
              onClick={() => {
                setSelected(phase);
                setMessage(null);
              }}
              className={`rounded-xl py-2 text-[14px] font-bold ${active ? "bg-[#3182f6] text-white" : "bg-[#f2f4f6] text-[#4e5968]"}`}
            >
              {phase}
              {phase === activePhase ? <span className="block text-[10px] font-medium">지금</span> : null}
            </button>
          );
        })}
      </div>
      <PhaseWeightForm
        key={`${selected}:${JSON.stringify(weights[selected])}`}
        phase={selected}
        weights={weights[selected]}
        customized={customized.includes(selected)}
        onNotice={setMessage}
      />
      {message ? (
        <p className={`mt-3 text-[14px] font-medium ${message.ok ? "text-[#3182f6]" : "text-[#f04452]"}`}>{message.text}</p>
      ) : null}
    </section>
  );
}

type Notice = { ok: boolean; text: string } | null;

function PhaseWeightForm({
  phase,
  weights,
  customized,
  onNotice: setMessage,
}: {
  phase: Phase;
  weights: Record<Sleeve, number>;
  customized: boolean;
  onNotice: (notice: Notice) => void;
}) {
  const [values, setValues] = useState<Record<Sleeve, string>>(
    () => Object.fromEntries(SLEEVES.map((sleeve) => [sleeve, toPercent(weights[sleeve])])) as Record<Sleeve, string>,
  );
  const [pending, startTransition] = useTransition();
  const sum = SLEEVES.reduce((total, sleeve) => total + (Number(values[sleeve]) || 0), 0);
  const balanced = Math.abs(sum - 100) < 0.001;

  function save() {
    setMessage(null);
    startTransition(async () => {
      const result = await adminSaveWeights(phase, values);
      setMessage({ ok: result.ok, text: result.message ?? "저장했습니다." });
    });
  }

  function reset() {
    setMessage(null);
    startTransition(async () => {
      const result = await adminResetWeights(phase);
      setMessage({ ok: result.ok, text: result.message ?? "되돌렸습니다." });
    });
  }

  return (
    <div className="mt-4">
      <p className="text-[13px] text-[#8b95a1]">
        {phase} {PHASE_META[phase].name} · {customized ? "관리자 수정값" : "기본표"}
      </p>
      <ul className="mt-2">
        {SLEEVES.map((sleeve) => (
          <li key={sleeve} className="flex items-center justify-between gap-3 border-b border-[#f2f4f6] py-2.5 last:border-b-0">
            <label htmlFor={`w-${sleeve}`} className="text-[15px] font-medium text-[#333d4b]">
              {SLEEVE_LABEL[sleeve]}
            </label>
            <span className="flex items-center gap-1">
              <input
                id={`w-${sleeve}`}
                inputMode="decimal"
                value={values[sleeve]}
                onChange={(event) => setValues((prev) => ({ ...prev, [sleeve]: event.target.value }))}
                className="w-20 rounded-lg border border-[#e5e8eb] px-2 py-1.5 text-right text-[15px] tabular-nums"
              />
              <span className="text-[14px] text-[#8b95a1]">%</span>
            </span>
          </li>
        ))}
      </ul>
      <p className={`mt-3 text-right text-[15px] font-bold tabular-nums ${balanced ? "text-[#191f28]" : "text-[#f04452]"}`}>
        합계 {Math.round(sum * 100) / 100}%
      </p>
      <div className="mt-3 flex gap-2">
        <button
          type="button"
          onClick={save}
          disabled={pending || !balanced}
          className="flex-1 rounded-xl bg-[#3182f6] py-3 text-[15px] font-semibold text-white disabled:opacity-40"
        >
          {pending ? "저장 중" : `${phase} 비중 저장`}
        </button>
        <button
          type="button"
          onClick={reset}
          disabled={pending || !customized}
          className="rounded-xl bg-[#f2f4f6] px-4 py-3 text-[15px] font-semibold text-[#4e5968] disabled:opacity-40"
        >
          기본표로
        </button>
      </div>
    </div>
  );
}
