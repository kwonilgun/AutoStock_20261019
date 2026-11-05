import { describe, expect, it } from "vitest";
import { INVESTOR_STYLES } from "./investor";
import { PHASE_STORY } from "./phase-story";
import { PHASES } from "./types";

describe("국면 설명", () => {
  it("여섯 국면마다 배경, 비중 이유, 세 성향 문장이 있다", () => {
    for (const phase of PHASES) {
      const story = PHASE_STORY[phase];
      expect(story.why.length).toBeGreaterThan(20);
      expect(story.stance.length).toBeGreaterThan(20);
      for (const style of INVESTOR_STYLES) {
        expect(story.forStyle[style].length).toBeGreaterThan(20);
      }
    }
  });

  it("침체 국면 설명은 장기채를 최대로 두는 비중표와 같다", () => {
    expect(PHASE_STORY.B2.stance).toContain("35%");
    expect(PHASE_STORY.B2.stance).not.toContain("채권 매도");
  });
});
