import type { PickBuy, PickSell } from "./pick-context";

export const PICK_SCHEDULE_DAYS = 4;

/** 한 주는 주말을 뺀 거래일 5일이다. 휴장일은 빼지 않는다. */
export const PICK_WEEK_DAYS = 5;

/** 이 금액보다 작게 나뉜 주는 비우고 옆 주에 모은다. 1주 계획은 나누지 않는다. */
export const PICK_PLAN_MIN_KRW = 100_000;

export const PICK_PLAN_WEEKS = [1, 2, 4] as const;

export type PickPlanWeeks = (typeof PICK_PLAN_WEEKS)[number];

export function pickPlanWeeksOf(value: unknown): PickPlanWeeks {
  if (value === 1 || value === 2 || value === 4) return value;
  return 1;
}

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
  /** 이번 주 매수 대신 고를 수 있는 종목. 금액은 주인공 종목에만 둔다. */
  alternates?: PickSchedulePick[];
};

export type PickScheduleDay = {
  date: string;
  sells: PickScheduleLine[];
  buys: PickScheduleLine[];
};

export type PickScheduleWeek = {
  index: number;
  start: string;
  end: string;
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

export function formatScheduleWeek(week: Pick<PickScheduleWeek, "index" | "start" | "end">): string {
  const start = formatScheduleDate(week.start);
  const end = formatScheduleDate(week.end);
  const range = week.start === week.end ? start : `${start} – ${end}`;
  return `${week.index}주차 · ${range}`;
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

/** 앞주에는 매도, 그다음 주에는 금액이 큰 매수부터 한 자산군씩 둔다. 작은 나누기는 한 주로 모은다. */
export function buildPickWeekPlan(input: {
  sells: PickSell[];
  buys: PickBuy[];
  items: PickSchedulePick[];
  fromDay: string;
  weeks: PickPlanWeeks;
}): PickScheduleWeek[] {
  const dates = nextTradingDays(input.fromDay, input.weeks * PICK_WEEK_DAYS);
  const schedule = Array.from({ length: input.weeks }, (_, index) => {
    const slice = dates.slice(index * PICK_WEEK_DAYS, (index + 1) * PICK_WEEK_DAYS);
    return {
      index: index + 1,
      start: slice[0] ?? "",
      end: slice[slice.length - 1] ?? "",
      sells: [] as PickScheduleLine[],
      buys: [] as PickScheduleLine[],
    };
  });

  const sells = [...input.sells].sort((a, b) => b.sellKrw - a.sellKrw || a.sleeve.localeCompare(b.sleeve));
  const buys = [...input.buys].sort((a, b) => b.buyKrw - a.buyKrw || a.sleeve.localeCompare(b.sleeve));
  const phases = phaseWeeks(input.weeks, sells.length, buys.length);
  placeSells(schedule, assignSlots(sells, phases.sell));
  placeBuys(schedule, assignSlots(buys, phases.buy), input.items);

  for (const week of schedule) {
    week.sells.sort(byAmount);
    week.buys.sort(byAmount);
  }
  return schedule;
}

function phaseWeeks(weekCount: number, sellCount: number, buyCount: number): { sell: number[]; buy: number[] } {
  if (weekCount <= 1) {
    const only = [0];
    return { sell: sellCount > 0 ? only : [], buy: buyCount > 0 ? only : [] };
  }
  if (sellCount === 0) return { sell: [], buy: indexes(weekCount) };
  if (buyCount === 0) return { sell: indexes(weekCount), buy: [] };
  const sellWeeks = Math.min(sellCount, Math.max(1, Math.floor(weekCount / 2)), weekCount - 1);
  return { sell: indexes(sellWeeks), buy: indexes(weekCount - sellWeeks).map((index) => index + sellWeeks) };
}

function indexes(count: number): number[] {
  return Array.from({ length: count }, (_, index) => index);
}

/** 칸이 주보다 적으면 가장 큰 칸이 남는 주를 이어 받는다. 칸이 더 많으면 마지막 주에 모은다. */
function assignSlots<T>(items: T[], weekIndexes: number[]): { item: T; weeks: number[] }[] {
  if (items.length === 0 || weekIndexes.length === 0) return [];
  if (items.length <= weekIndexes.length) {
    const slots = items.map((item, index) => ({ item, weeks: [weekIndexes[index]] }));
    for (let extra = items.length; extra < weekIndexes.length; extra += 1) slots[0].weeks.push(weekIndexes[extra]);
    return slots;
  }
  const last = weekIndexes[weekIndexes.length - 1];
  const slots = weekIndexes.slice(0, -1).map((week, index) => ({ item: items[index], weeks: [week] }));
  for (const item of items.slice(weekIndexes.length - 1)) slots.push({ item, weeks: [last] });
  return slots;
}

function placeSells(schedule: PickScheduleWeek[], slots: { item: PickSell; weeks: number[] }[]): void {
  for (const slot of slots) {
    const shares = weekShares(slot.item.sellKrw, slot.weeks.length);
    const chunks = allocateSell(slot.item);
    let cursor = 0;
    let used = 0;
    slot.weeks.forEach((week, index) => {
      let need = shares[index] ?? 0;
      while (need > 0 && cursor < chunks.length) {
        const chunk = chunks[cursor];
        const available = chunk.amountKrw - used;
        const take = Math.min(need, available);
        if (take > 0) {
          schedule[week]?.sells.push({ ticker: chunk.ticker, name: chunk.name, label: slot.item.label, amountKrw: take });
          need -= take;
          used += take;
        }
        if (used >= chunk.amountKrw) {
          cursor += 1;
          used = 0;
        }
      }
    });
  }
}

function placeBuys(schedule: PickScheduleWeek[], slots: { item: PickBuy; weeks: number[] }[], items: PickSchedulePick[]): void {
  for (const slot of slots) {
    const picks = items.filter((item) => item.sleeve === slot.item.sleeve);
    const choices = picks.length > 0 ? picks : [{ sleeve: slot.item.sleeve, ticker: "", name: slot.item.label }];
    const [primary, ...alternates] = choices;
    const shares = weekShares(slot.item.buyKrw, slot.weeks.length);
    slot.weeks.forEach((week, index) => {
      const amountKrw = shares[index] ?? 0;
      if (amountKrw <= 0 || !primary) return;
      schedule[week]?.buys.push({
        ticker: primary.ticker,
        name: primary.name,
        label: slot.item.label,
        amountKrw,
        ...(alternates.length > 0 ? { alternates } : {}),
      });
    });
  }
}

/** 10만 원 미만으로 쪼개지면 앞주에 모은다. 1주이거나 20만 원 미만이면 나누지 않는다. */
function weekShares(amount: number, weekCount: number): number[] {
  const total = Math.max(0, Math.round(amount));
  const zeros = Array.from({ length: Math.max(0, weekCount - 1) }, () => 0);
  if (weekCount <= 1 || total < PICK_PLAN_MIN_KRW * 2) return [total, ...zeros];
  const parts = Math.min(weekCount, Math.floor(total / PICK_PLAN_MIN_KRW));
  return [...splitWon(total, parts), ...Array.from({ length: weekCount - parts }, () => 0)];
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
