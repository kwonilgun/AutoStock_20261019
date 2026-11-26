import { SLEEVE_LABEL, TRADE_BAND } from "./config";
import type { Sleeve, SleeveSnapshot } from "./types";

/** 괴리 화면에서 10년물과 30년물을 하나로 보는 묶음. */
export const BOND_GAP_ID = "BOND";

const BOND_SLEEVES: Sleeve[] = ["BOND_10Y", "BOND_30Y"];

export type GapView = {
  id: string;
  label: string;
  colorSleeve: Sleeve;
  currentKrw: number;
  currentWeight: number;
  targetWeight: number;
  targetKrw: number;
  gapPp: number;
  status: SleeveSnapshot["status"];
  guardNote: string | null;
  /** 국면 기준 비중. 내 목표와 다를 때만 화면에 적는다. */
  baseWeight?: number;
};

function weightBp(weight: number): number {
  return Math.round(weight * 10000);
}

function bandBp(): number {
  return Math.round(TRADE_BAND * 10000);
}

export function sleeveStatus(currentWeight: number, targetWeight: number): SleeveSnapshot["status"] {
  const delta = Math.abs(weightBp(currentWeight) - weightBp(targetWeight));
  if (delta < bandBp()) return delta === 0 ? "match" : "hold";
  return currentWeight > targetWeight ? "over" : "under";
}

function isBondSleeve(sleeve: Sleeve): boolean {
  return BOND_SLEEVES.includes(sleeve);
}

function bondParts(sleeves: SleeveSnapshot[]): SleeveSnapshot[] {
  return BOND_SLEEVES.map((sleeve) => sleeves.find((item) => item.sleeve === sleeve)).filter(
    (item): item is SleeveSnapshot => item != null,
  );
}

function formatGap(gapPp: number): string {
  const rounded = Math.round(gapPp * 10) / 10;
  const sign = rounded > 0 ? "+" : "";
  return `${sign}${rounded}%p`;
}

/** 채권 합이 ±2%p 안이면 10년물·30년물 매매를 멈추고, 괴리 한 줄로 남긴다. */
export function settleBondGap(sleeves: SleeveSnapshot[]): {
  sleeves: SleeveSnapshot[];
  grouped: boolean;
  hold: { sleeve: Sleeve; gapPp: number; reason: string } | null;
} {
  const parts = bondParts(sleeves);
  if (parts.length < 2) return { sleeves, grouped: false, hold: null };
  const currentWeight = parts.reduce((sum, part) => sum + part.currentWeight, 0);
  const targetWeight = parts.reduce((sum, part) => sum + part.targetWeight, 0);
  const status = sleeveStatus(currentWeight, targetWeight);
  if (status === "over" || status === "under") return { sleeves, grouped: false, hold: null };
  const gapPp = (currentWeight - targetWeight) * 100;
  return {
    grouped: true,
    sleeves: sleeves.map((sleeve) => {
      if (!isBondSleeve(sleeve.sleeve)) return sleeve;
      return { ...sleeve, status, tradeKrw: 0 };
    }),
    hold:
      status === "hold"
        ? { sleeve: "BOND_30Y", gapPp, reason: `채권 · 괴리 ${formatGap(gapPp)} · 기준 ±2%p 안쪽` }
        : null,
  };
}

export function gapViews(sleeves: SleeveSnapshot[]): GapView[] {
  const parts = bondParts(sleeves);
  let placed = false;
  const views: GapView[] = [];
  for (const sleeve of sleeves) {
    if (sleeve.sleeve === "FUND") continue;
    if (isBondSleeve(sleeve.sleeve)) {
      if (!placed && parts.length > 0) {
        views.push(combineBonds(parts));
        placed = true;
      }
      continue;
    }
    views.push({
      id: sleeve.sleeve,
      label: SLEEVE_LABEL[sleeve.sleeve],
      colorSleeve: sleeve.sleeve,
      currentKrw: sleeve.currentKrw,
      currentWeight: sleeve.currentWeight,
      targetWeight: sleeve.targetWeight,
      targetKrw: sleeve.targetKrw,
      gapPp: sleeve.gapPp,
      status: sleeve.status,
      guardNote: sleeve.guardNote,
    });
  }
  return views;
}

