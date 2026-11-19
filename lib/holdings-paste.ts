import {
  HOLDING_IMAGE_TYPES,
  claudeFailureNeedsWorkspace,
  claudeMessageText,
  explainClaudeHoldingsFailure,
  holdingsImageClaudeBody,
  parseImportedHoldings,
  type HoldingImageType,
  type ImportedHolding,
} from "@/lib/holdings-import";

const WORKSPACE_HINT = "워크스페이스 ID를 입력해 주세요. platform.claude.com/settings/workspaces 의 ID 열입니다.";

class PasteClaudeError extends Error {
  needsWorkspace: boolean;
  step: string;
  status: number | null;
  detail: string;

  constructor(message: string, needsWorkspace = false, debug?: { step?: string; status?: number | null; detail?: string }) {
    super(message);
    this.name = "PasteClaudeError";
    this.needsWorkspace = needsWorkspace;
    this.step = debug?.step || "claude";
    this.status = typeof debug?.status === "number" ? debug.status : null;
    this.detail = debug?.detail || "";
  }
}

export type ClaudeImageTrace = {
  step: string;
  ok?: boolean;
  message?: string;
  status?: number | null;
  detail?: string | null;
};

export type PasteExtractResult = { ok: true; holdings: ImportedHolding[]; workspaceId: string } | { ok: false; message: string };

function claudeHeaders(apiKey: string, workspaceId: string, version: string): Record<string, string> {
  const headers: Record<string, string> = {
    "content-type": "application/json",
    "x-api-key": apiKey,
    "anthropic-version": version,
    "anthropic-dangerous-direct-browser-access": "true",
  };
  if (workspaceId) headers["anthropic-workspace-id"] = workspaceId;
  return headers;
}

async function claudeMessages<T>(apiKey: string, workspaceId: string, payload: unknown, parse: (text: string) => T): Promise<T> {
  let response: Response;
  try {
    response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      signal: AbortSignal.timeout(60_000),
      headers: claudeHeaders(apiKey, workspaceId, "2023-06-01"),
      body: JSON.stringify(payload),
    });
  } catch (error) {
    const name = error instanceof Error ? error.name : "";
    const raw = error instanceof Error ? error.message : "";
    if (name === "TimeoutError" || name === "AbortError") {
      throw new PasteClaudeError("Claude 응답이 늦습니다. 잠시 후 다시 눌러 주세요.", false, { step: "claude", detail: name });
    }
    throw new PasteClaudeError("Claude에 연결하지 못했습니다. 네트워크를 확인한 뒤 다시 눌러 주세요.", false, {
      step: "claude",
      detail: `${name} ${raw}`.trim(),
    });
  }
  const body = (await response.json().catch(() => ({}))) as { error?: { type?: unknown; message?: unknown }; stop_reason?: unknown };
  if (!response.ok) {
    const detail = typeof body?.error?.message === "string" ? body.error.message : "";
    const errorType = typeof body?.error?.type === "string" ? body.error.type : "";
    throw new PasteClaudeError(explainClaudeHoldingsFailure(response.status, detail, Boolean(workspaceId)), claudeFailureNeedsWorkspace(detail), {
      step: "claude",
      status: response.status,
      detail: `${errorType} ${detail}`.trim() || "empty error body",
    });
  }
  const text = claudeMessageText(body);
  try {
    return parse(text);
  } catch (error) {
    const reason = error instanceof Error ? error.message : "응답 형식이 아니어서 가져오지 않았습니다.";
    const stop = typeof body.stop_reason === "string" ? body.stop_reason : "";
    throw new PasteClaudeError(reason, false, { step: "parse", detail: `stop=${stop} text=${text.slice(0, 1500)}` });
  }
}

async function discoverWorkspace(apiKey: string): Promise<string> {
  const response = await fetch("https://api.anthropic.com/v1/organizations/workspaces?include_default=true&limit=20", {
    headers: claudeHeaders(apiKey, "", "2026-10-21"),
  });
  const body = (await response.json().catch(() => ({}))) as { data?: unknown; error?: { message?: unknown } };
  if (!response.ok) {
    const detail = typeof body?.error?.message === "string" ? body.error.message : "";
    throw new PasteClaudeError(WORKSPACE_HINT, false, { step: "workspace", status: response.status, detail: detail || "empty error body" });
  }
  const rows = Array.isArray(body.data) ? body.data : [];
  const chosen =
    rows.find((row) => row && typeof row === "object" && (row as { name?: unknown }).name === "Default" && typeof (row as { id?: unknown }).id === "string") ||
    rows.find((row) => row && typeof row === "object" && typeof (row as { id?: unknown }).id === "string");
  const workspaceId = chosen && typeof chosen === "object" && typeof (chosen as { id?: unknown }).id === "string" ? (chosen as { id: string }).id.trim() : "";
  if (!workspaceId) throw new PasteClaudeError(WORKSPACE_HINT);
  return workspaceId;
}

const MAX_IMAGE_EDGE = 1568;

