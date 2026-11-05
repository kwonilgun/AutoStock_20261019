import type { StoredBooks } from "./books";
import type { Phase, PhaseSource, RebalanceResult, Sleeve } from "./types";

export type SnapshotPayload = {
  yearMonth: string;
  phase: Phase;
  phaseSource: PhaseSource;
  totalKrw: number;
  sleevesJson: string;
  targetsJson: string;
  linesJson: string;
  booksJson: string;
  incomeKrw: number;
};

export function buildSnapshotPayload(
  result: RebalanceResult,
  meta: { yearMonth: string; phase: Phase; phaseSource: PhaseSource },
  books: StoredBooks,
): SnapshotPayload {
  const targets: Partial<Record<Sleeve, number>> = {};
  for (const sleeve of result.sleeves) targets[sleeve.sleeve] = sleeve.targetWeight;
  return {
    yearMonth: meta.yearMonth,
    phase: meta.phase,
    phaseSource: meta.phaseSource,
    totalKrw: result.totalKrw,
    sleevesJson: JSON.stringify(result.sleeves),
    targetsJson: JSON.stringify(targets),
    linesJson: JSON.stringify({
      orders: result.orders,
      holds: result.holds,
      deferred: result.deferred,
      residualKrw: result.residualKrw,
      incomeTargetSleeve: result.incomeTargetSleeve,
    }),
    booksJson: JSON.stringify(books),
    incomeKrw: result.incomeKrw,
  };
}
