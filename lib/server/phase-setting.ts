import { prisma } from "@/lib/db";
import { PHASE_WEIGHTS } from "@/lib/engine/config";
import { parseWhyNotes, resolveWhyNotes, stringifyWhyNotes, type PhaseWhyNote } from "@/lib/engine/phase-why";
import { PHASES, SLEEVES, type Phase, type Sleeve, type WeightTable } from "@/lib/engine/types";

const ID = "global";

export type PhaseSettingView = {
  phase: Phase;
  weights: WeightTable;
  customized: Phase[];
  whys: Record<Phase, PhaseWhyNote>;
  whyCustomized: Phase[];
  updatedAt: Date | null;
};

function isPhase(value: string): value is Phase {
  return (PHASES as readonly string[]).includes(value);
}

export function parseOverrides(json: string): Partial<WeightTable> {
  if (!json) return {};
  try {
    const raw = JSON.parse(json) as Record<string, Record<string, unknown>>;
    const out: Partial<WeightTable> = {};
    for (const phase of PHASES) {
      const row = raw?.[phase];
      if (!row) continue;
      const weights = {} as Record<Sleeve, number>;
      let valid = true;
      for (const sleeve of SLEEVES) {
        const value = Number(row[sleeve]);
        if (!Number.isFinite(value) || value < 0) valid = false;
        weights[sleeve] = value;
      }
      if (valid) out[phase] = weights;
    }
    return out;
  } catch {
    return {};
  }
}

export async function getPhaseSetting(): Promise<PhaseSettingView> {
  const row = await prisma.phaseSetting.findUnique({ where: { id: ID } });
  const overrides = parseOverrides(row?.weightsJson ?? "");
  const whyNotes = parseWhyNotes(row?.whyJson ?? "");
  const weights = { ...PHASE_WEIGHTS };
  for (const phase of PHASES) {
    if (overrides[phase]) weights[phase] = overrides[phase];
  }
  return {
    phase: row && isPhase(row.phase) ? row.phase : "B1",
    weights,
    customized: PHASES.filter((phase) => overrides[phase] != null),
    whys: resolveWhyNotes(whyNotes),
    whyCustomized: PHASES.filter((phase) => whyNotes[phase] != null),
    updatedAt: row?.updatedAt ?? null,
  };
}

export async function currentWhyNotes() {
  const row = await prisma.phaseSetting.findUnique({ where: { id: ID } });
  return parseWhyNotes(row?.whyJson ?? "");
}

export async function savePhaseSetting(
  data: { phase?: Phase; overrides?: Partial<WeightTable>; whyNotes?: Partial<Record<Phase, PhaseWhyNote | null>> },
  updatedBy: string,
) {
  const weightsJson = data.overrides ? JSON.stringify(data.overrides) : undefined;
  const whyJson = data.whyNotes !== undefined ? stringifyWhyNotes(data.whyNotes) : undefined;
  const phase = data.phase;
  await prisma.$transaction([
    prisma.phaseSetting.upsert({
      where: { id: ID },
      create: { id: ID, phase: phase ?? "B1", weightsJson: weightsJson ?? "", whyJson: whyJson ?? "", updatedBy },
      update: {
        ...(phase ? { phase } : {}),
        ...(weightsJson != null ? { weightsJson } : {}),
        ...(whyJson != null ? { whyJson } : {}),
        updatedBy,
      },
    }),
    ...(phase
      ? [
          prisma.portfolio.updateMany({
            data: { phase, phaseSource: "admin" },
          }),
        ]
      : []),
  ]);
}
