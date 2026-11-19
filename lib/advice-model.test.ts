import { describe, expect, it } from "vitest";
import { adviceEngineLabel, resolveAdviceEngine } from "./advice-model";

describe("자문 모델 이름", () => {
  it("화면에는 짧은 이름을 쓴다", () => {
    expect(adviceEngineLabel("spark")).toBe("Qwen");
    expect(adviceEngineLabel("anthropic")).toBe("Claude");
    expect(adviceEngineLabel("draft")).toBe("초안");
  });
});

describe("자문 모델 선택", () => {
  it("키가 없으면 Spark를 고른다", () => {
    expect(resolveAdviceEngine(null, [])).toBe("spark");
    expect(resolveAdviceEngine("anthropic", [])).toBe("spark");
    expect(resolveAdviceEngine("openai", ["anthropic"])).toBe("spark");
  });

  it("저장한 키의 모델만 선택으로 인정한다", () => {
    expect(resolveAdviceEngine("anthropic", ["anthropic", "google"])).toBe("anthropic");
    expect(resolveAdviceEngine("spark", ["openai"])).toBe("spark");
  });
});
