import { prisma } from "@/lib/db";
import { alertHits, alertSlot, formatGapAlert, gapAlertBand, type AlertSlot } from "@/lib/engine/gap-alert";
import { gapBuckets, type GapBucket } from "@/lib/engine/gap";
import { holidayTableCovers, isClosedDay, seoulClock } from "@/lib/engine/kr-holiday";
import { pickPrefsFromRow } from "@/lib/engine/pick-prefs";
import { rebalance } from "@/lib/engine/rebalance";
import { currentYearMonth, formatWhen, seoulDay } from "@/lib/format";
import { ensurePortfolio, toHoldingInput } from "@/lib/server/portfolio";
import { refreshFx } from "@/lib/server/fx";
import { getPhaseSetting } from "@/lib/server/phase-setting";
import { refreshPrices } from "@/lib/server/prices";
import { sendTelegram, telegramToken } from "@/lib/server/telegram";
import { forgetViews } from "@/lib/server/view-cache";

function errorText(error: unknown): string {
  return error instanceof Error ? error.message : "unknown";
}

type GapUser = {
  id: string;
  email: string;
  pickInstrument: string;
  pickAddTo: string;
  pickMarket: string;
  pickAim: string;
  pickExclude: string;
  pickSectors: string;
  telegramGapOver: number;
  telegramGapUnder: number;
};

async function bucketsForUser(user: GapUser): Promise<GapBucket[]> {
  const portfolio = await ensurePortfolio(user.id);
  if (!portfolio.holdings.some((holding) => holding.quantity > 0)) return [];
  await Promise.all([
    refreshFx(portfolio).catch((error: unknown) => {
      console.error(`[gap-alert] fx ${user.email} ${errorText(error)}`);
    }),
    refreshPrices(portfolio).catch((error: unknown) => {
      console.error(`[gap-alert] price ${user.email} ${errorText(error)}`);
    }),
  ]);
  forgetViews(user.id);
  const fresh = await ensurePortfolio(user.id);
  const setting = await getPhaseSetting();
  const aim = pickPrefsFromRow({
    instrument: user.pickInstrument,
    addTo: user.pickAddTo,
    market: user.pickMarket,
    aim: user.pickAim,
    exclude: user.pickExclude,
    sectors: user.pickSectors,
  })?.aim ?? null;
  const month = currentYearMonth();
  const result = rebalance({
    phase: setting.phase,
    weights: setting.weights,
    aim,
    holdings: fresh.holdings.map(toHoldingInput),
    fx: { USDKRW: fresh.usdKrw },
    incomes: fresh.incomes
      .filter((income) => currentYearMonth(income.date) === month)
      .map((income) => ({
        ticker: income.ticker,
        amountKrw: income.currency === "USD" ? Math.round(income.amount * fresh.usdKrw) : Math.round(income.amount),
      })),
    asOf: new Date().toISOString(),
  });
  if (result.totalKrw <= 0) return [];
  return gapBuckets(result.sleeves);
}

async function hitsForUser(user: GapUser) {
  return alertHits(await bucketsForUser(user), gapAlertBand(user.telegramGapOver, user.telegramGapUnder));
}

/** 설정의 지금 보내기. 시각·휴일과 상관없이, 이 회원이 정한 범위를 벗어난 묶음만 보낸다. */
export async function sendCurrentGap(user: GapUser & { telegramChatId: string | null }): Promise<
  { ok: true; message: string } | { ok: false; message: string }
