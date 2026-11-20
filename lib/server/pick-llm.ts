import { keyLast4 } from "@/lib/advice-model";
import { prisma } from "@/lib/db";
import { assignedPickEngine, type PickEngine } from "@/lib/pick-engine";
import { decryptSecret, encryptSecret } from "@/lib/server/secret-box";

const ID = "global";

export type PickClaudeAdmin = {
  configured: boolean;
  last4: string;
  workspaceId: string;
};

export type PickClaudeCredential = {
  apiKey: string;
  workspaceId: string;
};

export async function readUserPickEngine(userId: string): Promise<PickEngine> {
  const row = await prisma.user.findUnique({ where: { id: userId }, select: { pickEngine: true } });
  return assignedPickEngine(row?.pickEngine);
}

/** 관리자 화면에 보여줄 값. API 키 평문은 돌려주지 않는다. */
export async function readPickClaudeAdmin(): Promise<PickClaudeAdmin> {
  const row = await prisma.pickClaudeSetting.findUnique({ where: { id: ID } });
  return {
    configured: Boolean(row?.cipher),
    last4: row?.last4 ?? "",
    workspaceId: row?.workspaceId ?? "",
  };
}

/** 호출 직전에만 복호화한다. 키나 워크스페이스가 없으면 null이다. */
export async function readPickClaudeCredential(): Promise<PickClaudeCredential | null> {
  const row = await prisma.pickClaudeSetting.findUnique({ where: { id: ID } });
  const workspaceId = row?.workspaceId.trim() ?? "";
  if (!row?.cipher || !workspaceId) return null;
  try {
    const apiKey = decryptSecret(row.cipher).trim();
    if (!apiKey) return null;
    return { apiKey, workspaceId };
  } catch {
    return null;
  }
}

/** 키가 비어 있으면 기존 암호문을 유지한다. 워크스페이스는 항상 덮어쓴다. */
export async function savePickClaudeSetting(input: {
  apiKey: string;
  workspaceId: string;
  updatedBy: string;
}): Promise<void> {
  const existing = await prisma.pickClaudeSetting.findUnique({ where: { id: ID } });
  const secret = input.apiKey.trim();
  const cipher = secret ? encryptSecret(secret) : (existing?.cipher ?? "");
  const last4 = secret ? keyLast4(secret) : (existing?.last4 ?? "");
  await prisma.pickClaudeSetting.upsert({
    where: { id: ID },
    create: { id: ID, cipher, last4, workspaceId: input.workspaceId, updatedBy: input.updatedBy },
    update: { cipher, last4, workspaceId: input.workspaceId, updatedBy: input.updatedBy },
  });
}
