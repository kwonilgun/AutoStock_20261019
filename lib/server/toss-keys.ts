import { keyLast4 } from "@/lib/advice-model";
import { prisma } from "@/lib/db";
import { decryptSecret, encryptSecret } from "@/lib/server/secret-box";

export type TossKeyMask = {
  clientIdLast4: string;
  clientSecretLast4: string;
};

const KEY_MIN = 8;
const KEY_MAX = 200;

/** 공백 없는 키만 받는다. 길이가 벗어나면 null. */
export function cleanTossKey(value: string): string | null {
  const trimmed = value.trim();
  if (trimmed.length < KEY_MIN || trimmed.length > KEY_MAX) return null;
  if (/\s/.test(trimmed)) return null;
  return trimmed;
}

export async function readTossKeyMask(userId: string): Promise<TossKeyMask | null> {
  const row = await prisma.userTossCredential.findUnique({
    where: { userId },
    select: { clientIdLast4: true, clientSecretLast4: true },
  });
  if (!row) return null;
  return { clientIdLast4: row.clientIdLast4, clientSecretLast4: row.clientSecretLast4 };
}

/** 호출 직전에만 복호화한다. 행이 없으면 null, 암호문이 깨지면 corrupt. */
export async function readTossCredentials(
  userId: string,
): Promise<{ clientId: string; clientSecret: string } | null | "corrupt"> {
  const row = await prisma.userTossCredential.findUnique({
    where: { userId },
    select: { clientIdCipher: true, clientSecretCipher: true },
  });
  if (!row) return null;
  try {
    return {
      clientId: decryptSecret(row.clientIdCipher),
      clientSecret: decryptSecret(row.clientSecretCipher),
    };
  } catch {
    return "corrupt";
  }
}

export async function saveTossCredentials(userId: string, clientId: string, clientSecret: string): Promise<TossKeyMask> {
  const mask = { clientIdLast4: keyLast4(clientId), clientSecretLast4: keyLast4(clientSecret) };
  const data = {
    clientIdCipher: encryptSecret(clientId),
    clientSecretCipher: encryptSecret(clientSecret),
    ...mask,
  };
  await prisma.userTossCredential.upsert({
    where: { userId },
    create: { userId, ...data },
    update: data,
  });
  return mask;
}

export async function deleteTossCredentials(userId: string): Promise<void> {
  await prisma.userTossCredential.deleteMany({ where: { userId } });
}
