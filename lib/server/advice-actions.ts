"use server";

import { revalidatePath } from "next/cache";
import { unstable_rethrow } from "next/navigation";
import { seoulDay } from "@/lib/format";
import { ADVICE_SYSTEM_PROMPT, adviceUserPrompt } from "@/lib/engine/advice-prompt";
import { adviceFromClaudeReply, adviceSourceFromView, loadAdvice, type AdviceBrief } from "@/lib/server/advice";
import { memberModelName } from "@/lib/server/advice-remote";
import { readAdviceCache, writeAdviceCache } from "@/lib/server/advice-cache";
import { latestFedTarget } from "@/lib/server/fed-rate";
import { getView } from "@/lib/server/portfolio";
import { getCurrentUser } from "@/lib/server/session";
import { adviceContext } from "@/lib/engine/advice-context";

export async function refreshAdvice(): Promise<{ ok: true } | { ok: false; message: string }> {
  try {
    const user = await getCurrentUser();
    if (!user || user.role === "admin") return { ok: false, message: "자문을 다시 받지 못했습니다." };
    const [view, fed] = await Promise.all([getView(), latestFedTarget()]);
    await loadAdvice(adviceSourceFromView(view, fed, seoulDay()), { refresh: true });
    revalidatePath("/advice");
    return { ok: true };
  } catch (error) {
    unstable_rethrow(error);
    return { ok: false, message: "자문을 다시 받지 못했습니다." };
  }
}

export type ClaudeAdvicePrep =
  | { ok: true; kind: "cached"; brief: AdviceBrief }
  | { ok: true; kind: "prompt"; model: string; system: string; user: string }
  | { ok: false; message: string };

async function memberContext() {
  const user = await getCurrentUser();
  if (!user || user.role === "admin") return null;
  const [view, fed] = await Promise.all([getView(), latestFedTarget()]);
  return { userId: user.id, context: adviceContext(adviceSourceFromView(view, fed, seoulDay())) };
}

/** 브라우저 Claude 키로 자문할 프롬프트. 저장된 글이 있으면 모델을 다시 부르지 않는다. */
export async function prepareBrowserClaudeAdvice(refresh: boolean): Promise<ClaudeAdvicePrep> {
  try {
    const member = await memberContext();
    if (!member) return { ok: false, message: "자문을 받지 못했습니다." };
    if (!refresh) {
      const cached = await readAdviceCache(member.userId, "anthropic");
      if (cached) return { ok: true, kind: "cached", brief: cached };
    }
    return {
      ok: true,
      kind: "prompt",
      model: memberModelName("anthropic"),
      system: ADVICE_SYSTEM_PROMPT,
      user: adviceUserPrompt(member.context),
    };
  } catch (error) {
    unstable_rethrow(error);
    return { ok: false, message: "자문을 받지 못했습니다." };
  }
}

/** Claude 응답 글만 받는다. API 키는 인자로 받지 않는다. */
export async function finishBrowserClaudeAdvice(raw: string | null): Promise<{ ok: true; brief: AdviceBrief } | { ok: false; message: string }> {
  try {
    const member = await memberContext();
    if (!member) return { ok: false, message: "자문을 받지 못했습니다." };
    const brief = await adviceFromClaudeReply(member.context, raw);
    const savedAt = await writeAdviceCache(member.userId, "anthropic", brief);
    revalidatePath("/advice");
    return { ok: true, brief: { ...brief, cachedAt: savedAt, awaitingBrowser: false } };
  } catch (error) {
    unstable_rethrow(error);
    return { ok: false, message: "자문을 받지 못했습니다." };
  }
}
