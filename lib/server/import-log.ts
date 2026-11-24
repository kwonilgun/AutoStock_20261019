"use server";

function clip(value: unknown, limit: number): string {
  if (typeof value !== "string") return "";
  return value.trim().slice(0, limit);
}

function redact(value: string): string {
  return value
    .replace(/sk-ant-[A-Za-z0-9_\-]+/g, "sk-ant-…")
    .replace(/sk-[A-Za-z0-9_\-]+/g, "sk-…")
    .replace(/wrkspc_[A-Za-z0-9]+/g, "wrkspc_…")
    .replace(/\d{10,}/g, "[숫자]");
}

function importLine(input: unknown) {
  const entry = input && typeof input === "object" ? (input as Record<string, unknown>) : {};
  return {
    step: clip(entry.step, 80) || "unknown",
    ok: entry.ok === true,
    message: redact(clip(entry.message, 800)),
    status: typeof entry.status === "number" && Number.isFinite(entry.status) ? entry.status : null,
    detail: redact(clip(entry.detail, 160)),
  };
}

function logImport(label: string, input: unknown): void {
  const line = importLine(input);
  if (line.ok) return;
  console.log(`[${label}] ${line.step} ${line.message || line.detail || "fail"}`);
}

/** 보유 가져오기 실패만 남긴다. API 키와 긴 숫자는 지운다. */
export async function logHoldingImport(input: unknown): Promise<void> {
  logImport("holdings-import", input);
}

/** 수익 이미지 가져오기 실패만 남긴다. API 키와 긴 숫자는 지운다. */
export async function logIncomeImport(input: unknown): Promise<void> {
  logImport("income-import", input);
}
