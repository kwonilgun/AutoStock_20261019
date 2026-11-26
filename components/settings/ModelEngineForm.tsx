"use client";

import { useState } from "react";
import { modelEngineLabel, type PickEngine } from "@/lib/pick-engine";
import { saveModelEngine, type ModelEngineKind } from "@/lib/server/model-engine-actions";

const ENGINES: PickEngine[] = ["claude", "spark"];

export function ModelEngineForm({
  pickEngine,
  weightEngine,
  sparkModel,
}: {
  pickEngine: PickEngine;
  weightEngine: PickEngine;
  sparkModel: string | null;
}) {
  const [pick, setPick] = useState(pickEngine);
  const [weight, setWeight] = useState(weightEngine);
  const [pendingKind, setPendingKind] = useState<ModelEngineKind | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);

  async function choose(kind: ModelEngineKind, engine: PickEngine) {
    if (pendingKind) return;
    const current = kind === "pick" ? pick : weight;
    if (current === engine) return;
    setPendingKind(kind);
    setMessage(null);
    setFailed(false);
    const result = await saveModelEngine(kind, engine);
    setPendingKind(null);
    if (!result.ok) {
      setFailed(true);
      setMessage(result.message);
      return;
    }
    if (kind === "pick") setPick(result.engine);
    else setWeight(result.engine);
    setMessage(result.message);
  }

  return (
    <section className="rounded-[22px] bg-white px-5 py-2">
      <h2 className="pt-4 text-[17px] font-bold text-[#191f28]">모델</h2>
      <p className="mt-1 text-[13px] leading-5 text-[#8b95a1]">
        Spark는 이 서버에 연결된 Qwen{sparkModel ? ` (${sparkModel})` : ""}입니다. 비중 숫자는 국면 표와 우선으로 계산합니다.
      </p>
      <EngineRow
        label="Ai-추천 종목"
        hint="종목과 추천 이유를 이 모델로 받습니다. 모델을 바꾸면 다시 받기를 눌러야 새 목록이 나옵니다."
        value={pick}
        pending={pendingKind === "pick"}
        onChoose={(engine) => void choose("pick", engine)}
      />
      <EngineRow
        label="목표 비중"
        hint="이 계정이 목표 비중에 쓰는 모델입니다. 숫자 자체는 국면 표와 우선 한도 안에서 계산합니다."
        value={weight}
        pending={pendingKind === "weight"}
        onChoose={(engine) => void choose("weight", engine)}
      />
      {message ? <p className={`pb-4 text-[13px] font-medium ${failed ? "text-[#f04452]" : "text-[#3182f6]"}`}>{message}</p> : <div className="h-3" />}
    </section>
  );
}

function EngineRow({
  label,
  hint,
  value,
  pending,
  onChoose,
}: {
  label: string;
  hint: string;
  value: PickEngine;
  pending: boolean;
  onChoose: (engine: PickEngine) => void;
}) {
  return (
    <div className="border-b border-[#f2f4f6] py-4 last:border-b-0">
      <div className="flex items-center justify-between gap-3">
        <span className="text-[16px] font-semibold text-[#191f28]">{label}</span>
        <span className="flex shrink-0 gap-1.5">
          {ENGINES.map((engine) => {
            const on = value === engine;
            return (
              <button
                key={engine}
                type="button"
                aria-pressed={on}
                disabled={pending}
                onClick={() => onChoose(engine)}
                className={`rounded-full border px-3 py-1.5 text-[13px] font-semibold disabled:opacity-60 ${
                  on ? "border-[#3182f6] bg-[#e8f3ff] text-[#1b64da]" : "border-[#e5e8eb] bg-white text-[#4e5968]"
                }`}
              >
                {modelEngineLabel(engine)}
              </button>
            );
          })}
        </span>
      </div>
      <p className="mt-1 text-[12px] leading-5 text-[#8b95a1]">{hint}</p>
    </div>
  );
}
