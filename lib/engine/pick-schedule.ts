import type { PickBuy, PickSell } from "./pick-context";

export const PICK_SCHEDULE_DAYS = 4;

export type PickSchedulePick = {
  sleeve: string;
  ticker: string;
  name: string;
};

export type PickScheduleLine = {
  ticker: string;
  name: string;
  label: string;
  amountKrw: number;
};

export type PickScheduleDay = {
  date: string;
  sells: PickScheduleLine[];
  buys: PickScheduleLine[];
};

/** 서울 달력의 다음 날부터 주말을 건너뛴 거래일. 휴장일은 빼지 않는다. */
export function nextTradingDays(fromDay: string, count = PICK_SCHEDULE_DAYS): string[] {
  const days: string[] = [];
  let cursor = shiftDay(fromDay, 1);
  while (days.length < count) {
    if (!isWeekend(cursor)) days.push(cursor);
    cursor = shiftDay(cursor, 1);
  }
  return days;
}

export function formatScheduleDate(date: string): string {
  const [year, month, day] = date.split("-").map(Number);
  const weekday = ["일", "월", "화", "수", "목", "금", "토"][new Date(Date.UTC(year, month - 1, day)).getUTCDay()] ?? "";
  return `${month}월 ${day}일 ${weekday}`;
}

/** 넘친 금액은 큰 보유부터 나누고, 살 금액은 후보를 날짜마다 돌려 4거래일에 균등 분할한다. */
export function buildPickSchedule(input: {
  sells: PickSell[];
  buys: PickBuy[];
  items: PickSchedulePick[];
  fromDay: string;
  days?: number;
}): PickScheduleDay[] {
  const count = input.days ?? PICK_SCHEDULE_DAYS;
  const dates = nextTradingDays(input.fromDay, count);
  const schedule = dates.map((date) => ({ date, sells: [] as PickScheduleLine[], buys: [] as PickScheduleLine[] }));

  for (const sell of input.sells) {
    for (const row of allocateSell(sell)) {
      splitWon(row.amountKrw, count).forEach((amountKrw, index) => {
        if (amountKrw <= 0) return;
        schedule[index]?.sells.push({ ticker: row.ticker, name: row.name, label: sell.label, amountKrw });
      });
    }
  }

  for (const buy of input.buys) {
    const picks = input.items.filter((item) => item.sleeve === buy.sleeve);
    const choices = picks.length > 0 ? picks : [{ sleeve: buy.sleeve, ticker: "", name: buy.label }];
    splitWon(buy.buyKrw, count).forEach((amountKrw, index) => {
      if (amountKrw <= 0) return;
      const pick = choices[index % choices.length];
      schedule[index]?.buys.push({ ticker: pick.ticker, name: pick.name, label: buy.label, amountKrw });
    });
  }

  for (const day of schedule) {
    day.sells.sort(byAmount);
    day.buys.sort(byAmount);
  }
  return schedule;
}

function allocateSell(sell: PickSell): { ticker: string; name: string; amountKrw: number }[] {
  const holdings = [...sell.holdings].sort((a, b) => b.valueKrw - a.valueKrw || a.ticker.localeCompare(b.ticker));
  let left = Math.max(0, Math.round(sell.sellKrw));
  const rows: { ticker: string; name: string; amountKrw: number }[] = [];
  for (const holding of holdings) {
    if (left <= 0) break;
    const take = Math.min(left, Math.max(0, Math.round(holding.valueKrw)));
    if (take <= 0) continue;
    rows.push({ ticker: holding.ticker, name: holding.name, amountKrw: take });
    left -= take;
  }
  if (left > 0) {
    if (rows[0]) rows[0].amountKrw += left;
    else rows.push({ ticker: "", name: sell.label, amountKrw: left });
  }
  return rows;
}

function splitWon(amount: number, parts: number): number[] {
  const total = Math.max(0, Math.round(amount));
  const base = Math.floor(total / parts);
  const extra = total % parts;
  return Array.from({ length: parts }, (_, index) => base + (index < extra ? 1 : 0));
}

function byAmount(a: PickScheduleLine, b: PickScheduleLine): number {
  return b.amountKrw - a.amountKrw || a.ticker.localeCompare(b.ticker);
}

function shiftDay(day: string, days: number): string {
  const [year, month, date] = day.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, date + days)).toISOString().slice(0, 10);
}

function isWeekend(day: string): boolean {
  const [year, month, date] = day.split("-").map(Number);
  const weekday = new Date(Date.UTC(year, month - 1, date)).getUTCDay();
  return weekday === 0 || weekday === 6;
}
