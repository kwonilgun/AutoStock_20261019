import { describe, expect, it } from "vitest";
import type { AdviceContext } from "@/lib/engine/advice-context";
import { adviceFromClaudeReply } from "@/lib/server/advice";

const context = {} as AdviceContext;

describe("Claude 자문 표시", () => {
  it("엔진 숫자와 달라도 받은 네 칸을 그대로 둔다", async () => {
    const brief = await adviceFromClaudeReply(
      context,
      JSON.stringify({
        phase: "국면",
        portfolio: "포트폴리오",
        actions: "금 100만 원을 매수합니다.",
        leave: "그대로 둡니다.",
      }),
    );
    expect(brief.source).toBe("anthropic");
    expect(brief.notice).toBeNull();
    expect(brief.actions).toBe("금 100만 원을 매수합니다.");
  });

  it("JSON이 아니면 받은 원문을 보여 준다", async () => {
    const brief = await adviceFromClaudeReply(context, "그냥 문장입니다.");
    expect(brief.source).toBe("anthropic");
    expect(brief.phase).toBe("그냥 문장입니다.");
    expect(brief.portfolio).toBe("");
    expect(brief.actions).toBe("");
    expect(brief.leave).toBe("");
  });
});