> {
  const token = telegramToken();
  if (!token) return { ok: false, message: "텔레그램 봇 토큰이 없습니다." };
  if (!user.telegramChatId) return { ok: false, message: "텔레그램을 먼저 연결하세요." };
  let buckets: GapBucket[] = [];
  try {
    buckets = await bucketsForUser(user);
  } catch (error) {
    console.error(`[gap-alert] now ${user.email} ${errorText(error)}`);
    return { ok: false, message: "괴리를 계산하지 못했습니다." };
  }
  if (buckets.length === 0) return { ok: false, message: "보유가 없어 보낼 괴리가 없습니다." };
  const band = gapAlertBand(user.telegramGapOver, user.telegramGapUnder);
  const hits = alertHits(buckets, band);
  if (hits.length === 0) return { ok: false, message: "설정한 범위를 벗어난 묶음이 없습니다." };
  try {
    await sendTelegram(token, user.telegramChatId, formatGapAlert(formatWhen(new Date()), hits, "에그발란스 지금 괴리", band));
  } catch (error) {
    console.error(`[gap-alert] now send ${user.email} ${errorText(error)}`);
    return { ok: false, message: "텔레그램으로 보내지 못했습니다." };
  }
  return { ok: true, message: "범위를 벗어난 괴리를 텔레그램으로 보냈습니다." };
}

export async function runGapAlerts(now = new Date()): Promise<{ sent: number; line: string }> {
  if (isClosedDay(now)) return { sent: 0, line: "주말 또는 공휴일이라 보내지 않습니다." };
  const slot = alertSlot(now);
  if (!slot) return { sent: 0, line: "알림 시각이 아니라 보내지 않습니다." };
  const clock = seoulClock(now);
  if (!holidayTableCovers(clock.year)) {
    console.error(`[gap-alert] ${clock.year}년 공휴일표가 없습니다. 주말만 건너뜁니다.`);
  }
  const token = telegramToken();
  if (!token) return { sent: 0, line: "TELEGRAM_BOT_TOKEN이 없어 보내지 않습니다." };

  const users = await prisma.user.findMany({
    where: { role: "user", approved: true, telegramChatId: { not: null } },
  });
  if (users.length === 0) return { sent: 0, line: "텔레그램을 연결한 회원이 없어 보내지 않습니다." };
  const day = seoulDay(now);
  const when = formatWhen(now);
  let sent = 0;
  let already = 0;
  let failed = 0;
  for (const user of users) {
    const chatId = user.telegramChatId;
    if (!chatId) continue;
    const delivery = await deliverOne(token, user, chatId, day, slot, when);
    if (delivery === "sent") sent += 1;
    if (delivery === "already") already += 1;
    if (delivery === "failed") failed += 1;
  }
  if (sent > 0) return { sent, line: `${sent}명에게 보냈습니다.` };
  if (failed > 0) return { sent: 0, line: `${failed}명은 계산이나 전송에 실패했습니다.` };
  if (already > 0) return { sent: 0, line: "이번 회차는 이미 보냈습니다." };
  return { sent: 0, line: "설정한 범위를 벗어난 괴리가 없어 보내지 않습니다." };
}

async function deliverOne(
  token: string,
  user: {
    id: string;
    email: string;
    pickInstrument: string;
    pickAddTo: string;
    pickMarket: string;
    pickAim: string;
    pickExclude: string;
    pickSectors: string;
    telegramGapOver: number;
    telegramGapUnder: number;
  },
  chatId: string,
  day: string,
  slot: AlertSlot,
  when: string,
): Promise<"sent" | "quiet" | "already" | "failed"> {
  const existing = await prisma.gapAlertLog.findUnique({
    where: { userId_day_slot: { userId: user.id, day, slot } },
  });
  if (existing) return "already";
  let hits: ReturnType<typeof alertHits> = [];
  try {
    hits = await hitsForUser(user);
  } catch (error) {
    console.error(`[gap-alert] calc ${user.email} ${errorText(error)}`);
    return "failed";
  }
  if (hits.length === 0) return "quiet";
  try {
    await prisma.gapAlertLog.create({ data: { userId: user.id, day, slot } });
  } catch {
    return "already";
  }
  try {
    await sendTelegram(token, chatId, formatGapAlert(when, hits, "에그발란스 괴리", gapAlertBand(user.telegramGapOver, user.telegramGapUnder)));
    return "sent";
  } catch (error) {
    await prisma.gapAlertLog.delete({ where: { userId_day_slot: { userId: user.id, day, slot } } }).catch(() => undefined);
    console.error(`[gap-alert] send ${user.email} ${errorText(error)}`);
    return "failed";
  }
}
