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

/** 보유 가져오기 실패 원인. npm run dev 터미널에만 남기고, API 키와 긴 숫자는 지운다. */
export async function logHoldingImport(input: unknown): Promise<void> {
  const entry = input && typeof input === "object" ? (input as Record<string, unknown>) : {};
  const line = {
    step: clip(entry.step, 80) || "unknown",
    ok: entry.ok === true,
    message: redact(clip(entry.message, 800)),
    status: typeof entry.status === "number" && Number.isFinite(entry.status) ? entry.status : null,
    detail: redact(clip(entry.detail, 4000)),
  };
  console.log(`[holdings-import] ${JSON.stringify(line)}`);
}
