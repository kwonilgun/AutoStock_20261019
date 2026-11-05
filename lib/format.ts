export function formatNumber(value: number): string {
  const negative = value < 0;
  const [whole, fraction] = Math.abs(value).toString().split(".");
  const grouped = whole.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  return `${negative ? "-" : ""}${fraction ? `${grouped}.${fraction}` : grouped}`;
}

const AMOUNT_SIGNIFICANT = /[0-9.−-]/;

function groupDigits(digits: string): string {
  return digits.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
}

/** 금액 입력 중 정수 부분에 3자리 쉼표를 붙인다. 음수는 −, 소수점은 그대로 둔다. */
export function formatGroupedInput(value: string): string {
  const minus = /^[−-]/.test(value.trim());
  const cleaned = value.replace(/^[−-]+/, "").replace(/[^\d.]/g, "");
  if (!cleaned) return minus ? "−" : "";
  const dot = cleaned.indexOf(".");
  const wholeRaw = (dot === -1 ? cleaned : cleaned.slice(0, dot)).replace(/\D/g, "");
  const fraction = dot === -1 ? null : cleaned.slice(dot + 1).replace(/\D/g, "");
  let whole = wholeRaw.replace(/^0+/, "");
  if (!whole) whole = wholeRaw.length > 0 || fraction != null ? "0" : "";
  const sign = minus ? "−" : "";
  const grouped = groupDigits(whole);
  return fraction == null ? `${sign}${grouped}` : `${sign}${grouped}.${fraction}`;
}

/** 쉼표가 늘거나 줄어도 숫자 기준으로 캐럿 위치를 유지한다. */
export function groupedInputCaret(before: string, caret: number, after: string): number {
  const count = [...before.slice(0, Math.max(0, caret))].filter((ch) => AMOUNT_SIGNIFICANT.test(ch)).length;
  if (count <= 0) return after.startsWith("−") && /^[−-]/.test(before) ? 1 : 0;
  let seen = 0;
  for (let index = 0; index < after.length; index += 1) {
    if (!AMOUNT_SIGNIFICANT.test(after[index])) continue;
    seen += 1;
    if (seen === count) return index + 1;
  }
  return after.length;
}

export function formatUsd(value: number): string {
  const negative = value < 0;
  const cents = Math.round(Math.abs(value) * 100);
  const whole = Math.floor(cents / 100);
  const fraction = String(cents % 100).padStart(2, "0");
  const grouped = String(whole).replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  return `${negative ? "-" : ""}$${grouped}.${fraction}`;
}

export function formatWon(value: number): string {
  const rounded = Math.round(value);
  const sign = rounded < 0 ? "-" : "";
  return `${sign}₩${formatNumber(Math.abs(rounded))}`;
}

export function formatWonPlain(value: number): string {
  const rounded = Math.abs(Math.round(value));
  const sign = value < 0 ? "-" : "";
  if (rounded >= 10_000 && rounded % 10_000 === 0) {
    return `${sign}${formatNumber(rounded / 10_000)}만 원`;
  }
  return `${sign}${formatNumber(rounded)}원`;
}

export function formatPercent(weight: number): string {
  const percent = Math.round(weight * 1000) / 10;
  return `${percent}%`;
}

export function formatReturn(rate: number): string {
  const percent = Math.round(rate * 1000) / 10;
  if (percent === 0) return "0%";
  const sign = percent > 0 ? "+" : "−";
  return `${sign}${Math.abs(percent)}%`;
}

export function formatPp(value: number): string {
  const rounded = Math.round(value * 10) / 10;
  if (rounded === 0) return "0%p";
  const sign = rounded > 0 ? "+" : "−";
  return `${sign}${Math.abs(rounded)}%p`;
}

export function currentYearMonth(date = new Date()): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
  }).formatToParts(date);
  const year = parts.find((part) => part.type === "year")?.value ?? "0000";
  const month = parts.find((part) => part.type === "month")?.value ?? "01";
  return `${year}-${month}`;
}

export function formatYearMonth(yearMonth: string): string {
  const [year, month] = yearMonth.split("-");
  return `${year}년 ${Number(month)}월`;
}

export function formatDay(date: string): string {
  const [year, month, day] = date.split("-");
  if (!year || !month || !day) return date;
  return `${year}년 ${Number(month)}월 ${Number(day)}일`;
}

export function seoulDay(date = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Seoul" }).format(date);
}

export function formatWhen(date: Date): string {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Seoul",
    month: "numeric",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h12",
  }).formatToParts(date);
  const pick = (type: Intl.DateTimeFormatPartTypes) => parts.find((part) => part.type === type)?.value ?? "";
  const hour = pick("hour").padStart(2, "0");
  const dayPeriod = pick("dayPeriod").toUpperCase() === "AM" ? "오전" : "오후";
  return `${pick("month")}월 ${pick("day")}일 ${dayPeriod} ${hour}:${pick("minute")}`;
}
