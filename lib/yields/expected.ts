/** 뉴욕 시각 기준, 이미 발표됐어야 하는 국채 수익률 영업일. 휴장일은 알지 못한다. */
export function expectedYieldDate(now = new Date()): string {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    hourCycle: "h23",
    weekday: "short",
  }).formatToParts(now);
  const pick = (type: Intl.DateTimeFormatPartTypes) => parts.find((part) => part.type === type)?.value ?? "";
  const iso = `${pick("year")}-${pick("month")}-${pick("day")}`;
  const weekday = pick("weekday");
  const publishedToday = Number(pick("hour")) >= 17 && weekday !== "Sat" && weekday !== "Sun";
  return publishedToday ? iso : previousWeekday(iso);
}

export function newYorkYearMonth(now = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/New_York" }).format(now).slice(0, 7).replace("-", "");
}

export function previousYearMonth(yearMonth: string): string {
  const year = Number(yearMonth.slice(0, 4));
  const month = Number(yearMonth.slice(4, 6));
  if (month === 1) return `${year - 1}12`;
  return `${year}${String(month - 1).padStart(2, "0")}`;
}

function previousWeekday(iso: string): string {
  const [year, month, day] = iso.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  do {
    date.setUTCDate(date.getUTCDate() - 1);
  } while (date.getUTCDay() === 0 || date.getUTCDay() === 6);
  return date.toISOString().slice(0, 10);
}
