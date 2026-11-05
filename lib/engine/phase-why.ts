import { PHASE_STORY } from "./phase-story";
import { PHASES, type Phase } from "./types";

export type PhaseWhySection = {
  title: string;
  body: string;
};

export type PhaseWhyNote = {
  when: string;
  lead: string;
  sections: PhaseWhySection[];
  close: string;
};

const EMPTY_SECTIONS: PhaseWhySection[] = [
  { title: "금리", body: "" },
  { title: "경기", body: "" },
  { title: "시장", body: "" },
];

const A3_DEFAULT: PhaseWhyNote = {
  when: "2026년 11월 4일 · 연준과 시장",
  lead: "금리가 오르는 쪽의 마지막 칸입니다. 경기는 강하고, 물가는 목표 위이며, 주가는 그 호재를 이미 반영했습니다.",
  sections: [
    {
      title: "금리",
      body: "기준금리 3.75~4.00%. 9월에 올렸고 10월에는 유지했으며, 반대 두 표는 추가 인상이었습니다. 전망 중간값은 4.1%로, 이번 순환의 고점 직전입니다.",
    },
    {
      title: "경기",
      body: "물가 3.7%, 에너지 제외 2.6%. 실업률 4.2%. 연준은 경기를 강한 확장으로 봤습니다.",
    },
    {
      title: "시장",
      body: "S&P 500은 7,569. 10년물 4.90%, 2년물 4.55%로 장단기는 플러스입니다. 금은 온스당 3,900달러대. 좋은 소식이 이미 가격에 들어 있습니다.",
    },
  ],
  close:
    "주식은 미국 20%·한국 10%만 남기고, 달러 20%·원화 15%·금 15%, 30년물 5%를 둡니다. 금리가 내려오고 실적이 꺾이면 B1에서 장기채를 늘립니다.",
};

export function defaultWhyNote(phase: Phase): PhaseWhyNote {
  if (phase === "A3") return structuredClone(A3_DEFAULT);
  return {
    when: "",
    lead: PHASE_STORY[phase].why,
    sections: EMPTY_SECTIONS.map((section) => ({ ...section })),
    close: "",
  };
}

function cleanSection(value: unknown): PhaseWhySection | null {
  if (!value || typeof value !== "object") return null;
  const row = value as { title?: unknown; body?: unknown };
  const title = typeof row.title === "string" ? row.title.trim() : "";
  const body = typeof row.body === "string" ? row.body.trim() : "";
  if (!title && !body) return null;
  return { title, body };
}

export function parseWhyNote(value: unknown): PhaseWhyNote | null {
  if (!value || typeof value !== "object") return null;
  const row = value as { when?: unknown; lead?: unknown; sections?: unknown; close?: unknown };
  const lead = typeof row.lead === "string" ? row.lead.trim() : "";
  const when = typeof row.when === "string" ? row.when.trim() : "";
  const close = typeof row.close === "string" ? row.close.trim() : "";
  const sections = Array.isArray(row.sections) ? row.sections.flatMap((item) => {
    const section = cleanSection(item);
    return section ? [section] : [];
  }) : [];
  if (!lead && !when && !close && sections.length === 0) return null;
  return { when, lead, sections, close };
}

export function parseWhyNotes(json: string): Partial<Record<Phase, PhaseWhyNote>> {
  if (!json) return {};
  try {
    const raw = JSON.parse(json) as Record<string, unknown>;
    const out: Partial<Record<Phase, PhaseWhyNote>> = {};
    for (const phase of PHASES) {
      const note = parseWhyNote(raw?.[phase]);
      if (note) out[phase] = note;
    }
    return out;
  } catch {
    return {};
  }
}

export function resolveWhyNotes(custom: Partial<Record<Phase, PhaseWhyNote>>): Record<Phase, PhaseWhyNote> {
  return Object.fromEntries(PHASES.map((phase) => [phase, custom[phase] ?? defaultWhyNote(phase)])) as Record<Phase, PhaseWhyNote>;
}

export function stringifyWhyNotes(notes: Partial<Record<Phase, PhaseWhyNote | null>>): string {
  const out: Record<string, PhaseWhyNote> = {};
  for (const phase of PHASES) {
    const note = notes[phase];
    if (note) out[phase] = note;
  }
  return Object.keys(out).length === 0 ? "" : JSON.stringify(out);
}

export function filledWhySections(note: PhaseWhyNote): PhaseWhySection[] {
  return note.sections.filter((section) => section.body);
}

export function whyHasDetail(note: PhaseWhyNote): boolean {
  return Boolean(note.when || note.close || filledWhySections(note).length > 0);
}
