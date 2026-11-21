import { afterEach, describe, expect, it } from "vitest";
import { decryptSecret, encryptSecret } from "./secret-box";

describe("자문 키 암호", () => {
  const previous = process.env.ADVICE_CLAUDE_KEY_SECRET;

  afterEach(() => {
    if (previous === undefined) delete process.env.ADVICE_CLAUDE_KEY_SECRET;
    else process.env.ADVICE_CLAUDE_KEY_SECRET = previous;
  });

  it("암호문만 저장하고 같은 비밀로 되돌린다", () => {
    process.env.ADVICE_CLAUDE_KEY_SECRET = "test-secret";
    const plain = "sk-ant-test-key-value-0001";
    const stored = encryptSecret(plain);
    expect(stored).not.toContain(plain);
    expect(decryptSecret(stored)).toBe(plain);
  });
});
