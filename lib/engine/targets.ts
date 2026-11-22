import { GUARDRAIL_MAX, GUARDRAIL_MIN, PHASE_WEIGHTS, SLEEVE_LABEL } from "./config";
import type { PickAim } from "./pick-prefs";
import { SLEEVES, type Phase, type Sleeve, type WeightTable } from "./types";

type Group = {
  id: string;
  sleeves: Sleeve[];
  min: number;
  max: number;
};

const GROUPS: Group[] = [
  { id: "equity", sleeves: ["KR_EQUITY", "US_EQUITY"], min: GUARDRAIL_MIN, max: GUARDRAIL_MAX },
  { id: "bond", sleeves: ["BOND_10Y", "BOND_30Y"], min: GUARDRAIL_MIN, max: GUARDRAIL_MAX },
  { id: "gold", sleeves: ["GOLD"], min: GUARDRAIL_MIN, max: GUARDRAIL_MAX },
  { id: "btc", sleeves: ["BTC"], min: GUARDRAIL_MIN, max: GUARDRAIL_MAX },
  { id: "reit", sleeves: ["REIT"], min: GUARDRAIL_MIN, max: GUARDRAIL_MAX },
  { id: "fund", sleeves: ["FUND"], min: GUARDRAIL_MIN, max: GUARDRAIL_MAX },
  { id: "krw", sleeves: ["KRW_CASH"], min: GUARDRAIL_MIN, max: GUARDRAIL_MAX },
  { id: "usd", sleeves: ["USD_CASH"], min: GUARDRAIL_MIN, max: GUARDRAIL_MAX },
];

const EPS = 1e-9;

function cloneWeights(weights: Record<Sleeve, number>): Record<Sleeve, number> {
  return { ...weights };
}

function groupSum(weights: Record<Sleeve, number>, sleeves: Sleeve[]): number {
  return sleeves.reduce((sum, sleeve) => sum + weights[sleeve], 0);
}

function intraRatios(input: Record<Sleeve, number>, sleeves: Sleeve[]): number[] {
  const current = groupSum(input, sleeves);
  if (current <= EPS) return sleeves.map(() => 1 / sleeves.length);
  return sleeves.map((sleeve) => input[sleeve] / current);
}

export function applyGuardrail(input: Record<Sleeve, number>): {
  weights: Record<Sleeve, number>;
  notes: Partial<Record<Sleeve, string>>;
} {
  const initialSum = SLEEVES.reduce((sum, sleeve) => sum + input[sleeve], 0);
  const alreadyInside =
    Math.abs(initialSum - 1) < 1e-8 &&
    GROUPS.every((group) => {
      const value = groupSum(input, group.sleeves);
      return value <= group.max + 1e-8 && value >= group.min - 1e-8;
    });
  if (alreadyInside) return { weights: cloneWeights(input), notes: {} };

  const ratios = new Map(GROUPS.map((group) => [group.id, intraRatios(input, group.sleeves)]));
  const state = GROUPS.map((group) => ({
    ...group,
    value: groupSum(input, group.sleeves),
    locked: null as "min" | "max" | null,
  }));

  for (let iter = 0; iter < GROUPS.length + 2; iter += 1) {
    let clamped = false;
    for (const group of state) {
      if (group.locked) continue;
      if (group.value > group.max + 1e-8) {
        group.value = group.max;
        group.locked = "max";
        clamped = true;
      } else if (group.value < group.min - 1e-8) {
        group.value = group.min;
        group.locked = "min";
        clamped = true;
      }
    }
    const lockedSum = state.filter((group) => group.locked).reduce((sum, group) => sum + group.value, 0);
    const free = state.filter((group) => !group.locked);
    const freeSum = free.reduce((sum, group) => sum + group.value, 0);
    const targetFree = 1 - lockedSum;
    if (free.length > 0) {
      if (freeSum <= EPS) {
        const each = targetFree / free.length;
        for (const group of free) group.value = each;
      } else {
        const factor = targetFree / freeSum;
        for (const group of free) group.value *= factor;
      }
    }
    const stillOut = state.some(
      (group) => !group.locked && (group.value > group.max + 1e-8 || group.value < group.min - 1e-8),
    );
    if (!clamped && !stillOut) break;
  }

  const weights = cloneWeights(input);
  for (const group of state) {
    const ratio = ratios.get(group.id) ?? group.sleeves.map(() => 1 / group.sleeves.length);
    group.sleeves.forEach((sleeve, index) => {
      weights[sleeve] = group.value * ratio[index];
    });
  }

  const notes: Partial<Record<Sleeve, string>> = {};
  for (const group of state) {
    if (group.locked === "max") {
      for (const sleeve of group.sleeves) notes[sleeve] = `상한 ${Math.round(group.max * 100)}%로 조정됨`;
    } else if (group.locked === "min") {
      for (const sleeve of group.sleeves) notes[sleeve] = `하한 ${Math.round(group.min * 100)}%로 조정됨`;
    }
  }
  return { weights, notes };
}

