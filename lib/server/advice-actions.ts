"use server";

import { revalidatePath } from "next/cache";
import { unstable_rethrow } from "next/navigation";
import { seoulDay } from "@/lib/format";
import { adviceSourceFromView, loadAdvice } from "@/lib/server/advice";
import { latestFedTarget } from "@/lib/server/fed-rate";
import { getView } from "@/lib/server/portfolio";
import { getCurrentUser } from "@/lib/server/session";

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
