import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

/** Next 밖 스크립트가 .env를 읽게 한다. 이미 있는 환경 변수는 유지한다. */
export function loadDotEnv(root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..")) {
  let text = "";
  try {
    text = readFileSync(path.join(root, ".env"), "utf8");
  } catch {
    return;
  }
  for (const line of text.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq <= 0) continue;
    const key = trimmed.slice(0, eq).trim();
    let value = trimmed.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (process.env[key] == null || process.env[key] === "") process.env[key] = value;
  }
}
