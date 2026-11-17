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

/** Spark(또는 vLLM, Ollama, NIM)의 OpenAI 호환 주소. 둘 중 하나가 없으면 초안만 쓴다. */
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
  if (!config) return { ...draft, source: "draft", notice: null };
  try {
    const raw = await completeAdvice(config, context);
    const parsed = AdviceJson.safeParse(parseAdviceJson(raw));
    if (!parsed.success) {
      return { ...draft, source: "draft", notice: "Spark 응답 형식이 달라 앱 계산 초안을 보여 줍니다." };
    }
    const problem = adviceTextProblem(parsed.data, context);
    if (problem) {
      return { ...draft, source: "draft", notice: "Spark 응답이 엔진 숫자와 달라 앱 계산 초안을 보여 줍니다." };
    }
    return { ...parsed.data, source: "spark", notice: null };
  } catch {
    return { ...draft, source: "draft", notice: "Spark에 연결하지 못해 앱 계산으로 만든 초안입니다." };
  }
}

async function completeAdvice(config: AdviceModelConfig, context: AdviceContext): Promise<string> {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (config.key) headers.Authorization = `Bearer ${config.key}`;
  const response = await fetch(`${config.url}/v1/chat/completions`, {
    method: "POST",
    headers,
    signal: AbortSignal.timeout(45_000),
    body: JSON.stringify({
      model: config.model,
      temperature: 0.2,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: ADVICE_SYSTEM_PROMPT },
        { role: "user", content: adviceUserPrompt(context) },
      ],
    }),
  });
  if (!response.ok) throw new Error(`advice model ${response.status}`);
  const payload = (await response.json()) as {
    choices?: { message?: { content?: unknown } }[];
  };
  const content = payload.choices?.[0]?.message?.content;
  if (typeof content !== "string" || !content.trim()) throw new Error("advice model empty");
  return content;
}

function parseAdviceJson(raw: string): unknown {
  const fenced = raw.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");
  return JSON.parse(fenced);
}
