import { describe, expect, it } from "vitest";
import { browserClaudeHeaders, claudeAdviceBody } from "./advice-claude";

describe("브라우저 Claude 자문 요청", () => {
  it("서버 자문과 같은 본문 필드를 쓴다", () => {
    expect(claudeAdviceBody("claude-sonnet-5-5", "규칙", "질문")).toEqual({
      model: "claude-sonnet-5-5",
      max_tokens: 4000,
      system: "규칙",
      messages: [{ role: "user", content: "질문" }],
    });
  });

  it("워크스페이스가 있으면 헤더에만 싣는다", () => {
    expect(browserClaudeHeaders("sk-ant-test", "")).toMatchObject({
      "x-api-key": "sk-ant-test",
      "anthropic-version": "2023-06-01",
      "anthropic-dangerous-direct-browser-access": "true",
    });
    expect(browserClaudeHeaders("sk-ant-test", "")["anthropic-workspace-id"]).toBeUndefined();
    expect(browserClaudeHeaders("sk-ant-test", "wrkspc_1")["anthropic-workspace-id"]).toBe("wrkspc_1");
  });
});
