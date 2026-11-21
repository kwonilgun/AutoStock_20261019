export const PICK_DISABLED_MESSAGE = "이 기능을 사용을 원하면 관리자에게 요청하세요";

export const PICK_LIMIT_MESSAGE = "추천 횟수를 모두 사용했습니다. 더 받으려면 관리자에게 요청해 주세요.";

export type PickQuota = { limit: number; used: number };

export const PICK_ENGINES = ["spark", "claude"] as const;

export type PickEngine = (typeof PICK_ENGINES)[number];

/** 예전에 저장된 추천. 엔진이 비어 있으면 그때 기본이던 Claude로 읽는다. */
export function parsePickEngine(value: string | null | undefined): PickEngine {
  return value === "spark" ? "spark" : "claude";
}

/** 관리자가 사용자에게 지정한 추천 모델. 비어 있거나 알 수 없으면 Spark다. */
export function assignedPickEngine(value: string | null | undefined): PickEngine {
  return value === "claude" ? "claude" : "spark";
}

/** 화면에 보여줄 저장본. Claude 키가 없으면 Claude 배정이어도 Spark 저장본을 그대로 보여 준다. */
export function pickVisibleCache<T extends { engine: PickEngine }>(
  saved: T | null,
  engine: PickEngine,
  claudeReady: boolean,
): T | null {
  if (!saved) return null;
  if (saved.engine === engine) return saved;
  if (engine === "claude" && !claudeReady && saved.engine === "spark") return saved;
  return null;
}
