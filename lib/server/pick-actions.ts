"use server";

import { revalidatePath } from "next/cache";
import { unstable_rethrow } from "next/navigation";
import { pickSells, pickSnapshot, type PickSnapshot } from "@/lib/engine/pick-context";
import { PICK_PREFS_ASK_MESSAGE } from "@/lib/engine/pick-prefs";
import { parsePickReason, parsePickReply, type PickItem } from "@/lib/engine/pick-parse";
import { PICK_REASON_SYSTEM_PROMPT, PICK_SYSTEM_PROMPT, pickReasonUserPrompt, pickUserPrompt } from "@/lib/engine/pick-prompt";
import { buildPickWeekPlan, pickPlanWeeksOf, type PickPlanWeeks, type PickScheduleWeek } from "@/lib/engine/pick-schedule";
import { emptyMessage } from "@/lib/engine/rebalance";
import { seoulDay } from "@/lib/format";
import { PICK_DISABLED_MESSAGE, PICK_LIMIT_MESSAGE, type PickEngine, type PickQuota } from "@/lib/pick-engine";
import { logPickLine, pickErrorDetail } from "@/lib/pick-log";
import { askClaude, askSpark, memberModelName, readSparkConfig } from "@/lib/server/advice-remote";
import { clearPickCache, clearPickReason, readPickCache, writePickCache } from "@/lib/server/pick-cache";
import { giveBackPickUse, readPickQuota, takePickUse } from "@/lib/server/pick-quota";
import { readPickClaudeCredential } from "@/lib/server/pick-llm";
import { getView } from "@/lib/server/portfolio";
import { getCurrentUser } from "@/lib/server/session";

export type PickResult =
  | { ok: true; kind: "empty"; quota?: PickQuota }
  | { ok: true; kind: "picks"; snapshot: PickSnapshot; items: PickItem[]; cachedAt: string | null; reason: string | null; plan: string | null; quota?: PickQuota }
  | { ok: false; message: string; quota?: PickQuota };

export type PickPrep =
  | { ok: true; kind: "empty" }
  | { ok: true; kind: "cached"; snapshot: PickSnapshot; items: PickItem[]; cachedAt: string; reason: string | null; plan: string | null }
  | { ok: true; kind: "prompt"; model: string; system: string; user: string; snapshot: PickSnapshot }
  | { ok: false; message: string };

/** 부족한 자산군과 살 금액을 담은 프롬프트. 같은 모델의 저장본이 있으면 다시 부르지 않는다. */
async function preparePick(refresh: boolean, engine: PickEngine): Promise<PickPrep> {
  try {
    const user = await getCurrentUser();
    if (!user || user.role === "admin") {
      logPickLine({ step: "prepare", refresh, ok: false, kind: "no-member", model: engine });
      return { ok: false, message: "추천 종목을 받지 못했습니다." };
    }
    if (!refresh) {
      const cached = await readPickCache(user.id);
      if (cached && cached.engine === engine) {
        return {
          ok: true,
          kind: "cached",
          snapshot: cached.snapshot,
          items: cached.items,
          cachedAt: cached.cachedAt,
          reason: cached.reason ?? null,
          plan: cached.plan ?? null,
        };
      }
    }
    if (!user.pickPrefs) {
      logPickLine({ step: "prepare", refresh, ok: false, kind: "no-prefs" });
      return { ok: false, message: PICK_PREFS_ASK_MESSAGE };
    }
    const view = await getView();
    const blocked = emptyMessage(view.result);
    if (blocked) {
      logPickLine({ step: "prepare", refresh, ok: false, kind: "blocked", message: blocked });
      return { ok: false, message: blocked };
    }
    const snapshot = pickSnapshot(view.phase, view.holdings, view.result, view.portfolio.usdKrw, user.pickPrefs);
    if (snapshot.buys.length === 0) {
      if (refresh) await clearPickCache(user.id);
      logPickLine({ step: "prepare", refresh, ok: true, kind: "empty", buys: 0 });
      return { ok: true, kind: "empty" };
    }
    const model = engine === "spark" ? (readSparkConfig()?.model ?? "Qwen") : memberModelName("anthropic");
    return {
      ok: true,
      kind: "prompt",
      model,
      system: PICK_SYSTEM_PROMPT,
      user: pickUserPrompt(snapshot),
      snapshot,
    };
  } catch (error) {
    unstable_rethrow(error);
    logPickLine({ step: "prepare", refresh, ok: false, kind: "error", detail: pickErrorDetail(error) });
    return { ok: false, message: "추천 종목을 받지 못했습니다." };
  }
}

