"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import type { PickEngine } from "@/lib/pick-engine";
import { readSparkConfig } from "@/lib/server/advice-remote";
import { getCurrentUser } from "@/lib/server/session";

export type ModelEngineKind = "pick" | "weight";

export type SaveModelEngineResult =
  | { ok: true; message: string; engine: PickEngine }
  | { ok: false; message: string };

function engineOf(value: string): PickEngine | null {
  return value === "spark" || value === "claude" ? value : null;
}

/** 설정에서 Ai-추천 종목 또는 목표 비중 모델을 저장한다. Spark는 서버의 Qwen이다. */
export async function saveModelEngine(kind: ModelEngineKind, engine: string): Promise<SaveModelEngineResult> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (user.role === "admin") return { ok: false, message: "관리자 계정에는 모델 설정이 없습니다." };
  const next = engineOf(engine);
  if (!next || (kind !== "pick" && kind !== "weight")) return { ok: false, message: "모델을 확인해 주세요." };
  if (next === "spark" && !readSparkConfig()) {
    return { ok: false, message: "Spark 주소와 Qwen 모델 이름이 없습니다." };
  }
  await prisma.user.update({
    where: { id: user.id },
    data: kind === "pick" ? { pickEngine: next } : { weightEngine: next },
  });
  revalidatePath("/settings");
  revalidatePath("/picks");
  const where = kind === "pick" ? "Ai-추천 종목" : "목표 비중";
  const name = next === "spark" ? "Spark의 Qwen" : "Claude";
  const particle = next === "spark" ? "을" : "를";
  return { ok: true, message: `${where}에 ${name}${particle} 연결했습니다.`, engine: next };
}
