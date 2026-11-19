import { MEMBER_PROVIDERS, keyLast4, memberProvider, type LlmKeyMask, type MemberProvider } from "@/lib/advice-model";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/server/session";
import { decryptSecret, encryptSecret } from "@/lib/server/secret-box";

async function memberUserId(): Promise<string | null> {
  const user = await getCurrentUser();
  if (!user || user.role === "admin") return null;
  return user.id;
}

export async function listSavedProviders(userId: string): Promise<MemberProvider[]> {
  const rows = await prisma.userLlmKey.findMany({
    where: { userId },
    select: { provider: true },
  });
  const saved = new Set(rows.map((row) => row.provider));
  return MEMBER_PROVIDERS.filter((provider) => saved.has(provider));
}

export async function listLlmKeyMasks(): Promise<LlmKeyMask[]> {
  const userId = await memberUserId();
  if (!userId) return [];
  const rows = await prisma.userLlmKey.findMany({
    where: { userId },
    select: { provider: true, last4: true, cipher: true },
  });
  return MEMBER_PROVIDERS.flatMap((provider) => {
    const row = rows.find((item) => item.provider === provider);
    if (!row) return [];
    let secret: string | null = null;
    try {
      secret = decryptSecret(row.cipher);
    } catch {
      secret = null;
    }
    return [{ provider, last4: row.last4, secret }];
  });
}

export async function saveLlmKey(userId: string, provider: MemberProvider, secret: string): Promise<void> {
  const trimmed = secret.trim();
  const cipher = encryptSecret(trimmed);
  const last4 = keyLast4(trimmed);
  await prisma.userLlmKey.upsert({
    where: { userId_provider: { userId, provider } },
    create: { userId, provider, cipher, last4 },
    update: { cipher, last4 },
  });
}

export async function deleteLlmKey(userId: string, provider: MemberProvider): Promise<void> {
  await prisma.userLlmKey.deleteMany({ where: { userId, provider } });
}

/** 호출 직전에만 복호화한다. 실패하면 null이라 Spark로 넘어간다. */
export async function readLlmKey(userId: string, provider: MemberProvider): Promise<string | null> {
  const row = await prisma.userLlmKey.findUnique({
    where: { userId_provider: { userId, provider } },
    select: { cipher: true },
  });
  if (!row) return null;
  try {
    return decryptSecret(row.cipher);
  } catch {
    return null;
  }
}

export function providerFromForm(value: FormDataEntryValue | null): MemberProvider | null {
  return memberProvider(typeof value === "string" ? value : null);
}
