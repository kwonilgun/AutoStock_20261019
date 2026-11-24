import { redactHoldingsSecret } from "@/lib/holdings-import";

function clip(value: unknown, limit: number): string {
  if (typeof value !== "string") return "";
  return value.trim().slice(0, limit);
}

function redact(value: string): string {
  return redactHoldingsSecret(value).replace(/\d{10,}/g, "[숫자]");
}

const QUIET_STEPS = new Set(["prepare", "finish", "page", "panel", "spark", "claude"]);

/** 실패한 추천 단계만 한 줄로 남긴다. 성공 과정의 본문과 중간 단계는 찍지 않는다. */
export function pickLogText(input: unknown): string {
  const entry = input && typeof input === "object" ? (input as Record<string, unknown>) : {};
  const step = clip(entry.step, 40) || "unknown";
  if (QUIET_STEPS.has(step) && entry.ok !== false) return "";
  if (entry.kind === "assigned" || entry.kind === "cached" || entry.kind === "request") return "";
  const line: Record<string, unknown> = { step };
  if (typeof entry.ok === "boolean") line.ok = entry.ok;
  const kind = clip(entry.kind, 40);
  if (kind) line.kind = kind;
  const message = redact(clip(entry.message, 160));
  if (message) line.message = message;
  const detail = redact(clip(entry.detail, 160));
  if (detail) line.detail = detail;
  return `[pick] ${JSON.stringify(line)}`;
}

export function logPickLine(input: unknown): void {
  const text = pickLogText(input);
  if (text) console.log(text);
}

export function pickErrorDetail(error: unknown): string {
  if (!(error instanceof Error)) return "";
  const cause = error.cause;
  const causeName = cause instanceof Error ? cause.name : "";
  const causeMessage = cause instanceof Error ? cause.message : "";
  const code = cause && typeof cause === "object" && "code" in cause ? String((cause as { code?: unknown }).code ?? "") : "";
  const extra = [code && `code:${code}`, causeName && `${causeName}: ${causeMessage}`].filter(Boolean).join(" ");
  return redact(`${error.name}: ${error.message}${extra ? ` ${extra}` : ""}`).slice(0, 1500);
}
