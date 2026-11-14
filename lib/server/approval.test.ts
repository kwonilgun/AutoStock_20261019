import { describe, expect, it } from "vitest";
import { loginAllowed } from "@/lib/server/approval";

describe("loginAllowed", () => {
  it("새 회원은 승인이 꺼져 있으면 로그인할 수 없다", () => {
    expect(loginAllowed({ role: "user", approved: false })).toBe(false);
  });

  it("관리자가 승인을 켜면 로그인할 수 있다", () => {
    expect(loginAllowed({ role: "user", approved: true })).toBe(true);
  });

  it("관리자 계정은 승인 여부와 관계없이 로그인한다", () => {
    expect(loginAllowed({ role: "admin", approved: false })).toBe(true);
  });
});
