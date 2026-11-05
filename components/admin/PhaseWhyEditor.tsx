"use client";

import { useState, useTransition } from "react";
import { PHASE_META } from "@/lib/engine/config";
import type { PhaseWhyNote, PhaseWhySection } from "@/lib/engine/phase-why";
import { PHASES, type Phase } from "@/lib/engine/types";
import { adminResetPhaseWhy, adminSavePhaseWhy } from "@/lib/server/admin-actions";

type Notice = { ok: boolean; text: string } | null;

export function PhaseWhyEditor({
  notes,
  customized,
  activePhase,
}: {
  notes: Record<Phase, PhaseWhyNote>;
  customized: Phase[];
  activePhase: Phase;
}) {
  const [selected, setSelected] = useState<Phase>(activePhase);
  const [message, setMessage] = useState<Notice>(null);

  return (
    <section className="rounded-[22px] bg-white px-5 py-5">
      <h2 className="text-[17px] font-bold text-[#191f28]">왜 이 국면인가요</h2>
      <p className="mt-1 text-[13px] leading-5 text-[#8b95a1]">
        저장하면 홈 화면의 같은 칸에 바로 보입니다. 날짜·금리·경기·시장은 비워 두면 본문만 보여 줍니다.
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
      <WhyForm
        key={`${selected}:${JSON.stringify(notes[selected])}`}
        phase={selected}
        note={notes[selected]}
        customized={customized.includes(selected)}
        onNotice={setMessage}
      />
      {message ? (
        <p className={`mt-3 text-[14px] font-medium ${message.ok ? "text-[#3182f6]" : "text-[#f04452]"}`}>{message.text}</p>
      ) : null}
    </section>
  );
}

function WhyForm({
  phase,
  note,
  customized,
  onNotice: setMessage,
}: {
  phase: Phase;
  note: PhaseWhyNote;
  customized: boolean;
  onNotice: (notice: Notice) => void;
}) {
  const [when, setWhen] = useState(note.when);
  const [lead, setLead] = useState(note.lead);
  const [sections, setSections] = useState<PhaseWhySection[]>(() =>
    note.sections.length > 0 ? note.sections : [{ title: "", body: "" }],
  );
  const [close, setClose] = useState(note.close);
  const [pending, startTransition] = useTransition();

  function updateSection(index: number, field: keyof PhaseWhySection, value: string) {
    setSections((current) => current.map((section, i) => (i === index ? { ...section, [field]: value } : section)));
  }

  function save() {
    setMessage(null);
    startTransition(async () => {
      const result = await adminSavePhaseWhy(phase, { when, lead, sections, close });
      setMessage({ ok: result.ok, text: result.message ?? "저장했습니다." });
    });
  }

  function reset() {
    setMessage(null);
    startTransition(async () => {
      const result = await adminResetPhaseWhy(phase);
      setMessage({ ok: result.ok, text: result.message ?? "되돌렸습니다." });
    });
  }

  return (
    <div className="mt-4 grid gap-3">
      <p className="text-[13px] text-[#8b95a1]">
        {phase} {PHASE_META[phase].name} · {customized ? "관리자 수정값" : "기본문"}
      </p>
      <label className="grid gap-1">
        <span className="text-[13px] font-medium text-[#8b95a1]">날짜·출처</span>
        <input
          value={when}
          onChange={(event) => setWhen(event.target.value)}
          placeholder="2026년 11월 4일 · 연준과 시장"
          className="w-full rounded-lg border border-[#e5e8eb] px-3 py-2 text-[15px]"
        />
      </label>
      <label className="grid gap-1">
        <span className="text-[13px] font-medium text-[#8b95a1]">본문</span>
        <textarea
          rows={4}
          value={lead}
          onChange={(event) => setLead(event.target.value)}
          placeholder="왜 이 국면인지 적어 주세요."
          className="w-full resize-y rounded-lg border border-[#e5e8eb] px-3 py-2 text-[15px] leading-6"
        />
      </label>
      {sections.map((section, index) => (
        <div key={index} className="grid gap-1">
          <span className="text-[13px] font-medium text-[#8b95a1]">칸 {index + 1}</span>
          <input
            value={section.title}
            onChange={(event) => updateSection(index, "title", event.target.value)}
            placeholder="금리"
            className="w-full rounded-lg border border-[#e5e8eb] px-3 py-2 text-[15px] font-semibold"
          />
          <textarea
            rows={3}
            value={section.body}
            onChange={(event) => updateSection(index, "body", event.target.value)}
            placeholder="이 칸의 설명을 적어 주세요."
            className="w-full resize-y rounded-lg border border-[#e5e8eb] px-3 py-2 text-[14px] leading-6"
          />
        </div>
      ))}
      <label className="grid gap-1">
        <span className="text-[13px] font-medium text-[#8b95a1]">맺음말</span>
        <textarea
          rows={3}
          value={close}
          onChange={(event) => setClose(event.target.value)}
          placeholder="비중을 어떻게 둘지 한 줄로 적어 주세요."
          className="w-full resize-y rounded-lg border border-[#e5e8eb] px-3 py-2 text-[15px] leading-6"
        />
      </label>
      <div className="mt-1 flex gap-2">
        <button
          type="button"
          onClick={save}
          disabled={pending}
          className="flex-1 rounded-xl bg-[#3182f6] py-3 text-[15px] font-semibold text-white disabled:opacity-40"
        >
          {pending ? "저장 중" : `${phase} 설명 저장`}
        </button>
        <button
          type="button"
          onClick={reset}
          disabled={pending || !customized}
          className="rounded-xl bg-[#f2f4f6] px-4 py-3 text-[15px] font-semibold text-[#4e5968] disabled:opacity-40"
        >
          기본문으로
        </button>
      </div>
    </div>
  );
}
