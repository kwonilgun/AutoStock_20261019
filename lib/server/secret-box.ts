import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from "node:crypto";

const SALT = "egg-advice-llm";

export class SecretBoxError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SecretBoxError";
  }
}

function secretKey(): Buffer {
  const secret = process.env.ADVICE_CLAUDE_KEY_SECRET?.trim();
  if (!secret) throw new SecretBoxError("ADVICE_CLAUDE_KEY_SECRET가 없습니다.");
  return scryptSync(secret, SALT, 32);
}

/** AES-256-GCM. 반환 문자열에는 평문이 없다. */
export function encryptSecret(plain: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", secretKey(), iv);
  const encrypted = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return ["v1", iv.toString("base64url"), tag.toString("base64url"), encrypted.toString("base64url")].join("$");
}

export function decryptSecret(stored: string): string {
  const [version, ivText, tagText, dataText] = stored.split("$");
  if (version !== "v1" || !ivText || !tagText || !dataText) throw new SecretBoxError("암호문 형식이 아닙니다.");
  const decipher = createDecipheriv("aes-256-gcm", secretKey(), Buffer.from(ivText, "base64url"));
  decipher.setAuthTag(Buffer.from(tagText, "base64url"));
  return Buffer.concat([decipher.update(Buffer.from(dataText, "base64url")), decipher.final()]).toString("utf8");
}