export function targetWeights(
  phase: Phase,
  table: WeightTable = PHASE_WEIGHTS,
): {
  weights: Record<Sleeve, number>;
  notes: Partial<Record<Sleeve, string>>;
} {
  return applyGuardrail(table[phase]);
}

/** 국면 위험자산(한국주식·미국주식·부동산)을 우선에 따라 기울일 때 쓰는 배수. */
const PERSONAL_FACTOR = { payout: 0.75, price: 1.15 } as const;
const PERSONAL_RISK: Sleeve[] = ["KR_EQUITY", "US_EQUITY", "REIT"];
const PERSONAL_CASH: Sleeve[] = ["KRW_CASH", "USD_CASH"];
/** 성향이 국면 위험자산 합계에서 움직일 수 있는 최대 폭. */
const PERSONAL_BAND = 0.1;

/**
 * 국면 목표를 우선으로 기울인다.
 * 배당·이자 우선은 위험자산을 75%로, 가격 상승 우선은 115%로 두고 차액은 현금으로 오간다.
 * 둘 다와 아직 고르지 않은 경우는 국면 표 그대로다.
 * 채권, 금, 0% 칸은 그대로 두고, ±10%p와 그룹 상한 60% 안에서만 움직인다.
 */
export function applyPersonalTilt(
  base: Record<Sleeve, number>,
  aim: PickAim | null | undefined,
): Record<Sleeve, number> {
  const weights = cloneWeights(base);
  if (aim !== "payout" && aim !== "price") return weights;

  const risk = PERSONAL_RISK.filter((sleeve) => weights[sleeve] > EPS);
  const cash = PERSONAL_CASH.filter((sleeve) => weights[sleeve] > EPS);
  const riskSum = groupSum(weights, risk);
  const cashSum = groupSum(weights, cash);
  if (riskSum <= EPS || cashSum <= EPS) return weights;

  let desired = riskSum * PERSONAL_FACTOR[aim];
  desired = Math.min(riskSum + PERSONAL_BAND, Math.max(riskSum - PERSONAL_BAND, desired));
  if (desired > riskSum) {
    let scaleCap = (riskSum + cashSum) / riskSum;
    const equity = weights.KR_EQUITY + weights.US_EQUITY;
    if (equity > EPS) scaleCap = Math.min(scaleCap, GUARDRAIL_MAX / equity);
    if (weights.REIT > EPS) scaleCap = Math.min(scaleCap, GUARDRAIL_MAX / weights.REIT);
    desired = Math.min(desired, riskSum * scaleCap);
  }

  const scale = desired / riskSum;
  for (const sleeve of risk) weights[sleeve] = base[sleeve] * scale;
  const moved = riskSum - groupSum(weights, risk);
  const nextCash = cash.map((sleeve) => base[sleeve] + moved * (base[sleeve] / cashSum));
  if (moved > 0) {
    let overflow = 0;
    for (let index = 0; index < nextCash.length; index += 1) {
      if (nextCash[index] > GUARDRAIL_MAX) {
        overflow += nextCash[index] - GUARDRAIL_MAX;
        nextCash[index] = GUARDRAIL_MAX;
      }
    }
    if (overflow > EPS) {
      const room = nextCash.map((value) => Math.max(0, GUARDRAIL_MAX - value));
      const roomSum = room.reduce((sum, value) => sum + value, 0);
      if (roomSum > EPS) {
        const place = Math.min(overflow, roomSum);
        for (let index = 0; index < nextCash.length; index += 1) nextCash[index] += (place * room[index]) / roomSum;
        overflow -= place;
      }
      if (overflow > EPS) {
        const now = groupSum(weights, risk);
        for (const sleeve of risk) weights[sleeve] += overflow * (weights[sleeve] / now);
      }
    }
  }
  cash.forEach((sleeve, index) => {
    weights[sleeve] = Math.max(0, nextCash[index]);
  });

  const drift = SLEEVES.reduce((sum, sleeve) => sum + weights[sleeve], 0) - 1;
  if (Math.abs(drift) > 1e-12) {
    const host = cash.reduce((best, sleeve) => (weights[sleeve] > weights[best] ? sleeve : best), cash[0]);
    weights[host] -= drift;
  }
  return weights;
}

/** 관리자 입력을 검사한다. 합이 100%가 아니거나 상한을 넘으면 안내 문구를 돌려준다. */
export function weightProblem(weights: Record<Sleeve, number>): string | null {
  const sum = SLEEVES.reduce((total, sleeve) => total + weights[sleeve], 0);
  if (Math.abs(sum - 1) > 1e-6) return `합계가 ${Math.round(sum * 1000) / 10}%입니다. 100%로 맞춰 주세요.`;
  for (const group of GROUPS) {
    const value = groupSum(weights, group.sleeves);
    if (value > group.max + 1e-8) {
      return `${group.sleeves.map((sleeve) => SLEEVE_LABEL[sleeve]).join("+")} 비중이 상한 ${Math.round(group.max * 100)}%를 넘습니다.`;
    }
  }
  return null;
}

export function stockWeight(weights: Record<Sleeve, number>): number {
  return weights.KR_EQUITY + weights.US_EQUITY;
}
