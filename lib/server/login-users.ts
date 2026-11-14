import { prisma } from "@/lib/db";

export type LoginUserRow = {
  id: string;
  email: string;
  approved: boolean;
  createdAt: Date;
  lastLoginAt: Date | null;
  online: boolean;
};

export type LoginUsers = {
  loggedInCount: number;
  onlineCount: number;
  users: LoginUserRow[];
};

/** 세션은 있는데 로그인 시각만 비어 있는 예전 계정을 채운다. 한 번도 로그인하지 않은 가입자는 비워 둔다. */
async function backfillLastLogin() {
  await prisma.$executeRaw`
    UPDATE "User"
    SET "lastLoginAt" = (
      SELECT MAX("createdAt") FROM "Session" WHERE "Session"."userId" = "User"."id"
    )
    WHERE "role" = 'user'
      AND "lastLoginAt" IS NULL
      AND EXISTS (SELECT 1 FROM "Session" WHERE "Session"."userId" = "User"."id")
  `;
}

export async function listLoginUsers(): Promise<LoginUsers> {
  await backfillLastLogin();
  const now = new Date();
  const users = await prisma.user.findMany({
    where: { role: "user" },
    select: {
      id: true,
      email: true,
      approved: true,
      createdAt: true,
      lastLoginAt: true,
      sessions: {
        where: { expiresAt: { gt: now } },
        select: { id: true },
        take: 1,
      },
    },
    orderBy: [{ approved: "asc" }, { createdAt: "desc" }],
  });

  const rows = users.map((user) => ({
    id: user.id,
    email: user.email,
    approved: user.approved,
    createdAt: user.createdAt,
    lastLoginAt: user.lastLoginAt,
    online: user.sessions.length > 0,
  }));

  return {
    loggedInCount: rows.filter((user) => user.lastLoginAt).length,
    onlineCount: rows.filter((user) => user.online).length,
    users: rows,
  };
}
