import { parseNyFedTarget, type FedTarget } from "@/lib/fed/parse";
import { prisma } from "@/lib/db";
import { seoulDay } from "@/lib/format";

const LOW = "DFEDTARL";
const HIGH = "DFEDTARU";
const CHECK = "FED_TARGET_CHECK";
const SOURCE = "https://markets.newyorkfed.org/api/rates/unsecured/effr/last/1.json";

export type FedTargetQuote = FedTarget & { fresh: boolean };

let fedMemory: { day: string; quote: FedTargetQuote } | null = null;

/** 연준 기준금리 목표 범위. 오늘 이미 확인했으면 저장값을 쓰고, 실패하면 마지막 저장값을 유지한다. */
export async function latestFedTarget(): Promise<FedTargetQuote | null> {
  const today = seoulDay();
  if (fedMemory?.day === today) return fedMemory.quote;
  let stored: FedTarget | null = null;
  try {
    stored = await readStored();
    const checked = await prisma.macroSeries.findUnique({
      where: { seriesId_date: { seriesId: CHECK, date: today } },
    });
    if (stored && checked) {
      const quote = { ...stored, fresh: true as const };
      fedMemory = { day: today, quote };
      return quote;
    }
    const response = await fetch(SOURCE, {
      headers: { accept: "application/json", "user-agent": "Mozilla/5.0" },
      cache: "no-store",
      signal: AbortSignal.timeout(8000),
    });
    if (!response.ok) throw new Error("기준금리 응답이 없습니다.");
    const quote = parseNyFedTarget(await response.json());
    if (!quote) throw new Error("기준금리를 읽지 못했습니다.");
    await saveQuote(quote, today);
    const fresh = { ...quote, fresh: true as const };
    fedMemory = { day: today, quote: fresh };
    return fresh;
  } catch {
    const fallback = stored ?? (await readStored().catch(() => null));
    return fallback ? { ...fallback, fresh: false } : null;
  }
}

async function readStored(): Promise<FedTarget | null> {
  const high = await prisma.macroSeries.findFirst({
    where: { seriesId: HIGH, value: { gt: 0 } },
    orderBy: { date: "desc" },
  });
  if (!high) return null;
  const low = await prisma.macroSeries.findUnique({
    where: { seriesId_date: { seriesId: LOW, date: high.date } },
  });
  if (!low || low.value <= 0 || low.value > high.value) return null;
  return { date: high.date, low: low.value, high: high.value };
}

async function saveQuote(quote: FedTarget, fetchedOn: string) {
  const rows = [
    { seriesId: LOW, date: quote.date, value: quote.low },
    { seriesId: HIGH, date: quote.date, value: quote.high },
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
