import { afterEach, describe, expect, it } from "vitest";
import { prisma } from "@/lib/db";
import { decryptSecret } from "@/lib/server/secret-box";
import { cleanTossKey, deleteTossCredentials, saveTossCredentials } from "@/lib/server/toss-keys";

const EMAIL = "toss-key-test@example.com";

describe("토스 키 저장", () => {
  afterEach(async () => {
    await prisma.user.deleteMany({ where: { email: EMAIL } });
  });

  it("공백이 있거나 너무 짧으면 거절한다", () => {
    expect(cleanTossKey("short")).toBeNull();
    expect(cleanTossKey("has space-key")).toBeNull();
    expect(cleanTossKey("tsck_live_example")).toBe("tsck_live_example");
  });

  it("평문 대신 암호문만 저장하고 다시 읽는다", async () => {
    process.env.ADVICE_KEY_SECRET = process.env.ADVICE_KEY_SECRET || "test-secret-for-toss";
    const user = await prisma.user.create({
      data: { email: EMAIL, passwordHash: "test", approved: true },
    });
    const clientId = "tsck_live_exampleid";
    const clientSecret = "s_secretvalue1234";
    const mask = await saveTossCredentials(user.id, clientId, clientSecret);
    const row = await prisma.userTossCredential.findUniqueOrThrow({ where: { userId: user.id } });
    expect(row.clientIdCipher).not.toContain(clientId);
    expect(row.clientSecretCipher).not.toContain(clientSecret);
    expect(mask).toEqual({ clientIdLast4: clientId.slice(-4), clientSecretLast4: clientSecret.slice(-4) });
    expect(decryptSecret(row.clientIdCipher)).toBe(clientId);
    expect(decryptSecret(row.clientSecretCipher)).toBe(clientSecret);
    await deleteTossCredentials(user.id);
    expect(await prisma.userTossCredential.findUnique({ where: { userId: user.id } })).toBeNull();
  });
});
