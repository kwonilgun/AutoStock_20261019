import { browserClaudeHeaders, claudeAdviceBody } from "@/lib/advice-claude";
import { rememberBrowserClaudeWorkspace } from "@/lib/claude-browser-key";
import { claudeFailureNeedsWorkspace, claudeMessageText, explainClaudeHoldingsFailure } from "@/lib/holdings-import";
import { finishBrowserClaudeAdvice, prepareBrowserClaudeAdvice } from "@/lib/server/advice-actions";
import type { AdviceBrief } from "@/lib/server/advice";

const WORKSPACE_HINT = "워크스페이스 ID를 입력해 주세요. platform.claude.com/settings/workspaces 의 ID 열입니다.";

class AdviceClaudeError extends Error {
  needsWorkspace: boolean;

  constructor(message: string, needsWorkspace = false) {
    super(message);
    this.name = "AdviceClaudeError";
    this.needsWorkspace = needsWorkspace;
  }
}

export type BrowserAdviceResult = { ok: true; brief: AdviceBrief } | { ok: false; message: string };

let pendingAdvice: Promise<BrowserAdviceResult> | null = null;

/** 같은 화면이 두 번 마운트돼도 Claude 자문은 한 번만 호출한다. 업데이트는 항상 새로 부른다. */
export function requestBrowserClaudeAdvice(refresh: boolean, credential: { apiKey: string; workspaceId: string }): Promise<BrowserAdviceResult> {
  if (!refresh && pendingAdvice) return pendingAdvice;
  const task = runBrowserClaudeAdvice(refresh, credential);
  if (!refresh) {
    pendingAdvice = task;
    void task.finally(() => {
      if (pendingAdvice === task) pendingAdvice = null;
    });
  }
  return task;
}

async function runBrowserClaudeAdvice(
  refresh: boolean,
  credential: { apiKey: string; workspaceId: string },
): Promise<BrowserAdviceResult> {
  const prep = await prepareBrowserClaudeAdvice(refresh);
  if (!prep.ok) return prep;
  if (prep.kind === "cached") return { ok: true, brief: prep.brief };
  let raw: string | null = null;
  try {
    const asked = await askBrowserClaude({
      apiKey: credential.apiKey,
      workspaceId: credential.workspaceId,
      model: prep.model,
      system: prep.system,
      user: prep.user,
    });
    raw = asked.text;
    if (asked.workspaceId && asked.workspaceId !== credential.workspaceId) rememberBrowserClaudeWorkspace(asked.workspaceId);
  } catch {
    raw = null;
  }
  const saved = await finishBrowserClaudeAdvice(raw);
  if (!saved.ok) return saved;
  return { ok: true, brief: saved.brief };
}

async function askBrowserClaude(args: {
  apiKey: string;
  workspaceId: string;
  model: string;
  system: string;
  user: string;
}): Promise<{ text: string; workspaceId: string }> {
  let workspaceId = args.workspaceId.trim();
  try {
    return { text: await claudeAdviceCall(args.apiKey, workspaceId, args.model, args.system, args.user), workspaceId };
  } catch (error) {
    if (!(error instanceof AdviceClaudeError) || !error.needsWorkspace || workspaceId) throw error;
    workspaceId = await discoverWorkspace(args.apiKey);
    return { text: await claudeAdviceCall(args.apiKey, workspaceId, args.model, args.system, args.user), workspaceId };
  }
}

async function claudeAdviceCall(apiKey: string, workspaceId: string, model: string, system: string, user: string): Promise<string> {
  let response: Response;
  try {
    response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      signal: AbortSignal.timeout(90_000),
      headers: browserClaudeHeaders(apiKey, workspaceId),
      body: JSON.stringify(claudeAdviceBody(model, system, user)),
    });
  } catch (error) {
    const name = error instanceof Error ? error.name : "";
    if (name === "TimeoutError" || name === "AbortError") {
      throw new AdviceClaudeError("Claude 응답이 늦습니다. 잠시 후 다시 눌러 주세요.");
    }
    throw new AdviceClaudeError("Claude에 연결하지 못했습니다.");
  }
  const body = (await response.json().catch(() => ({}))) as { error?: { message?: unknown } };
  if (!response.ok) {
    const detail = typeof body?.error?.message === "string" ? body.error.message : "";
    throw new AdviceClaudeError(explainClaudeHoldingsFailure(response.status, detail, Boolean(workspaceId)), claudeFailureNeedsWorkspace(detail));
  }
  const text = claudeMessageText(body);
  if (!text) throw new AdviceClaudeError("Claude 응답이 비어 있습니다.");
  return text;
}

async function discoverWorkspace(apiKey: string): Promise<string> {
  const response = await fetch("https://api.anthropic.com/v1/organizations/workspaces?include_default=true&limit=20", {
    headers: browserClaudeHeaders(apiKey, "", "2026-10-21"),
  });
  const body = (await response.json().catch(() => ({}))) as { data?: unknown };
  if (!response.ok) throw new AdviceClaudeError(WORKSPACE_HINT);
  const rows = Array.isArray(body.data) ? body.data : [];
  const chosen =
    rows.find((row) => row && typeof row === "object" && (row as { name?: unknown }).name === "Default" && typeof (row as { id?: unknown }).id === "string") ||
    rows.find((row) => row && typeof row === "object" && typeof (row as { id?: unknown }).id === "string");
  const workspaceId = chosen && typeof chosen === "object" && typeof (chosen as { id?: unknown }).id === "string" ? (chosen as { id: string }).id.trim() : "";
  if (!workspaceId) throw new AdviceClaudeError(WORKSPACE_HINT);
  return workspaceId;
}
