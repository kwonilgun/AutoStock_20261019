import { keyLast4 } from "@/lib/advice-model";
import { prisma } from "@/lib/db";

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

/** 부팅 때 데이터베이스에서 읽어 둔 관리자 키. 저장하면 바로 다시 채운다. */
let active: PickClaudeCredential | null | undefined;

/** 저장된 키와 워크스페이스가 둘 다 있을 때만 호출에 쓴다. */
export function pickClaudeCredential(apiKey: string, workspaceId: string): PickClaudeCredential | null {
  const key = apiKey.trim();
  const workspace = workspaceId.trim();
  if (!key || !workspace || workspace.length > 120 || /\s/.test(workspace)) return null;
  return { apiKey: key, workspaceId: workspace };
}

/** 서버가 켜질 때 관리자 데이터베이스의 키를 읽어 둔다. */
export async function loadPickClaudeSetting(): Promise<void> {
  const row = await prisma.pickClaudeSetting.findUnique({ where: { id: ID } });
  active = pickClaudeCredential(row?.cipher ?? "", row?.workspaceId ?? "");
}

/** 관리자 화면에 보여줄 값. API 키 평문은 돌려주지 않는다. */
export async function readPickClaudeAdmin(): Promise<PickClaudeAdmin> {
  const row = await prisma.pickClaudeSetting.findUnique({ where: { id: ID } });
  return {
    configured: Boolean(row?.cipher.trim()),
    last4: row?.last4 ?? "",
    workspaceId: row?.workspaceId ?? "",
  };
}

/** 부팅 때 읽어 둔 키. 아직 읽기 전이면 데이터베이스에서 한 번 채운다. */
export async function readPickClaudeCredential(): Promise<PickClaudeCredential | null> {
  if (active === undefined) await loadPickClaudeSetting();
  return active ?? null;
}

/** 키가 비어 있으면 기존 키를 유지한다. 워크스페이스는 항상 덮어쓴다. */
export async function savePickClaudeSetting(input: {
  apiKey: string;
  workspaceId: string;
  updatedBy: string;
}): Promise<void> {
  const existing = await prisma.pickClaudeSetting.findUnique({ where: { id: ID } });
  const secret = input.apiKey.trim();
  const cipher = secret || existing?.cipher || "";
  const last4 = secret ? keyLast4(secret) : (existing?.last4 ?? "");
  const workspaceId = input.workspaceId.trim();
  await prisma.pickClaudeSetting.upsert({
    where: { id: ID },
    create: { id: ID, cipher, last4, workspaceId, updatedBy: input.updatedBy },
    update: { cipher, last4, workspaceId, updatedBy: input.updatedBy },
  });
  active = pickClaudeCredential(cipher, workspaceId);
}
