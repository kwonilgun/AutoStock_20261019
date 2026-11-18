import { z } from "zod";
import { adviceTextProblem } from "@/lib/engine/advice-check";
import { adviceContext, type AdviceContext, type AdviceSource } from "@/lib/engine/advice-context";
import { draftAdvice, type AdviceSections } from "@/lib/engine/advice-draft";
import { ADVICE_SYSTEM_PROMPT, adviceUserPrompt } from "@/lib/engine/advice-prompt";
import { PHASE_STORY } from "@/lib/engine/phase-story";
import type { AppView } from "@/lib/server/portfolio";

export type AdviceBrief = AdviceSections & {
  /** spark는 NVIDIA Spark의 OpenAI 호환 서버. draft는 엔진 숫자로 만든 초안. */
  source: "spark" | "draft";
  notice: string | null;
};

const AdviceJson = z.object({
  phase: z.string().trim().min(1).max(1200),
  portfolio: z.string().trim().min(1).max(1200),
  actions: z.string().trim().min(1).max(1200),
  leave: z.string().trim().min(1).max(1200),
});

export type AdviceModelConfig = {
  url: string;
  model: string;
  key: string;
};

/** LM Studio가 떠 있는 Spark 주소. URL 또는 모델 이름이 없으면 초안만 쓴다. */
export function adviceModelConfig(): AdviceModelConfig | null {
  const url = process.env.ADVICE_MODEL_URL?.trim();
  const model = process.env.ADVICE_MODEL_NAME?.trim();
  if (!url || !model) return null;
  return {
    url: url.replace(/\/$/, ""),
    model,
    key: process.env.ADVICE_MODEL_KEY?.trim() ?? "",
  };
}

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

export async function loadAdvice(source: AdviceSource): Promise<AdviceBrief> {
  return buildAdvice(adviceContext(source));
}

export async function buildAdvice(context: AdviceContext): Promise<AdviceBrief> {
  const draft = draftAdvice(context);
  const config = adviceModelConfig();
  if (!config) {
    adviceLog("skip", "ADVICE_MODEL_URL 또는 ADVICE_MODEL_NAME이 없어 모델을 호출하지 않습니다.");
    return { ...draft, source: "draft", notice: null };
  }
  try {
    const raw = await completeAdvice(config, context);
    const parsed = AdviceJson.safeParse(parseAdviceJson(raw));
    if (!parsed.success) {
      adviceLog("reject", { reason: "json-shape", issues: parsed.error.issues, raw });
      return { ...draft, source: "draft", notice: "Spark 응답 형식이 달라 앱 계산 초안을 보여 줍니다." };
    }
    const problem = adviceTextProblem(parsed.data, context);
    if (problem) {
      adviceLog("reject", { reason: "engine-mismatch", problem, sections: parsed.data });
      return { ...draft, source: "draft", notice: "Spark 응답이 엔진 숫자와 달라 앱 계산 초안을 보여 줍니다." };
    }
    adviceLog("accept", parsed.data);
    return { ...parsed.data, source: "spark", notice: null };
  } catch (error) {
    adviceLog("error", error instanceof Error ? error.message : String(error));
    return { ...draft, source: "draft", notice: "Spark에 연결하지 못해 앱 계산으로 만든 초안입니다." };
  }
}

async function completeAdvice(config: AdviceModelConfig, context: AdviceContext): Promise<string> {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (config.key) headers.Authorization = `Bearer ${config.key}`;
  // LM Studio는 /v1의 json_object를 400으로 거절한다. json_schema는 이 Qwen의 추론 칸에만 쓰고 content를 비운다.
  const url = `${config.url}/api/v1/chat`;
  const body = {
    model: config.model,
    system_prompt: ADVICE_SYSTEM_PROMPT,
    input: adviceUserPrompt(context),
    temperature: 0.2,
    reasoning: "off",
    store: false,
  };
  adviceLog("request", { url, model: config.model, key: config.key ? "(set)" : "(empty)", body });
  const response = await fetch(url, {
    method: "POST",
    headers,
    signal: AbortSignal.timeout(90_000),
    body: JSON.stringify(body),
  });
  const raw = await response.text();
  adviceLog("response", { status: response.status, body: raw });
  if (!response.ok) throw new Error(`advice model ${response.status}`);
  const payload = JSON.parse(raw) as {
    output?: { type?: string; content?: unknown }[];
  };
  const content = (payload.output ?? [])
    .filter((item) => item.type === "message" && typeof item.content === "string")
    .map((item) => item.content as string)
    .join("\n")
    .trim();
  if (!content) throw new Error("advice model empty");
  return content;
}

function adviceLog(label: string, data: unknown): void {
  const text = typeof data === "string" ? data : JSON.stringify(data, null, 2);
  console.log(`[advice] ${label}\n${text}`);
}

function parseAdviceJson(raw: string): unknown {
  const fenced = raw.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");
  return JSON.parse(fenced);
}
