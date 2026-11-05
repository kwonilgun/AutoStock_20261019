import type { Phase } from "./types";

export type RateZone = "HIGH" | "MID" | "LOW";
export type RateDirection = "UP" | "DOWN" | "FLAT";
export type EquityTrend = "RISK_ON" | "RISK_OFF";

export type DiagnoseInput = {
  rateZone: RateZone;
  rateDirection: RateDirection;
  equity: EquityTrend;
  previousPhase: Phase | null;
};

export type DiagnoseResult = {
  phase: Phase | null;
  ruleId: number | null;
  summary: string;
};

/** 2단계 자동 국면 규칙의 자리. 1단계에서는 국면을 만들지 않는다. */
export function diagnosePhase(_input: DiagnoseInput): DiagnoseResult {
  return {
    phase: null,
    ruleId: null,
    summary: "",
  };
}