/** 모델 응답만 받아 저장한다. API 키는 인자로 받지 않는다. */
async function finishPick(raw: string | null, engine: PickEngine): Promise<PickResult> {
  try {
    const user = await getCurrentUser();
    if (!user || user.role === "admin") {
      logPickLine({ step: "finish", ok: false, kind: "no-member" });
      return { ok: false, message: "추천 종목을 받지 못했습니다." };
    }
    if (!user.pickPrefs) {
      logPickLine({ step: "finish", ok: false, kind: "no-prefs" });
      return { ok: false, message: PICK_PREFS_ASK_MESSAGE };
    }
    const view = await getView();
    const blocked = emptyMessage(view.result);
    if (blocked) {
      logPickLine({ step: "finish", ok: false, kind: "blocked", message: blocked });
      return { ok: false, message: blocked };
    }
    const snapshot = pickSnapshot(view.phase, view.holdings, view.result, view.portfolio.usdKrw, user.pickPrefs);
    if (snapshot.buys.length === 0) {
      await clearPickCache(user.id);
      revalidatePath("/picks");
      logPickLine({ step: "finish", ok: true, kind: "empty", buys: 0, chars: raw?.length ?? 0 });
      return { ok: true, kind: "empty" };
    }
    const items = parsePickReply(raw, snapshot.buys);
    if (items.length === 0) {
      logPickLine({ step: "finish", ok: false, kind: "unreadable" });
      return { ok: false, message: "추천 종목을 읽지 못했습니다." };
    }
    const cachedAt = await writePickCache(user.id, { snapshot, items, engine });
    revalidatePath("/picks");
    return { ok: true, kind: "picks", snapshot, items, cachedAt, reason: null, plan: null };
  } catch (error) {
    unstable_rethrow(error);
    logPickLine({ step: "finish", ok: false, kind: "error", detail: pickErrorDetail(error) });
    return { ok: false, message: "추천 종목을 받지 못했습니다." };
  }
}

function sparkFailureMessage(error: unknown, url: string): string {
  let host = "";
  try {
    host = new URL(url).host;
  } catch {
    host = "";
  }
  const where = host ? ` ${host}` : "";
  if (error instanceof Error && error.message === "advice model empty") return "Spark 응답이 비어 있습니다.";
  const cause = error instanceof Error ? error.cause : undefined;
  const code = cause && typeof cause === "object" && "code" in cause ? String((cause as { code?: unknown }).code ?? "") : "";
  const text = `${error instanceof Error ? error.message : ""} ${cause instanceof Error ? cause.message : ""}`;
  if (code === "UND_ERR_CONNECT_TIMEOUT" || /timeout/i.test(text)) {
    return `Spark 서버${where}가 응답하지 않습니다. 서버가 켜져 있는지, 주소가 지금 네트워크의 주소인지 확인해 주세요.`;
  }
  if (code === "ECONNREFUSED" || /ECONNREFUSED/i.test(text)) {
    return `Spark 서버${where}가 연결을 거절했습니다. 포트와 서버 실행 여부를 확인해 주세요.`;
  }
  return `Spark 서버${where}에 연결하지 못했습니다.`;
}

function cachedOrEmpty(prep: PickPrep): PickResult | null {
  if (!prep.ok) return prep;
  if (prep.kind === "empty") return { ok: true, kind: "empty" };
  if (prep.kind === "cached") {
    return { ok: true, kind: "picks", snapshot: prep.snapshot, items: prep.items, cachedAt: prep.cachedAt, reason: prep.reason, plan: prep.plan };
  }
  return null;
}

async function chargeOrStop(userId: string): Promise<PickResult | null> {
  const taken = await takePickUse(userId);
  if (taken) return null;
  logPickLine({ step: "request", ok: false, kind: "limited" });
  return { ok: false, message: PICK_LIMIT_MESSAGE };
}

