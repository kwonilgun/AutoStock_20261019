import { prisma } from "@/lib/db";

export type LoginUserRow = {
  id: string;
  email: string;
  lastLoginAt: Date;
  online: boolean;
};

export type LoginUsers = {
  loggedInCount: number;
  onlineCount: number;
  users: LoginUserRow[];
};

/** 예전 가입자는 로그인 시각이 없다. 남은 세션이 있으면 그 시각을, 없으면 가입 시각을 로그인으로 채운다. */
async function backfillLastLogin() {
  await prisma.$executeRaw`
    UPDATE "User"
    SET "lastLoginAt" = COALESCE(
      (SELECT MAX("createdAt") FROM "Session" WHERE "Session"."userId" = "User"."id"),
      "createdAt"
    )
    WHERE "role" = 'user' AND "lastLoginAt" IS NULL
  `;
}

export async function listLoginUsers(): Promise<LoginUsers> {
  await backfillLastLogin();
  const now = new Date();
  const users = await prisma.user.findMany({
    where: { role: "user", lastLoginAt: { not: null } },
    select: {
      id: true,
      email: true,
      lastLoginAt: true,
      sessions: {
        where: { expiresAt: { gt: now } },
        select: { id: true },
        take: 1,
      },
    },
    orderBy: { lastLoginAt: "desc" },
  });

  const rows = users.flatMap((user) => {
    if (!user.lastLoginAt) return [];
    return [{ id: user.id, email: user.email, lastLoginAt: user.lastLoginAt, online: user.sessions.length > 0 }];
  });

  return {
    loggedInCount: rows.length,
    onlineCount: rows.filter((user) => user.online).length,
    users: rows,
  };
}
