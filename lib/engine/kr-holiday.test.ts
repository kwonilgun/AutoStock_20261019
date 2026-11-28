import { describe, expect, it } from "vitest";
import { holidayTableCovers, isClosedDay, isPublicHoliday } from "./kr-holiday";

describe("알림을 쉬는 날", () => {
  it("평일은 열고 토요일과 일요일은 닫는다", () => {
    expect(isClosedDay(new Date("2026-11-26T23:30:00Z"))).toBe(false);
    expect(isClosedDay(new Date("2026-11-27T15:30:00Z"))).toBe(true);
    expect(isClosedDay(new Date("2026-11-28T15:30:00Z"))).toBe(true);
  });

  it("대체공휴일과 평일 공휴일을 닫는다", () => {
    expect(isPublicHoliday("2026-03-02")).toBe(true);
    expect(isPublicHoliday("2026-05-01")).toBe(true);
    expect(isPublicHoliday("2026-05-25")).toBe(true);
    expect(isPublicHoliday("2026-07-17")).toBe(true);
    expect(isPublicHoliday("2026-08-17")).toBe(true);
    expect(isPublicHoliday("2026-10-05")).toBe(true);
    expect(isClosedDay(new Date("2026-12-24T23:30:00Z"))).toBe(true);
    expect(isPublicHoliday("2027-02-09")).toBe(true);
    expect(isPublicHoliday("2027-05-13")).toBe(true);
    expect(isPublicHoliday("2027-05-03")).toBe(true);
    expect(isPublicHoliday("2028-10-05")).toBe(true);
    expect(isPublicHoliday("2026-11-27")).toBe(false);
  });

  it("공휴일표는 2026년부터 2028년까지다", () => {
    expect(holidayTableCovers(2026)).toBe(true);
    expect(holidayTableCovers(2028)).toBe(true);
    expect(holidayTableCovers(2029)).toBe(false);
  });
});
