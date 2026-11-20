import { z } from "zod";
import type { AdviceEngine } from "@/lib/advice-model";
import { adviceTextProblem } from "@/lib/engine/advice-check";
import { adviceContext, type AdviceContext, type AdviceSource } from "@/lib/engine/advice-context";
import { draftAdvice, type AdviceSections } from "@/lib/engine/advice-draft";
import { PHASE_STORY } from "@/lib/engine/phase-story";
import { readAdviceCache } from "@/lib/server/advice-cache";
import { hasBrowserClaudeCookie } from "@/lib/server/advice-choice";
import type { AppView } from "@/lib/server/portfolio";
import { getCurrentUser } from "@/lib/server/session";

export type AdviceBrief = AdviceSections & {
  /** spark는 NVIDIA Spark. draft는 엔진 초안. 나머지는 그 회원의 API 키. */
  source: AdviceEngine | "draft";
  notice: string | null;
  /** 저장된 글을 보여 줄 때의 시각. 방금 모델이 쓴 글도 저장 시각이 있다. */
  cachedAt: string | null;
  /** 브라우저 Claude 키가 있고 저장된 글이 없을 때. 화면이 그 키로 이어서 받는다. */
  awaitingBrowser?: boolean;
};

const AdviceJson = z.object({
  phase: z.string().trim().min(1).max(1200),
  portfolio: z.string().trim().min(1).max(1200),
  actions: z.string().trim().min(1).max(1200),
  leave: z.string().trim().min(1).max(1200),
});

export function adviceSourceFromView(
  view: AppView,
  fed: { low: number; high: number } | null,
  asOf: string,
): AdviceSource {
  const story = PHASE_STORY[view.phase];
  const why = [view.phaseWhy.lead, ...view.phaseWhy.sections.map((section) => section.body), view.phaseWhy.close]
    .map((part) => part.trim())
    .filter(Boolean)
    .join(" ");
  return {
    asOf,
    phase: view.phase,
    why,
    stance: story.stance,
    usdKrw: view.portfolio.usdKrw,
    fedLow: fed?.low ?? null,
    fedHigh: fed?.high ?? null,
    holdings: view.holdings,
    result: view.result,
  };
}

export async function loadAdvice(source: AdviceSource, options?: { refresh?: boolean }): Promise<AdviceBrief> {
  const context = adviceContext(source);
  const user = await getCurrentUser();
  const member = user && user.role !== "admin" ? user : null;
  if (member && (await hasBrowserClaudeCookie())) {
    if (!options?.refresh) {
      const cached = await readAdviceCache(member.id, "anthropic");
      if (cached) return cached;
    }
    return { ...draftAdvice(context), source: "draft", notice: null, cachedAt: null, awaitingBrowser: true };
  }
  return {
    ...draftAdvice(context),
    source: "draft",
    notice: "오늘 자문은 Claude로만 받습니다. Claude API 키와 워크스페이스 ID를 입력해 주세요.",
    cachedAt: null,
  };
}

type AttemptFail = "transport" | "shape" | "mismatch";

/** 브라우저가 Claude 본문을 가져온 뒤의 검사. 키가 서버를 거치지 않는다. */
export async function adviceFromClaudeReply(context: AdviceContext, raw: string | null): Promise<AdviceBrief> {
  if (raw && raw.trim()) {
    const read = readAdviceJson(raw, context);
    if ("sections" in read) {
      return { ...read.sections, source: "anthropic", notice: null, cachedAt: null };
    }
    return claudeDraft(context, read.fail);
  }
  return claudeDraft(context, "transport");
}

function claudeDraft(context: AdviceContext, fail: AttemptFail): AdviceBrief {
  const notice =
    fail === "shape"
      ? "Claude 응답 형식이 달라 앱 계산 초안을 보여 줍니다."
      : fail === "mismatch"
        ? "Claude 응답이 엔진 숫자와 달라 앱 계산 초안을 보여 줍니다."
        : "Claude로 받지 못해 앱 계산으로 만든 초안입니다.";
  return { ...draftAdvice(context), source: "draft", notice, cachedAt: null };
}

function readAdviceJson(raw: string, context: AdviceContext): { sections: AdviceSections } | { fail: AttemptFail } {
  let parsedBody: unknown;
  try {
    parsedBody = parseAdviceJson(raw);
  } catch {
    adviceLog("reject", { reason: "json-parse" });
    return { fail: "shape" };
  }
  const parsed = AdviceJson.safeParse(parsedBody);
  if (!parsed.success) {
    adviceLog("reject", { reason: "json-shape", issues: parsed.error.issues });
    return { fail: "shape" };
  }
  const problem = adviceTextProblem(parsed.data, context);
  if (problem) {
    adviceLog("reject", { reason: "engine-mismatch", problem });
    return { fail: "mismatch" };
  }
  return { sections: parsed.data };
}

function adviceLog(label: string, data: unknown): void {
  const text = typeof data === "string" ? data : JSON.stringify(data, null, 2);
  console.log(`[advice] ${label}\n${text}`);
}

function parseAdviceJson(raw: string): unknown {
  const fenced = raw.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");
  return JSON.parse(fenced);
}