async function runSparkPick(refresh: boolean): Promise<PickResult> {
  const prep = await preparePick(refresh, "spark");
  const done = cachedOrEmpty(prep);
  if (done) return done;
  if (!prep.ok || prep.kind !== "prompt") return { ok: false, message: "추천 종목을 받지 못했습니다." };
  const config = readSparkConfig();
  if (!config) {
    logPickLine({ step: "spark", refresh, ok: false, kind: "unconfigured" });
    return { ok: false, message: "Spark 주소와 Qwen 모델 이름이 없습니다." };
  }
  const user = await getCurrentUser();
  if (!user) return { ok: false, message: "추천 종목을 받지 못했습니다." };
  const denied = await chargeOrStop(user.id);
  if (denied) return denied;
  if (refresh) await clearPickReason(user.id);
  try {
    logPickLine({ step: "spark", refresh, kind: "request", model: config.model, buys: prep.snapshot.buys.length });
    const text = await askSpark(config, prep.system, prep.user, "pick");
    const result = await finishPick(text, "spark");
    if (!result.ok) await giveBackPickUse(user.id);
    return result;
  } catch (error) {
    await giveBackPickUse(user.id);
    unstable_rethrow(error);
    logPickLine({ step: "spark", refresh, ok: false, kind: "error", model: config.model, detail: pickErrorDetail(error) });
    return { ok: false, message: sparkFailureMessage(error, config.url) };
  }
}

async function runClaudePick(refresh: boolean): Promise<PickResult> {
  const prep = await preparePick(refresh, "claude");
  const done = cachedOrEmpty(prep);
  if (done) return done;
  if (!prep.ok || prep.kind !== "prompt") return { ok: false, message: "추천 종목을 받지 못했습니다." };
  const credential = await readPickClaudeCredential();
  if (!credential) {
    logPickLine({ step: "claude", refresh, ok: false, kind: "unconfigured" });
    return { ok: false, message: "추천 종목용 Claude가 아직 설정되지 않았습니다." };
  }
  const user = await getCurrentUser();
  if (!user) return { ok: false, message: "추천 종목을 받지 못했습니다." };
  const denied = await chargeOrStop(user.id);
  if (denied) return denied;
  if (refresh) await clearPickReason(user.id);
  try {
    logPickLine({ step: "claude", refresh, kind: "request", model: prep.model, buys: prep.snapshot.buys.length });
    const text = await askClaude(credential.apiKey, credential.workspaceId, prep.model, prep.system, prep.user, "pick");
    const result = await finishPick(text, "claude");
    if (!result.ok) await giveBackPickUse(user.id);
    return result;
  } catch (error) {
    await giveBackPickUse(user.id);
    unstable_rethrow(error);
    logPickLine({ step: "claude", refresh, ok: false, kind: "error", model: prep.model, detail: pickErrorDetail(error) });
    return { ok: false, message: "추천 종목을 받지 못했습니다." };
  }
}

async function askPickSpark(system: string, user: string, label: string): Promise<{ ok: true; text: string } | { ok: false; message: string }> {
  const config = readSparkConfig();
  if (!config) return { ok: false, message: "Spark 주소와 Qwen 모델 이름이 없습니다." };
  return { ok: true, text: await askSpark(config, system, user, label) };
}

async function askPickClaude(system: string, user: string, label: string): Promise<{ ok: true; text: string } | { ok: false; message: string }> {
  const credential = await readPickClaudeCredential();
  if (!credential) return { ok: false, message: "추천 종목용 Claude가 아직 설정되지 않았습니다." };
  return {
    ok: true,
    text: await askClaude(credential.apiKey, credential.workspaceId, memberModelName("anthropic"), system, user, label),
  };
}

export type PickReasonResult = { ok: true; text: string } | { ok: false; message: string };

