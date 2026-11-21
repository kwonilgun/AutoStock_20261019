"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { pickPrefsColumns, readPickPrefs, type PickPrefs } from "@/lib/engine/pick-prefs";
import { pickPlanWeeksOf, type PickPlanWeeks } from "@/lib/engine/pick-schedule";
import { getCurrentUser } from "@/lib/server/session";

export type SavePickPrefsResult =
  | { ok: true; message: string; prefs: PickPrefs; planWeeks: PickPlanWeeks }
  | { ok: false; message: string };

/** 추천 기준을 저장한다. 저장된 종목은 지우지 않는다. 다시 받기를 누를 때 새 기준을 쓴다. */
export async function savePickPrefs(input: {
  instrument: string;
  addTo: string;
  market: string;
  aim: string;
  exclude: string[];
  sectors: string[];
  planWeeks: number;
}): Promise<SavePickPrefsResult> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (user.role === "admin") return { ok: false, message: "관리자 계정에는 추천 기준이 없습니다." };
  const parsed = readPickPrefs(input);
  if (!parsed.ok) return parsed;
  const planWeeks = pickPlanWeeksOf(input.planWeeks);
  await prisma.user.update({
    where: { id: user.id },
    data: { ...pickPrefsColumns(parsed.prefs), pickPlanWeeks: planWeeks },
  });
  revalidatePath("/picks");
  revalidatePath("/settings");
  return { ok: true, message: "추천 기준을 저장했습니다.", prefs: parsed.prefs, planWeeks };
}

/** 향후 계획 기간만 저장한다. 추천 종목은 그대로 둔다. */
export async function savePickPlanWeeks(weeks: number): Promise<{ ok: true; planWeeks: PickPlanWeeks } | { ok: false; message: string }> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (user.role === "admin") return { ok: false, message: "관리자 계정에는 추천 기준이 없습니다." };
  const planWeeks = pickPlanWeeksOf(weeks);
  await prisma.user.update({ where: { id: user.id }, data: { pickPlanWeeks: planWeeks } });
  revalidatePath("/picks");
  revalidatePath("/settings");
  return { ok: true, planWeeks };
}
