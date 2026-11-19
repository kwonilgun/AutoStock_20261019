import { z } from "zod";
import { resolveAdviceEngine, type AdviceEngine, type MemberProvider } from "@/lib/advice-model";
import { adviceTextProblem } from "@/lib/engine/advice-check";
import { adviceContext, type AdviceContext, type AdviceSource } from "@/lib/engine/advice-context";
import { draftAdvice, type AdviceSections } from "@/lib/engine/advice-draft";
import { PHASE_STORY } from "@/lib/engine/phase-story";
import { readAdviceCache, writeAdviceCache } from "@/lib/server/advice-cache";
import { readAdviceEngine } from "@/lib/server/advice-choice";
import { completeMember, completeSpark, type SparkModelConfig } from "@/lib/server/advice-remote";
import { listSavedProviders, readLlmKey } from "@/lib/server/llm-keys";
import type { AppView } from "@/lib/server/portfolio";
import { getCurrentUser } from "@/lib/server/session";

export type AdviceBrief = AdviceSections & {
  /** spark는 NVIDIA Spark. draft는 엔진 초안. 나머지는 그 회원의 API 키. */
  source: AdviceEngine | "draft";
  notice: string | null;
  /** 저장된 글을 보여 줄 때의 시각. 방금 모델이 쓴 글도 저장 시각이 있다. */
  cachedAt: string | null;
};

const AdviceJson = z.object({
  phase: z.string().trim().min(1).max(1200),
  portfolio: z.string().trim().min(1).max(1200),
  actions: z.string().trim().min(1).max(1200),
  leave: z.string().trim().min(1).max(1200),
});

export type AdviceModelConfig = SparkModelConfig;

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

export async function loadAdvice(source: AdviceSource, options?: { refresh?: boolean }): Promise<AdviceBrief> {
  const context = adviceContext(source);
  const user = await getCurrentUser();
  const member = user && user.role !== "admin" ? user : null;
  const saved = member ? await listSavedProviders(member.id) : [];
  const engine = resolveAdviceEngine(await readAdviceEngine(), saved);
  if (member && !options?.refresh) {
    const cached = await readAdviceCache(member.id, engine);
    if (cached) return cached;
  }
  const key = engine === "spark" || !member ? null : await readLlmKey(member.id, engine);
  const brief = await buildAdvice(context, engine, key);
  if (!member) return { ...brief, cachedAt: null };
  const savedAt = await writeAdviceCache(member.id, engine, brief);
  return { ...brief, cachedAt: savedAt };
}

type AttemptFail = "transport" | "shape" | "mismatch";

export async function buildAdvice(context: AdviceContext, engine: AdviceEngine, key: string | null): Promise<AdviceBrief> {
  const draft = draftAdvice(context);
  const memberResult = engine === "spark" ? null : await runMember(engine, key, context);
  if (memberResult && "sections" in memberResult) {
    return { ...memberResult.sections, source: engine, notice: null, cachedAt: null };
  }

  const spark = await runSpark(context);
  if ("sections" in spark) {
    return {
      ...spark.sections,
      source: "spark",
      notice: memberResult ? memberFallbackNotice(memberResult.fail) : null,
      cachedAt: null,
    };
  }
  if (memberResult) {
    return { ...draft, source: "draft", notice: "고른 모델과 Spark를 쓰지 못해 앱 계산으로 만든 초안입니다.", cachedAt: null };
  }
  if (!adviceModelConfig()) {
    adviceLog("skip", "ADVICE_MODEL_URL 또는 ADVICE_MODEL_NAME이 없어 모델을 호출하지 않습니다.");
    return { ...draft, source: "draft", notice: null, cachedAt: null };
  }
  return { ...draft, source: "draft", notice: sparkNotice(spark.fail), cachedAt: null };
}

function memberFallbackNotice(fail: AttemptFail): string {
  if (fail === "transport") return "고른 모델 키로 받지 못해 Spark Qwen으로 글을 만들었습니다.";
  return "고른 모델 응답을 쓰지 못해 Spark Qwen으로 글을 만들었습니다.";
}

function sparkNotice(fail: AttemptFail): string {
  if (fail === "shape") return "Spark 응답 형식이 달라 앱 계산 초안을 보여 줍니다.";
  if (fail === "mismatch") return "Spark 응답이 엔진 숫자와 달라 앱 계산 초안을 보여 줍니다.";
  return "Spark에 연결하지 못해 앱 계산으로 만든 초안입니다.";
}

async function runMember(
  engine: MemberProvider,
  key: string | null,
  context: AdviceContext,
): Promise<{ sections: AdviceSections } | { fail: AttemptFail }> {
  if (!key) {
    adviceLog("member-miss", { provider: engine });
    return { fail: "transport" };
  }
  try {
    const raw = await completeMember(engine, key, context);
    const read = readAdviceJson(raw, context);
    if ("fail" in read) return read;
    adviceLog("accept", { provider: engine, sections: read.sections });
    return read;
  } catch (error) {
    adviceLog("member-error", { provider: engine, message: error instanceof Error ? error.message : "error" });
    return { fail: "transport" };
  }
}

async function runSpark(context: AdviceContext): Promise<{ sections: AdviceSections } | { fail: AttemptFail }> {
  const config = adviceModelConfig();
  if (!config) return { fail: "transport" };
  try {
    const raw = await completeSpark(config, context);
    const read = readAdviceJson(raw, context);
    if ("fail" in read) return read;
    adviceLog("accept", { provider: "spark", sections: read.sections });
    return read;
  } catch (error) {
    adviceLog("error", error instanceof Error ? error.message : String(error));
    return { fail: "transport" };
  }
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
