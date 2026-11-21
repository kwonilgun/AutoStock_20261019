import { unstable_rethrow } from "next/navigation";
import { prisma } from "@/lib/db";
import { parseStoredPick, serializeStoredPick, type StoredPick } from "@/lib/engine/pick-parse";
import { assignedPickEngine, pickVisibleCache } from "@/lib/pick-engine";
import { pickErrorDetail, pickLogText } from "@/lib/pick-log";
import { readPickClaudeCredential } from "@/lib/server/pick-llm";
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

/** 종목 목록은 두고 추천 이유와 향후 계획을 지운다. 다시 받기를 누른 직후에 쓴다. */
export async function clearPickReason(userId: string): Promise<void> {
  const row = await prisma.pickCache.findUnique({ where: { userId } });
  if (!row) return;
  const stored = parseStoredPick(row.body);
  if (!stored?.reason && !stored?.plan) return;
  await prisma.pickCache.update({
    where: { userId },
    data: { body: serializeStoredPick({ snapshot: stored.snapshot, items: stored.items, engine: stored.engine }) },
  });
}

/** 화면을 열 때 보여줄 저장본. Claude로 받은 저장본을 돌려준다. */
export async function loadSavedPick(): Promise<SavedPick | null> {
  try {
    const user = await getCurrentUser();
    if (!user || user.role === "admin" || !user.pickEnabled) {
      console.log(pickLogText({ step: "page", ok: false, kind: user?.pickEnabled === false ? "disabled" : "no-member" }));
      return null;
    }
    const engine = assignedPickEngine();
    const saved = await readPickCache(user.id);
    const claudeReady = Boolean(await readPickClaudeCredential());
    const matched = pickVisibleCache(saved, engine, claudeReady);
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
