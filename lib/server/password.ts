import { randomBytes, scrypt, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";

const scryptAsync = promisify(scrypt);
const KEY_LEN = 64;

let placeholderHash: Promise<string> | null = null;

export async function hashPassword(password: string) {
  const salt = randomBytes(16).toString("hex");
  const derived = (await scryptAsync(password, salt, KEY_LEN)) as Buffer;
  return `scrypt$${salt}$${derived.toString("hex")}`;
}

function placeholder() {
  placeholderHash ??= hashPassword("not-a-real-password");
  return placeholderHash;
}

export async function verifyPassword(password: string, stored: string | null | undefined) {
  const target = stored && stored.startsWith("scrypt$") ? stored : await placeholder();
  const [scheme, salt, hash] = target.split("$");
  if (scheme !== "scrypt" || !salt || !hash) return false;
  const derived = (await scryptAsync(password, salt, KEY_LEN)) as Buffer;
  const expected = Buffer.from(hash, "hex");
  if (derived.length !== expected.length) return false;
  const match = timingSafeEqual(derived, expected);
  return Boolean(stored) && match;
}
