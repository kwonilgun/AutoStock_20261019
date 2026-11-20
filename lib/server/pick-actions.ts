"use server";

import { revalidatePath } from "next/cache";
import { unstable_rethrow } from "next/navigation";
import { pickSnapshot, type PickSnapshot } from "@/lib/engine/pick-context";
import { parsePickReply, type PickItem } from "@/lib/engine/pick-parse";
import { PICK_SYSTEM_PROMPT, pickUserPrompt } from "@/lib/engine/pick-prompt";
import { emptyMessage } from "@/lib/engine/rebalance";
import { PICK_DISABLED_MESSAGE, type PickEngine } from "@/lib/pick-engine";
import { pickErrorDetail, pickLogText } from "@/lib/pick-log";
import { askClaude, askSpark, memberModelName, readSparkConfig } from "@/lib/server/advice-remote";
import { clearPickCache, readPickCache, writePickCache } from "@/lib/server/pick-cache";
import { readPickClaudeCredential, readUserPickEngine } from "@/lib/server/pick-llm";
import { getView } from "@/lib/server/portfolio";
import { getCurrentUser } from "@/lib/server/session";

export type PickResult =
  | { ok: true; kind: "empty" }
  | { ok: true; kind: "picks"; snapshot: PickSnapshot; items: PickItem[]; cachedAt: string | null }
  | { ok: false; message: string };

export type PickPrep =
  | { ok: true; kind: "empty" }
  | { ok: true; kind: "cached"; snapshot: PickSnapshot; items: PickItem[]; cachedAt: string }
  | { ok: true; kind: "prompt"; model: string; system: string; user: string; snapshot: PickSnapshot }
  | { ok: false; message: string };

/** 부족한 자산군과 살 금액을 담은 프롬프트. 같은 모델의 저장본이 있으면 다시 부르지 않는다. */
async function preparePick(refresh: boolean, engine: PickEngine): Promise<PickPrep> {
  try {
    const user = await getCurrentUser();
    if (!user || user.role === "admin") {
      console.log(pickLogText({ step: "prepare", refresh, ok: false, kind: "no-member", model: engine }));
      return { ok: false, message: "추천 종목을 받지 못했습니다." };
    }
    if (!refresh) {
      const cached = await readPickCache(user.id);
      if (cached && cached.engine === engine) {
        console.log(
          pickLogText({
            step: "prepare",
            refresh,
            ok: true,
            kind: "cached",
            model: engine,
            buys: cached.snapshot.buys.length,
            items: cached.items.length,
            sleeves: cached.snapshot.buys.map((buy) => buy.sleeve),
          }),
        );
        return { ok: true, kind: "cached", snapshot: cached.snapshot, items: cached.items, cachedAt: cached.cachedAt };
      }
    }
    const view = await getView();
    const blocked = emptyMessage(view.result);
    if (blocked) {
      console.log(pickLogText({ step: "prepare", refresh, ok: false, kind: "blocked", message: blocked }));
      return { ok: false, message: blocked };
    }
    const snapshot = pickSnapshot(view.phase, view.holdings, view.result, view.portfolio.usdKrw);
    if (snapshot.buys.length === 0) {
      if (refresh) await clearPickCache(user.id);
      console.log(pickLogText({ step: "prepare", refresh, ok: true, kind: "empty", buys: 0 }));
      return { ok: true, kind: "empty" };
    }
    const model = engine === "spark" ? (readSparkConfig()?.model ?? "Qwen") : memberModelName("anthropic");
    console.log(
      pickLogText({
        step: "prepare",
        refresh,
        ok: true,
        kind: "prompt",
        model,
        buys: snapshot.buys.length,
        sleeves: snapshot.buys.map((buy) => buy.sleeve),
      }),
    );
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
    console.log(pickLogText({ step: "prepare", refresh, ok: false, kind: "error", detail: pickErrorDetail(error) }));
    return { ok: false, message: "추천 종목을 받지 못했습니다." };
  }
}

