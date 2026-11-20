import { unstable_rethrow } from "next/navigation";
import { prisma } from "@/lib/db";
import { parseStoredPick, serializeStoredPick, type StoredPick } from "@/lib/engine/pick-parse";
import { pickErrorDetail, pickLogText } from "@/lib/pick-log";
import { readUserPickEngine } from "@/lib/server/pick-llm";
import { getCurrentUser } from "@/lib/server/session";

export type SavedPick = StoredPick & { cachedAt: string };

export async function readPickCache(userId: string): Promise<SavedPick | null> {
  const row = await prisma.pickCache.findUnique({ where: { userId } });
  if (!row) return null;
  const stored = parseStoredPick(row.body);
  if (!stored) return null;
  return { ...stored, cachedAt: row.updatedAt.toISOString() };
}

export async function writePickCache(userId: string, body: StoredPick): Promise<string> {
  const row = await prisma.pickCache.upsert({
    where: { userId },
    create: { userId, body: serializeStoredPick(body) },
    update: { body: serializeStoredPick(body) },
  });
  return row.updatedAt.toISOString();
}

export async function clearPickCache(userId: string): Promise<void> {
  await prisma.pickCache.deleteMany({ where: { userId } });
}

/** 화면을 열 때 보여줄 저장본. 관리자가 지정한 모델의 저장본만 돌려준다. */
export async function loadSavedPick(): Promise<SavedPick | null> {
  try {
    const user = await getCurrentUser();
    if (!user || user.role === "admin" || !user.pickEnabled) {
      console.log(pickLogText({ step: "page", ok: false, kind: user?.pickEnabled === false ? "disabled" : "no-member" }));
      return null;
    }
    const engine = await readUserPickEngine(user.id);
    const saved = await readPickCache(user.id);
    const matched = saved?.engine === engine ? saved : null;
    console.log(
      pickLogText({
        step: "page",
        ok: Boolean(matched),
        kind: matched ? "cached" : "miss",
        model: engine,
        buys: matched?.snapshot.buys.length ?? 0,
        items: matched?.items.length ?? 0,
        sleeves: matched?.snapshot.buys.map((buy) => buy.sleeve),
      }),
    );
    return matched;
  } catch (error) {
    unstable_rethrow(error);
    console.log(pickLogText({ step: "page", ok: false, kind: "read-failed", detail: pickErrorDetail(error) }));
    return null;
  }
}
