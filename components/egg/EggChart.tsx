"use client";

import { useState, useTransition } from "react";
import { PhaseStory, PhaseWhy } from "@/components/egg/PhaseStory";
import { RateBoxes, type MarketRateView } from "@/components/home/MarketRates";
import { PHASE_META } from "@/lib/engine/config";
import { defaultWhyNote, type PhaseWhyNote } from "@/lib/engine/phase-why";
import { PHASES, type Phase } from "@/lib/engine/types";
import { adminSetPhase } from "@/lib/server/admin-actions";

const NODES: Record<Phase, { x: number; y: number }> = {
  A3: { x: 122, y: 100 },
  B1: { x: 198, y: 100 },
  A2: { x: 108, y: 172 },
  B2: { x: 212, y: 172 },
  A1: { x: 122, y: 244 },
  B3: { x: 198, y: 244 },
};

export function EggChart({
  phase,
  editable = false,
  rates = null,
  why = null,
}: {
  phase: Phase;
  editable?: boolean;
  rates?: MarketRateView | null;
  why?: PhaseWhyNote | null;
}) {
  const [message, setMessage] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const meta = PHASE_META[phase];

  function choose(next: Phase) {
    if (!editable || next === phase) return;
    setMessage(null);
    startTransition(async () => {
      const result = await adminSetPhase(next);
      if (!result.ok) setMessage(result.message);
    });
  }

  return (
    <section className="rounded-[22px] bg-white px-5 py-5">
      <p className="text-[13px] font-medium text-[#8b95a1]">
        지금 국면 · {phase} {meta.name}
      </p>
      

      <svg viewBox="0 0 320 340" className="mx-auto mt-3 w-full" role="img" aria-label={`${phase} 국면`}>
        <ellipse cx="160" cy="172" rx="108" ry="132" fill="#f9fafb" stroke="#191f28" strokeWidth="3" />
        <line x1="160" y1="48" x2="160" y2="296" stroke="#f04452" strokeWidth="2" />
        <line x1="62" y1="128" x2="258" y2="128" stroke="#d1d6db" strokeWidth="1.5" />
        <line x1="62" y1="216" x2="258" y2="216" stroke="#d1d6db" strokeWidth="1.5" />
        <text x="160" y="28" textAnchor="middle" fontSize="13" fill="#8b95a1">
          금리 정점
        </text>
        <text x="160" y="328" textAnchor="middle" fontSize="13" fill="#8b95a1">
          금리 저점
        </text>
        {PHASES.map((item) => {
          const node = NODES[item];
          const active = item === phase;
          return (
            <g key={item} onClick={editable ? () => choose(item) : undefined} className={editable ? "cursor-pointer" : undefined}>
              {active ? <circle cx={node.x} cy={node.y} r="26" fill="#dbeafe" /> : null}
              <circle cx={node.x} cy={node.y} r="20" fill="transparent" />
              <circle cx={node.x} cy={node.y} r="16" fill={active ? "#3182f6" : "#ffffff"} stroke={active ? "#3182f6" : "#191f28"} strokeWidth="2.5" />
              <text x={node.x} y={node.y + 5} textAnchor="middle" fontSize="13" fill={active ? "#ffffff" : "#191f28"} fontWeight="700">
                {item}
              </text>
            </g>
          );
        })}
      </svg>
      {/* <p className="text-center text-[13px] text-[#8b95a1]">
        {editable ? "달걀 위의 국면을 누르면 모든 사용자의 국면과 목표 비중이 바뀝니다" : "국면은 관리자가 지정합니다"}
      </p> */}

      {/* <h2 className="mt-1 text-[22px] font-bold leading-snug tracking-tight text-[#191f28]">{meta.headline}</h2> */}
      <div className="mt-2">
        <PhaseWhy note={why ?? defaultWhyNote(phase)} />
        <PhaseStory phase={phase} />
      </div>

      {rates ? <RateBoxes rates={rates} /> : null}
      {pending ? <p className="mt-3 text-[13px] text-[#8b95a1]">국면을 바꾸는 중입니다</p> : null}
      {message ? <p className="mt-3 text-[14px] font-medium text-[#f04452]">{message}</p> : null}
    </section>
  );
}