/** 저장된 추천을 만든 모델로 이유를 받는다. Spark면 서버의 Qwen이다. */
export async function requestPickReason(): Promise<PickReasonResult> {
  try {
    const user = await getCurrentUser();
    if (!user || user.role === "admin") {
      logPickLine({ step: "reason", ok: false, kind: "no-member" });
      return { ok: false, message: "추천 이유를 받지 못했습니다." };
    }
    if (!user.pickEnabled) {
      logPickLine({ step: "reason", ok: false, kind: "disabled" });
      return { ok: false, message: PICK_DISABLED_MESSAGE };
    }
    const cached = await readPickCache(user.id);
    if (!cached || cached.items.length === 0) {
      logPickLine({ step: "reason", ok: false, kind: "empty", items: cached?.items.length ?? 0 });
      return { ok: false, message: "설명할 추천 종목이 없습니다." };
    }
    if (cached.reason) {
      logPickLine({ step: "reason", ok: true, kind: "cached", items: cached.items.length, chars: cached.reason.length });
      return { ok: true, text: cached.reason };
    }
    const prompt = pickReasonUserPrompt(cached.snapshot, cached.items);
    const asked =
      cached.engine === "spark"
        ? await askPickSpark(PICK_REASON_SYSTEM_PROMPT, prompt, "pick-reason")
        : await askPickClaude(PICK_REASON_SYSTEM_PROMPT, prompt, "pick-reason");
    if (!asked.ok) {
      logPickLine({ step: "reason", ok: false, kind: "unconfigured", model: cached.engine });
      return asked;
    }
    const raw = asked.text;
    const text = parsePickReason(raw);
    if (!text) {
      logPickLine({ step: "reason", ok: false, kind: "unreadable" });
      return { ok: false, message: "추천 이유를 읽지 못했습니다." };
    }
    const fresh = await readPickCache(user.id);
    const sameList = fresh ? pickListKey(fresh) === pickListKey(cached) : false;
    if (fresh?.reason && sameList) return { ok: true, text: fresh.reason };
    if (!fresh || !sameList || fresh.cachedAt !== cached.cachedAt) {
      logPickLine({ step: "reason", ok: false, kind: "stale", items: fresh?.items.length ?? 0 });
      return { ok: false, message: "추천 종목이 바뀌어 이유를 저장하지 않았습니다." };
    }
    await writePickCache(user.id, {
      snapshot: fresh.snapshot,
      items: fresh.items,
      engine: fresh.engine,
      reason: text,
      plan: fresh.plan ?? null,
    });
    revalidatePath("/picks");
    return { ok: true, text };
  } catch (error) {
    unstable_rethrow(error);
    logPickLine({ step: "reason", ok: false, kind: "error", detail: pickErrorDetail(error) });
    return { ok: false, message: "추천 이유를 받지 못했습니다." };
  }
}

export type PickPlanResult = { ok: true; weeks: PickScheduleWeek[]; span: PickPlanWeeks } | { ok: false; message: string };

/** 넘친 금액과 화면에 나온 매수 후보를 고른 주 수에 맞춰 나눈다. 추천 횟수에는 넣지 않는다. */
export async function requestPickPlan(span: number): Promise<PickPlanResult> {
  const weeks = pickPlanWeeksOf(span);
  try {
    const user = await getCurrentUser();
    if (!user || user.role === "admin") {
      logPickLine({ step: "plan", ok: false, kind: "no-member" });
      return { ok: false, message: "향후 계획을 받지 못했습니다." };
    }
    if (!user.pickEnabled) {
      logPickLine({ step: "plan", ok: false, kind: "disabled" });
      return { ok: false, message: PICK_DISABLED_MESSAGE };
    }
    const cached = await readPickCache(user.id);
    if (!cached || cached.items.length === 0) {
      logPickLine({ step: "plan", ok: false, kind: "empty", items: cached?.items.length ?? 0 });
      return { ok: false, message: "계획을 적을 추천 종목이 없습니다." };
    }
    const view = await getView();
    const sells = emptyMessage(view.result) ? [] : pickSells(view.holdings, view.result.sleeves, view.portfolio.usdKrw);
    const plan = buildPickWeekPlan({
      sells,
      buys: cached.snapshot.buys,
      items: cached.items,
      fromDay: seoulDay(),
      weeks,
    });
    return { ok: true, weeks: plan, span: weeks };
  } catch (error) {
    unstable_rethrow(error);
    logPickLine({ step: "plan", ok: false, kind: "error", detail: pickErrorDetail(error) });
    return { ok: false, message: "향후 계획을 받지 못했습니다." };
  }
}

/** 설정에서 고른 모델로 추천 종목을 받는다. Spark는 서버의 Qwen이다. */
export async function requestPick(refresh: boolean): Promise<PickResult> {
  const user = await getCurrentUser();
  if (!user || user.role === "admin") return { ok: false, message: "추천 종목을 받지 못했습니다." };
  if (!user.pickEnabled) {
    logPickLine({ step: "request", refresh, ok: false, kind: "disabled" });
    return { ok: false, message: PICK_DISABLED_MESSAGE };
  }
  const started = Date.now();
  const result = user.pickEngine === "spark" ? await runSparkPick(refresh) : await runClaudePick(refresh);
  console.log(`[use] ${user.email} 추천 ${result.ok ? "ok" : "fail"} ${Date.now() - started}ms`);
  const quota = await readPickQuota(user.id);
  return { ...result, quota };
}

function pickListKey(body: { snapshot: PickSnapshot; items: PickItem[]; engine: PickEngine }): string {
  return JSON.stringify({ engine: body.engine, snapshot: body.snapshot, items: body.items });
}
