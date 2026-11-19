import { describe, expect, it } from "vitest";
import { anthropicMessageText, openAiMessageText, sparkMessageText } from "./advice-remote";

describe("자문 응답 본문", () => {
  it("OpenAI 호환 응답에서 글만 꺼낸다", () => {
    expect(openAiMessageText({ choices: [{ message: { content: " {\"phase\":\"a\"} " } }] })).toBe("{\"phase\":\"a\"}");
    expect(openAiMessageText({ choices: [] })).toBe("");
  });

  it("Claude 응답의 텍스트 블록만 잇는다", () => {
    expect(
      anthropicMessageText({
        content: [
          { type: "thinking", thinking: "skip" },
          { type: "text", text: "하나" },
          { type: "text", text: "둘" },
        ],
      }),
    ).toBe("하나\n둘");
  });

  it("Spark 응답의 message 칸만 잇는다", () => {
    expect(sparkMessageText({ output: [{ type: "reasoning", content: "skip" }, { type: "message", content: "본문" }] })).toBe("본문");
  });
});