/** 모델 응답만 받아 저장한다. API 키는 인자로 받지 않는다. */
async function finishPick(raw: string | null, engine: PickEngine): Promise<PickResult> {
  try {
    const user = await getCurrentUser();
    if (!user || user.role === "admin") {
      console.log(pickLogText({ step: "finish", ok: false, kind: "no-member" }));
      return { ok: false, message: "추천 종목을 받지 못했습니다." };
    }
    const view = await getView();
    const blocked = emptyMessage(view.result);
    if (blocked) {
      console.log(pickLogText({ step: "finish", ok: false, kind: "blocked", message: blocked }));
      return { ok: false, message: blocked };
    }
    const snapshot = pickSnapshot(view.phase, view.holdings, view.result, view.portfolio.usdKrw);
    if (snapshot.buys.length === 0) {
      await clearPickCache(user.id);
      revalidatePath("/picks");
      console.log(pickLogText({ step: "finish", ok: true, kind: "empty", buys: 0, chars: raw?.length ?? 0 }));
      return { ok: true, kind: "empty" };
    }
    const items = parsePickReply(raw, snapshot.buys);
    console.log(
      pickLogText({
        step: "finish",
        ok: items.length > 0,
        kind: items.length > 0 ? "picks" : "unreadable",
        model: engine,
        buys: snapshot.buys.length,
        items: items.length,
        sleeves: snapshot.buys.map((buy) => buy.sleeve),
        chars: raw?.length ?? 0,
        detail: raw?.slice(0, 1500) ?? "",
      }),
    );
    if (items.length === 0) return { ok: false, message: "추천 종목을 읽지 못했습니다." };
    const cachedAt = await writePickCache(user.id, { snapshot, items, engine });
    revalidatePath("/picks");
    return { ok: true, kind: "picks", snapshot, items, cachedAt };
  } catch (error) {
    unstable_rethrow(error);
    console.log(pickLogText({ step: "finish", ok: false, kind: "error", detail: pickErrorDetail(error) }));
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
    return { ok: true, kind: "picks", snapshot: prep.snapshot, items: prep.items, cachedAt: prep.cachedAt };
  }
  return null;
}

async function runSparkPick(refresh: boolean): Promise<PickResult> {
  const prep = await preparePick(refresh, "spark");
  const done = cachedOrEmpty(prep);
  if (done) return done;
  if (!prep.ok || prep.kind !== "prompt") return { ok: false, message: "추천 종목을 받지 못했습니다." };
  const config = readSparkConfig();
  if (!config) {
    console.log(pickLogText({ step: "spark", refresh, ok: false, kind: "unconfigured" }));
    return { ok: false, message: "Spark 주소와 Qwen 모델 이름이 없습니다." };
  }
  try {
    console.log(pickLogText({ step: "spark", refresh, kind: "request", model: config.model, buys: prep.snapshot.buys.length }));
    const text = await askSpark(config, prep.system, prep.user, "pick");
    return await finishPick(text, "spark");
  } catch (error) {
    unstable_rethrow(error);
    console.log(pickLogText({ step: "spark", refresh, ok: false, kind: "error", model: config.model, detail: pickErrorDetail(error) }));
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
    console.log(pickLogText({ step: "claude", refresh, ok: false, kind: "unconfigured" }));
    return { ok: false, message: "추천 종목용 Claude가 아직 설정되지 않았습니다." };
  }
  try {
    console.log(pickLogText({ step: "claude", refresh, kind: "request", model: prep.model, buys: prep.snapshot.buys.length }));
    const text = await askClaude(credential.apiKey, credential.workspaceId, prep.model, prep.system, prep.user, "pick");
    return await finishPick(text, "claude");
  } catch (error) {
    unstable_rethrow(error);
    console.log(pickLogText({ step: "claude", refresh, ok: false, kind: "error", model: prep.model, detail: pickErrorDetail(error) }));
    return { ok: false, message: "추천 종목을 받지 못했습니다." };
  }
}

/** 관리자가 이 사용자에게 지정한 모델로 추천을 받는다. 모델은 인자로 받지 않는다. */
export async function requestPick(refresh: boolean): Promise<PickResult> {
  const user = await getCurrentUser();
  if (!user || user.role === "admin") return { ok: false, message: "추천 종목을 받지 못했습니다." };
  if (!user.pickEnabled) {
    console.log(pickLogText({ step: "request", refresh, ok: false, kind: "disabled" }));
    return { ok: false, message: PICK_DISABLED_MESSAGE };
  }
  const engine = await readUserPickEngine(user.id);
  console.log(pickLogText({ step: "request", refresh, kind: "assigned", model: engine }));
  return engine === "spark" ? runSparkPick(refresh) : runClaudePick(refresh);
}
