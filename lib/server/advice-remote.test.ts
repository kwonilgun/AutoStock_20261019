import { describe, expect, it } from "vitest";
import { anthropicMessageText, openAiMessageText, readSparkConfig, sparkChatBody, sparkMessageText } from "./advice-remote";

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

  it("Spark 주소와 모델 이름이 있을 때만 Qwen 설정을 만든다", () => {
    const previous = {
      url: process.env.ADVICE_MODEL_URL,
      name: process.env.ADVICE_MODEL_NAME,
      key: process.env.ADVICE_MODEL_KEY,
    };
    process.env.ADVICE_MODEL_URL = "http://spark.local:8000/";
    process.env.ADVICE_MODEL_NAME = "Qwen/qwen3.8-27b";
    process.env.ADVICE_MODEL_KEY = "secret";
    expect(readSparkConfig()).toEqual({ url: "http://spark.local:8000", model: "Qwen/qwen3.8-27b", key: "secret" });
    delete process.env.ADVICE_MODEL_NAME;
    expect(readSparkConfig()).toBeNull();
    if (previous.url === undefined) delete process.env.ADVICE_MODEL_URL;
    else process.env.ADVICE_MODEL_URL = previous.url;
    if (previous.name === undefined) delete process.env.ADVICE_MODEL_NAME;
    else process.env.ADVICE_MODEL_NAME = previous.name;
    if (previous.key === undefined) delete process.env.ADVICE_MODEL_KEY;
    else process.env.ADVICE_MODEL_KEY = previous.key;
  });

  it("자문과 보유 가져오기는 같은 요청 필드를 쓴다", () => {
    expect(sparkChatBody("Qwen/qwen3.8-27b", "규칙", "표")).toEqual({
      model: "Qwen/qwen3.8-27b",
      system_prompt: "규칙",
      input: "표",
      temperature: 0.2,
      reasoning: "off",
      store: false,
    });
  });
});
