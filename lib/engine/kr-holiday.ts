/**
 * 서울 기준 주말과 관공서 공휴일.
 * 2026·2027은 우주항공청 월력요항, 2028은 한국천문연구원 달력자료.
 * 노동절·제헌절은 2026년 5월부터 공휴일이다. 임시공휴일은 표에 없다.
 * 2028-04-12 국회의원 선거일은 임기만료 선거일 규정과 달력자료에 따른 날짜다.
 */

const HOLIDAYS = new Set<string>([
  "2026-01-01",
  "2026-02-16",
  "2026-02-17",
  "2026-02-18",
  "2026-03-01",
  "2026-03-02",
  "2026-05-01",
  "2026-05-05",
  "2026-05-24",
  "2026-05-25",
  "2026-06-03",
  "2026-06-06",
  "2026-07-17",
  "2026-08-15",
  "2026-08-17",
  "2026-09-24",
  "2026-09-25",
  "2026-09-26",
  "2026-10-03",
  "2026-10-05",
  "2026-10-09",
  "2026-12-25",
  "2027-01-01",
  "2027-02-06",
  "2027-02-07",
  "2027-02-08",
  "2027-02-09",
  "2027-03-01",
  "2027-05-01",
  "2027-05-03",
  "2027-05-05",
  "2027-05-13",
  "2027-06-06",
  "2027-07-17",
  "2027-07-19",
  "2027-08-15",
  "2027-08-16",
  "2027-09-14",
  "2027-09-15",
  "2027-09-16",
  "2027-10-03",
  "2027-10-04",
  "2027-10-09",
  "2027-10-11",
  "2027-12-25",
  "2027-12-27",
  "2028-01-01",
  "2028-01-26",
  "2028-01-27",
  "2028-01-28",
  "2028-03-01",
  "2028-04-12",
  "2028-05-01",
  "2028-05-02",
  "2028-05-05",
  "2028-06-06",
  "2028-07-17",
  "2028-08-15",
  "2028-10-02",
  "2028-10-03",
  "2028-10-04",
  "2028-10-05",
  "2028-10-09",
  "2028-12-25",
]);

export type SeoulClock = {
  year: number;
  month: number;
  day: number;
  ymd: string;
  weekday: string;
  hour: number;
  minute: number;
};

function part(parts: Intl.DateTimeFormatPart[], type: Intl.DateTimeFormatPartTypes): string {
  return parts.find((item) => item.type === type)?.value ?? "";
}

export function seoulClock(date = new Date()): SeoulClock {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(date);
  let hour = Number(part(parts, "hour"));
  if (hour === 24) hour = 0;
  const year = Number(part(parts, "year"));
  const month = Number(part(parts, "month"));
  const day = Number(part(parts, "day"));
  return {
    year,
    month,
    day,
    ymd: `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`,
    weekday: part(parts, "weekday"),
    hour,
    minute: Number(part(parts, "minute")),
  };
}

export function holidayTableCovers(year: number): boolean {
  return year >= 2026 && year <= 2028;
}

export function isPublicHoliday(ymd: string): boolean {
  return HOLIDAYS.has(ymd);
}

/** 서울 날짜가 토·일 또는 관공서 공휴일이면 알림을 쉬게 한다. */
export function isClosedDay(date = new Date()): boolean {
  const clock = seoulClock(date);
  if (clock.weekday === "Sat" || clock.weekday === "Sun") return true;
  return isPublicHoliday(clock.ymd);
}
