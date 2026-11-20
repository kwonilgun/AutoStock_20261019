"use server";

import { HOLDING_IMAGE_TYPES, claudeMessageText, holdingsImageClaudeBody, parseImportedHoldings, type HoldingImageType, type ImportedHolding } from "@/lib/holdings-import";
import { incomeImageClaudeBody, parseImportedIncomes, type ImportedIncome } from "@/lib/income-import";
import { PICK_DISABLED_MESSAGE } from "@/lib/pick-engine";
import { readPickClaudeCredential } from "@/lib/server/pick-llm";
import { getCurrentUser } from "@/lib/server/session";

type PreparedImage = { mediaType: string; data: string };

const UNCONFIGURED = "이미지를 읽지 못했습니다. 관리자에게 문의해 주세요.";
const FAILED = "이미지를 읽지 못했습니다.";

function preparedImage(image: PreparedImage): { mediaType: HoldingImageType; data: string } | null {
  if (!HOLDING_IMAGE_TYPES.includes(image.mediaType as HoldingImageType)) return null;
  const data = image.data.trim();
  if (!data || data.length > 6_500_000 || !/^[A-Za-z0-9+/=]+$/.test(data)) return null;
  return { mediaType: image.mediaType as HoldingImageType, data };
}

async function adminImageText(body: unknown, label: string): Promise<string> {
  const user = await getCurrentUser();
  if (!user || user.role === "admin") throw new Error("no-member");
  const credential = await readPickClaudeCredential();
  if (!credential) throw new Error("unconfigured");
  const response = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": credential.apiKey,
      "anthropic-version": "2023-06-01",
      "anthropic-workspace-id": credential.workspaceId,
    },
    signal: AbortSignal.timeout(60_000),
    body: JSON.stringify(body),
  });
  const raw = await response.text();
  console.log(`[${label}] response ${JSON.stringify({ status: response.status, chars: raw.length })}`);
  if (!response.ok) throw new Error(`claude ${response.status}`);
  let payload: unknown;
  try {
    payload = JSON.parse(raw) as unknown;
  } catch {
    throw new Error("claude parse");
  }
  const text = claudeMessageText(payload);
  if (!text) throw new Error("empty");
  return text;
}

function failureMessage(error: unknown): string {
  if (error instanceof Error && error.message === "unconfigured") return UNCONFIGURED;
  if (error instanceof Error && error.message === "응답 형식이 아니어서 가져오지 않았습니다.") return error.message;
  return FAILED;
}

/** 줄인 보유 화면을 관리자 Claude 키로 읽는다. 키는 브라우저로 보내지 않는다. */
export async function readHoldingImage(
  image: PreparedImage,
): Promise<{ ok: true; holdings: ImportedHolding[] } | { ok: false; message: string }> {
  const user = await getCurrentUser();
  if (!user || user.role !== "user" || !user.pickEnabled) return { ok: false, message: PICK_DISABLED_MESSAGE };
  const shot = preparedImage(image);
  if (!shot) return { ok: false, message: "보유 화면 이미지를 넣어 주세요." };
  try {
    const text = await adminImageText(holdingsImageClaudeBody(shot.mediaType, shot.data), "holding-image");
    const holdings = parseImportedHoldings(text);
    if (holdings.length === 0) return { ok: false, message: "이미지에서 종목명, 수량, 1주 평균금액을 찾지 못했습니다." };
    return { ok: true, holdings };
  } catch (error) {
    return { ok: false, message: failureMessage(error) };
  }
}

/** 줄인 수익 화면을 관리자 Claude 키로 읽는다. 키는 브라우저로 보내지 않는다. */
export async function readIncomeImage(
  image: PreparedImage,
): Promise<{ ok: true; incomes: ImportedIncome[] } | { ok: false; message: string }> {
  const shot = preparedImage(image);
  if (!shot) return { ok: false, message: "수익 화면 이미지를 넣어 주세요." };
  try {
    const text = await adminImageText(incomeImageClaudeBody(shot.mediaType, shot.data), "income-image");
    const incomes = parseImportedIncomes(text);
    if (incomes.length === 0) return { ok: false, message: "이미지에서 배당, 이자, 판매 수익을 찾지 못했습니다." };
    return { ok: true, incomes };
  } catch (error) {
    return { ok: false, message: failureMessage(error) };
  }
}
