import { PrismaClient } from "@prisma/client";

/** 스키마가 바뀌면 숫자를 올려, 개발 서버가 예전 Prisma 클라이언트를 재사용하지 않게 한다. */
const CLIENT_GEN = 3;

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient; prismaGen?: number };

function createPrisma() {
  const stale = globalForPrisma.prisma && globalForPrisma.prismaGen !== CLIENT_GEN;
  if (stale) void globalForPrisma.prisma?.$disconnect();
  if (!stale && globalForPrisma.prisma) return globalForPrisma.prisma;
  const prisma = new PrismaClient();
  if (process.env.NODE_ENV !== "production") {
    globalForPrisma.prisma = prisma;
    globalForPrisma.prismaGen = CLIENT_GEN;
  }
  return prisma;
}

export const prisma = createPrisma();
