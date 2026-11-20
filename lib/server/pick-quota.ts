import { prisma } from "@/lib/db";
import type { PickQuota } from "@/lib/pick-engine";

export async function readPickQuota(userId: string): Promise<PickQuota> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { pickLimit: true, pickUsed: true },
  });
  const limit = user?.pickLimit ?? 1;
  const used = user?.pickUsed ?? 0;
  return {
    limit: Number.isInteger(limit) && limit >= 0 ? limit : 1,
    used: Number.isInteger(used) && used >= 0 ? used : 0,
  };
}

/** 한 번 쓸 수 있을 때만 사용 횟수를 올린다. 동시에 눌러도 제한을 넘지 않는다. */
export async function takePickUse(userId: string): Promise<boolean> {
  const changed = await prisma.$executeRaw`
    UPDATE "User"
    SET "pickUsed" = "pickUsed" + 1
    WHERE "id" = ${userId}
      AND "pickEnabled" = 1
      AND "pickUsed" < "pickLimit"
  `;
  return Number(changed) > 0;
}

/** 모델 호출이 실패하면 방금 올린 횟수를 되돌린다. */
export async function giveBackPickUse(userId: string): Promise<void> {
  await prisma.$executeRaw`
    UPDATE "User"
    SET "pickUsed" = CASE WHEN "pickUsed" > 0 THEN "pickUsed" - 1 ELSE 0 END
    WHERE "id" = ${userId}
  `;
}