function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const text = typeof reader.result === "string" ? reader.result : "";
      const data = text.slice(text.indexOf(",") + 1);
      if (!data) reject(new Error("이미지를 읽지 못했습니다."));
      else resolve(data);
    };
    reader.onerror = () => reject(new Error("이미지를 읽지 못했습니다."));
    reader.readAsDataURL(blob);
  });
}

/** 캡처 이미지를 줄여 JPEG로 만든다. 원본은 서버에 올리지 않는다. */
export async function prepareHoldingImage(
  file: Blob,
  tooLargeMessage = "이미지가 너무 큽니다. 종목 표만 보이게 잘라 주세요.",
): Promise<{ mediaType: HoldingImageType; data: string }> {
  if (!HOLDING_IMAGE_TYPES.includes(file.type as HoldingImageType)) {
    throw new Error("png, jpg, webp, gif 이미지만 넣을 수 있습니다.");
  }
  if (file.size > 12_000_000) throw new Error(tooLargeMessage);
  const bitmap = await createImageBitmap(file).catch(() => null);
  if (!bitmap) throw new Error("이미지를 읽지 못했습니다.");
  const scale = Math.min(1, MAX_IMAGE_EDGE / Math.max(bitmap.width, bitmap.height));
  const width = Math.max(1, Math.round(bitmap.width * scale));
  const height = Math.max(1, Math.round(bitmap.height * scale));
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d");
  if (!context) {
    bitmap.close();
    throw new Error("이미지를 읽지 못했습니다.");
  }
  context.drawImage(bitmap, 0, 0, width, height);
  bitmap.close();
  const blob = await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((result) => (result ? resolve(result) : reject(new Error("이미지를 읽지 못했습니다."))), "image/jpeg", 0.82);
  });
  if (blob.size > 4_500_000) throw new Error(tooLargeMessage);
  return { mediaType: "image/jpeg", data: await blobToBase64(blob) };
}

type PreparedImage = { mediaType: HoldingImageType; data: string };

export type ClaudeImageRows<T> = { ok: true; rows: T[]; workspaceId: string } | { ok: false; message: string };

/** 줄인 캡처를 이 브라우저에서 Claude로 보낸다. 키와 이미지는 저장하지 않는다. */
export async function extractClaudeImageRows<T>(
  apiKey: string,
  workspaceId: string,
  image: PreparedImage,
  options: {
    missingImage: string;
    empty: string;
    body: (image: PreparedImage) => unknown;
    parse: (text: string) => T[];
    trace?: (event: ClaudeImageTrace) => void;
  },
): Promise<ClaudeImageRows<T>> {
  function emit(event: ClaudeImageTrace) {
    try {
      options.trace?.(event);
    } catch {
      return;
    }
  }
  const key = apiKey.trim();
  if (!key) return { ok: false, message: "Claude API 키를 입력해 주세요." };
  if (!image.data) return { ok: false, message: options.missingImage };
  const workspaceLabel = workspaceId.trim() ? "saved" : "none";
  emit({ step: "image", ok: true, detail: `chars=${image.data.length} media=${image.mediaType} workspace=${workspaceLabel}` });
  try {
    let workspace = workspaceId.trim();
    let rows: T[];
    try {
      rows = await claudeMessages(key, workspace, options.body(image), options.parse);
    } catch (error) {
      if (!(error instanceof PasteClaudeError) || !error.needsWorkspace || workspace) throw error;
      emit({ step: "workspace", ok: true, status: error.status, detail: `lookup ${error.detail}`.trim() });
      workspace = await discoverWorkspace(key);
      rows = await claudeMessages(key, workspace, options.body(image), options.parse);
    }
    if (rows.length === 0) {
      emit({ step: "parse", ok: false, message: options.empty, detail: "rows=0" });
      return { ok: false, message: options.empty };
    }
    emit({ step: "claude", ok: true, detail: `rows=${rows.length}` });
    return { ok: true, rows, workspaceId: workspace };
  } catch (error) {
    const message = error instanceof Error ? error.message : "가져오지 못했습니다.";
    const shown = message.slice(0, 180);
    if (error instanceof PasteClaudeError) {
      emit({ step: error.step, ok: false, message: shown, status: error.status, detail: error.detail });
    } else {
      emit({ step: "claude", ok: false, message: shown, detail: error instanceof Error ? error.name : "" });
    }
    return { ok: false, message: shown };
  }
}

/** 캡처한 보유 화면만 이 브라우저에서 Claude로 보낸다. 키와 이미지는 저장하지 않는다. */
export async function extractHoldingImage(apiKey: string, workspaceId: string, image: PreparedImage): Promise<PasteExtractResult> {
  const result = await extractClaudeImageRows(apiKey, workspaceId, image, {
    missingImage: "보유 화면 이미지를 넣어 주세요.",
    empty: "이미지에서 종목명, 수량, 1주 평균금액을 찾지 못했습니다.",
    body: (shot) => holdingsImageClaudeBody(shot.mediaType, shot.data),
    parse: parseImportedHoldings,
  });
  if (!result.ok) return result;
  return { ok: true, holdings: result.rows, workspaceId: result.workspaceId };
}
