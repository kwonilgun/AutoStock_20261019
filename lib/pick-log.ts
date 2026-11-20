import { redactHoldingsSecret } from "@/lib/holdings-import";

function clip(value: unknown, limit: number): string {
  if (typeof value !== "string") return "";
  return value.trim().slice(0, limit);
}

function redact(value: string): string {
  return redactHoldingsSecret(value).replace(/\d{10,}/g, "[숫자]");
}

function sleeves(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const rows = value.map((item) => clip(item, 20)).filter(Boolean);
  return rows.length > 0 ? rows.slice(0, 12) : undefined;
}

/** 추천 종목 한 단계. 키와 워크스페이스 ID는 넣지 않는다. */
export function pickLogText(input: unknown): string {
  const entry = input && typeof input === "object" ? (input as Record<string, unknown>) : {};
  const line: Record<string, unknown> = {
    step: clip(entry.step, 40) || "unknown",
  };
  if (entry.refresh === true || entry.refresh === false) line.refresh = entry.refresh;
  if (typeof entry.ok === "boolean") line.ok = entry.ok;
  const kind = clip(entry.kind, 40);
  if (kind) line.kind = kind;
  const message = redact(clip(entry.message, 400));
  if (message) line.message = message;
  if (typeof entry.buys === "number" && Number.isFinite(entry.buys)) line.buys = entry.buys;
  const names = sleeves(entry.sleeves);
  if (names) line.sleeves = names;
  if (typeof entry.items === "number" && Number.isFinite(entry.items)) line.items = entry.items;
  const model = clip(entry.model, 80);
  if (model) line.model = model;
  if (typeof entry.chars === "number" && Number.isFinite(entry.chars)) line.chars = entry.chars;
  if (typeof entry.hasKey === "boolean") line.hasKey = entry.hasKey;
  if (typeof entry.hasWorkspace === "boolean") line.hasWorkspace = entry.hasWorkspace;
  const detail = redact(clip(entry.detail, 1500));
  if (detail) line.detail = detail;
  return `[pick] ${JSON.stringify(line)}`;
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
