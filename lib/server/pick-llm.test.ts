import { describe, expect, it } from "vitest";
import { pickClaudeCredential } from "./pick-llm";

describe("관리자 Claude 키", () => {
  it("키와 워크스페이스가 있으면 호출 설정으로 쓴다", () => {
    expect(pickClaudeCredential("  sk-ant-1234  ", "  ws_123  ")).toEqual({
      apiKey: "sk-ant-1234",
      workspaceId: "ws_123",
    });
  });

  it("키나 워크스페이스가 없으면 설정하지 않는다", () => {
    expect(pickClaudeCredential("", "ws_123")).toBeNull();
    expect(pickClaudeCredential("sk-ant-1234", "")).toBeNull();
    expect(pickClaudeCredential("sk-ant-1234", "ws 123")).toBeNull();
  });
});
