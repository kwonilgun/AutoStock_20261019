import { redactHoldingsSecret, type HoldingImageType } from "@/lib/holdings-import";
import { incomeImageClaudeBody, parseImportedIncomes, type ImportedIncome } from "@/lib/income-import";
import { extractClaudeImageRows, type ClaudeImageRows, type ClaudeImageTrace } from "@/lib/holdings-paste";
import { logIncomeImport } from "@/lib/server/import-log";

type PreparedImage = { mediaType: HoldingImageType; data: string };

export type IncomeImageResult = { ok: true; incomes: ImportedIncome[]; workspaceId: string } | { ok: false; message: string };

function clip(value: string, limit: number): string {
  return value.trim().slice(0, limit);
}

function redact(value: string): string {
  return redactHoldingsSecret(value).replace(/\d{10,}/g, "[숫자]");
}

/** 개발 서버 터미널과 브라우저 콘솔에 남긴다. 키, 워크스페이스 ID, 이미지 원문은 넣지 않는다. */
export function reportIncomeImport(entry: ClaudeImageTrace): void {
  const line = {
    step: clip(entry.step, 80) || "unknown",
    ok: entry.ok === true,
    message: redact(clip(entry.message || "", 800)),
    status: typeof entry.status === "number" && Number.isFinite(entry.status) ? entry.status : null,
    detail: redact(clip(entry.detail || "", 4000)),
  };
  const text = `[income-import] ${JSON.stringify(line)}`;
  if (line.ok) console.info(text);
  else console.error(text);
  void logIncomeImport(line).catch(() => undefined);
}

/** 캡처한 수익 화면만 이 브라우저에서 Claude로 보낸다. 키와 이미지는 저장하지 않는다. */
export async function extractIncomeImage(apiKey: string, workspaceId: string, image: PreparedImage): Promise<IncomeImageResult> {
  const result: ClaudeImageRows<ImportedIncome> = await extractClaudeImageRows(apiKey, workspaceId, image, {
    missingImage: "수익 화면 이미지를 넣어 주세요.",
    empty: "이미지에서 배당, 이자, 판매 수익을 찾지 못했습니다.",
    body: (shot) => incomeImageClaudeBody(shot.mediaType, shot.data),
    parse: parseImportedIncomes,
    trace: reportIncomeImport,
  });
  if (!result.ok) return result;
  return { ok: true, incomes: result.rows, workspaceId: result.workspaceId };
}