function combineBonds(parts: SleeveSnapshot[]): GapView {
  const currentKrw = parts.reduce((sum, part) => sum + part.currentKrw, 0);
  const currentWeight = parts.reduce((sum, part) => sum + part.currentWeight, 0);
  const targetWeight = parts.reduce((sum, part) => sum + part.targetWeight, 0);
  const targetKrw = parts.reduce((sum, part) => sum + part.targetKrw, 0);
  const notes = [...new Set(parts.map((part) => part.guardNote).filter((note): note is string => Boolean(note)))];
  return {
    id: BOND_GAP_ID,
    label: "채권",
    colorSleeve: "BOND_30Y",
    currentKrw,
    currentWeight,
    targetWeight,
    targetKrw,
    gapPp: (currentWeight - targetWeight) * 100,
    status: sleeveStatus(currentWeight, targetWeight),
    guardNote: notes[0] ?? null,
  };
}

/** 과다·부족을 매기는 단위. 안의 종목은 비중만 보여주고 판단은 이 합계로 한다. */
export const GAP_BUCKETS: { label: string; sleeves: Sleeve[] }[] = [
  { label: "주식", sleeves: ["US_EQUITY", "KR_EQUITY"] },
  { label: "채권", sleeves: ["BOND_10Y", "BOND_30Y"] },
  { label: "자산", sleeves: ["GOLD", "BTC", "REIT"] },
  { label: "현금", sleeves: ["KRW_CASH", "USD_CASH"] },
];

export type GapBucket = {
  label: string;
  summary: GapView;
  members: GapView[];
};

/** 주식·채권·자산·현금 합계로 과다·부족을 판단한다. 비트코인은 보유와 목표가 없으면 목록에서 뺀다. */
export function gapBuckets(sleeves: SleeveSnapshot[], baseTargets?: Partial<Record<Sleeve, number>>): GapBucket[] {
  const bySleeve = new Map(sleeves.map((item) => [item.sleeve, item]));
  return GAP_BUCKETS.flatMap((bucket) => {
    const members = bucket.sleeves.flatMap((sleeve) => {
      const snapshot = bySleeve.get(sleeve);
      if (!snapshot) return [];
      if (sleeve === "BTC" && snapshot.currentKrw <= 0 && snapshot.targetWeight <= 0) return [];
      return [toGapView(snapshot, baseTargets?.[sleeve])];
    });
    if (members.length === 0) return [];
    return [{ label: bucket.label, summary: combineGap(bucket.label, bucket.sleeves[0], members), members }];
  });
}

function toGapView(sleeve: SleeveSnapshot, baseWeight?: number): GapView {
  return {
    id: sleeve.sleeve,
    label: SLEEVE_LABEL[sleeve.sleeve],
    colorSleeve: sleeve.sleeve,
    currentKrw: sleeve.currentKrw,
    currentWeight: sleeve.currentWeight,
    targetWeight: sleeve.targetWeight,
    targetKrw: sleeve.targetKrw,
    gapPp: sleeve.gapPp,
    status: sleeveStatus(sleeve.currentWeight, sleeve.targetWeight),
    guardNote: sleeve.guardNote,
    ...(baseWeight == null ? {} : { baseWeight }),
  };
}

function combineGap(label: string, colorSleeve: Sleeve, parts: GapView[]): GapView {
  const currentKrw = parts.reduce((sum, part) => sum + part.currentKrw, 0);
  const currentWeight = parts.reduce((sum, part) => sum + part.currentWeight, 0);
  const targetWeight = parts.reduce((sum, part) => sum + part.targetWeight, 0);
  const targetKrw = parts.reduce((sum, part) => sum + part.targetKrw, 0);
  const hasBase = parts.some((part) => part.baseWeight != null);
  return {
    id: label,
    label,
    colorSleeve,
    currentKrw,
    currentWeight,
    targetWeight,
    targetKrw,
    gapPp: (currentWeight - targetWeight) * 100,
    status: sleeveStatus(currentWeight, targetWeight),
    guardNote: null,
    ...(hasBase ? { baseWeight: parts.reduce((sum, part) => sum + (part.baseWeight ?? 0), 0) } : {}),
  };
}
