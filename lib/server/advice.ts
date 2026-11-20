import { z } from "zod";
import type { AdviceEngine } from "@/lib/advice-model";
import { adviceContext, type AdviceContext, type AdviceSource } from "@/lib/engine/advice-context";
import { draftAdvice, type AdviceSections } from "@/lib/engine/advice-draft";
import { PHASE_STORY } from "@/lib/engine/phase-story";
import { readAdviceCache } from "@/lib/server/advice-cache";
import type { AppView } from "@/lib/server/portfolio";
import { getCurrentUser } from "@/lib/server/session";

export type AdviceBrief = AdviceSections & {
  /** spark는 NVIDIA Spark. draft는 엔진 초안. anthropic은 관리자 Claude 키. */
  source: AdviceEngine | "draft";
  notice: string | null;
  /** 저장된 글을 보여 줄 때의 시각. 방금 모델이 쓴 글도 저장 시각이 있다. */
  cachedAt: string | null;
  awaitingBrowser?: boolean;
};

const AdviceJson = z.object({
  phase: z.string(),
  portfolio: z.string(),
  actions: z.string(),
  leave: z.string(),
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
  if (member && !options?.refresh) {
    const cached = await readAdviceCache(member.id, "anthropic");
    if (cached) return cached;
  }
  return {
    ...draftAdvice(context),
    source: "draft",
    notice: null,
    cachedAt: null,
  };
}

/** 브라우저가 Claude 본문을 가져온 뒤 그대로 저장한다. 키가 서버를 거치지 않는다. */
export async function adviceFromClaudeReply(context: AdviceContext, raw: string | null): Promise<AdviceBrief> {
  const text = raw?.trim() ?? "";
  if (!text) return claudeDraft(context);
  return { ...claudeSections(text), source: "anthropic", notice: null, cachedAt: null };
}

function claudeDraft(context: AdviceContext): AdviceBrief {
  return {
    ...draftAdvice(context),
    source: "draft",
    notice: "Claude로 받지 못해 앱 계산으로 만든 초안입니다.",
    cachedAt: null,
  };
}

/** 네 칸 JSON이면 그 문장을, 아니면 받은 원문을 그대로 돌려준다. 엔진 숫자와 달라도 바꾸지 않는다. */
function claudeSections(raw: string): AdviceSections {
  try {
    const parsed = AdviceJson.safeParse(parseAdviceJson(raw));
    if (parsed.success) {
      return {
        phase: parsed.data.phase.trim(),
        portfolio: parsed.data.portfolio.trim(),
        actions: parsed.data.actions.trim(),
        leave: parsed.data.leave.trim(),
      };
    }
  } catch {
    // 받은 원문을 그대로 둔다.
  }
  return { phase: raw.trim(), portfolio: "", actions: "", leave: "" };
}

function parseAdviceJson(raw: string): unknown {
  const fenced = raw.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");
  return JSON.parse(fenced);
}
