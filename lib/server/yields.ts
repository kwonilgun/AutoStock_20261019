import { prisma } from "@/lib/db";
import { seoulDay } from "@/lib/format";
import { expectedYieldDate, newYorkYearMonth, previousYearMonth } from "@/lib/yields/expected";
import { parseTreasuryYieldXml, type TreasuryYield } from "@/lib/yields/parse";

const TEN_YEAR = "DGS10";
const THIRTY_YEAR = "DGS30";
const CHECK = "US_YIELD_CHECK";
const SOURCE = "https://home.treasury.gov/resource-center/data-chart-center/interest-rates/pages/xml";

export type BondYieldQuote = TreasuryYield & { fresh: boolean };

/** 10년·30년 국채 금리. 기대 영업일이 이미 있으면 요청하지 않고, 실패하면 마지막 저장값을 유지한다. */
export async function latestBondYields(): Promise<BondYieldQuote | null> {
  const today = seoulDay();
  const expected = expectedYieldDate();
  let stored: TreasuryYield | null = null;
  try {
    stored = await readStored();
    if (stored && stored.date >= expected) return { ...stored, fresh: true };
    const checked = await prisma.macroSeries.findUnique({
      where: { seriesId_date: { seriesId: CHECK, date: today } },
    });
    if (stored && checked) return { ...stored, fresh: false };
    const quote = await fetchTreasuryYield();
    if (!quote) throw new Error("국채 금리를 읽지 못했습니다.");
    await saveQuote(quote, today);
    return { ...quote, fresh: quote.date >= expected };
  } catch {
    const fallback = stored ?? (await readStored().catch(() => null));
    return fallback ? { ...fallback, fresh: false } : null;
  }
}

async function readStored(): Promise<TreasuryYield | null> {
  const ten = await prisma.macroSeries.findFirst({
    where: { seriesId: TEN_YEAR, value: { gt: 0 } },
    orderBy: { date: "desc" },
  });
  if (!ten) return null;
  const thirty = await prisma.macroSeries.findUnique({
    where: { seriesId_date: { seriesId: THIRTY_YEAR, date: ten.date } },
  });
  if (!thirty || thirty.value <= 0) return null;
  return { date: ten.date, tenYear: ten.value, thirtyYear: thirty.value };
}

async function saveQuote(quote: TreasuryYield, fetchedOn: string) {
  const rows = [
    { seriesId: TEN_YEAR, date: quote.date, value: quote.tenYear },
    { seriesId: THIRTY_YEAR, date: quote.date, value: quote.thirtyYear },
    { seriesId: CHECK, date: fetchedOn, value: 1 },
  ];
  await prisma.$transaction(
    rows.map((row) =>
      prisma.macroSeries.upsert({
        where: { seriesId_date: { seriesId: row.seriesId, date: row.date } },
        create: row,
        update: { value: row.value },
      }),
    ),
  );
}

async function fetchTreasuryYield(): Promise<TreasuryYield | null> {
  const month = newYorkYearMonth();
  const current = parseTreasuryYieldXml(await fetchMonth(month));
  if (current) return current;
  return parseTreasuryYieldXml(await fetchMonth(previousYearMonth(month)));
}

async function fetchMonth(yearMonth: string): Promise<string> {
  const response = await fetch(`${SOURCE}?data=daily_treasury_yield_curve&field_tdr_date_value_month=${yearMonth}`, {
    headers: { accept: "application/xml", "user-agent": "Mozilla/5.0" },
    cache: "no-store",
    signal: AbortSignal.timeout(8000),
  });
  if (!response.ok) throw new Error("국채 금리 응답이 없습니다.");
  return response.text();
}
