import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { createStarterPortfolio } from "@/lib/server/portfolio";
import { hashPassword } from "@/lib/server/password";

export const ADMIN_ID = "admin";
const ADMIN_TEMP_PASSWORD = "admin";

export async function registerUser(email: string, password: string) {
  const passwordHash = await hashPassword(password);
  return prisma.$transaction(async (tx) => {
    const existingUsers = await tx.user.count({ where: { role: "user" } });
    const user = await tx.user.create({
      data: { email, passwordHash, approved: false },
    });
    if (existingUsers === 0) {
      const claimed = await tx.portfolio.updateMany({
        where: { userId: null },
        data: { userId: user.id },
      });
      if (claimed.count > 0) return user;
    }
    await createStarterPortfolio(tx, user.id);
    return user;
  });
}

/** 관리자 계정이 없으면 임시 비밀번호로 만든다. 첫 로그인 뒤 비밀번호를 바꿔야 한다. */
export async function ensureAdminAccount() {
  const existing = await prisma.user.findUnique({ where: { email: ADMIN_ID } });
  if (existing) return;
  try {
    await prisma.user.create({
      data: {
        email: ADMIN_ID,
        name: "관리자",
        role: "admin",
        mustChangePassword: true,
        passwordHash: await hashPassword(ADMIN_TEMP_PASSWORD),
      },
    });
  } catch (error) {
    if (!isUniqueEmailError(error)) throw error;
  }
}

export function isUniqueEmailError(error: unknown) {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002";
}
