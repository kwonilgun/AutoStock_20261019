import { describe, expect, it } from "vitest";
import { PHASES } from "./types";
import { defaultWhyNote, parseWhyNotes, resolveWhyNotes, stringifyWhyNotes, whyHasDetail } from "./phase-why";

describe("국면 설명", () => {
  it("기본 A3 설명은 금리·경기·시장이 있다", () => {
    const note = defaultWhyNote("A3");
    expect(whyHasDetail(note)).toBe(true);
    expect(note.sections.map((section) => section.title)).toEqual(["금리", "경기", "시장"]);
  });

  it("관리자가 저장한 국면만 덮어쓴다", () => {
    const json = stringifyWhyNotes({
      A3: { when: "2026년 11월 5일", lead: "관리자가 적은 이유", sections: [], close: "" },
    });
    const custom = parseWhyNotes(json);
    const resolved = resolveWhyNotes(custom);
    expect(resolved.A3.lead).toBe("관리자가 적은 이유");
    expect(resolved.A3.when).toBe("2026년 11월 5일");
    expect(resolved.B1.lead).toBe(defaultWhyNote("B1").lead);
    expect(PHASES.every((phase) => resolved[phase].lead.length > 0 || whyHasDetail(resolved[phase]))).toBe(true);
  });

  it("빈 JSON은 기본 설명을 쓴다", () => {
    expect(parseWhyNotes("")).toEqual({});
    expect(parseWhyNotes("{")).toEqual({});
  });
});
