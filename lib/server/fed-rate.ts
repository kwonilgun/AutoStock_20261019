import { after } from "next/server";
import { parseNyFedTarget, type FedTarget } from "@/lib/fed/parse";
import { prisma } from "@/lib/db";
import { seoulDay } from "@/lib/format";

const LOW = "DFEDTARL";
const HIGH = "DFEDTARU";
const CHECK = "FED_TARGET_CHECK";
const SOURCE = "https://markets.newyorkfed.org/api/rates/unsecured/effr/last/1.json";

export type FedTargetQuote = FedTarget & { fresh: boolean };

let fedMemory: { day: string; quote: FedTargetQuote } | null = null;
let fedRefresh: Promise<void> | null = null;

/** 연준 기준금리 목표 범위. 화면은 저장값을 바로 쓰고, 오늘 확인이 없으면 응답 뒤에 다시 받는다. */
export async function latestFedTarget(): Promise<FedTargetQuote | null> {
  const today = seoulDay();
  if (fedMemory?.day === today) return fedMemory.quote;
  const stored = await readStored().catch(() => null);
  const checked = await prisma.macroSeries
    .findUnique({ where: { seriesId_date: { seriesId: CHECK, date: today } } })
    .catch(() => null);
  if (stored && checked) {
    const quote = { ...stored, fresh: true as const };
    fedMemory = { day: today, quote };
    return quote;
  }
  after(() => {
    void refreshFedTarget();
  });
  return stored ? { ...stored, fresh: false } : null;
}

function refreshFedTarget() {
  if (fedRefresh) return fedRefresh;
  fedRefresh = pullFedTarget().finally(() => {
    fedRefresh = null;
  });
  return fedRefresh;
}

async function pullFedTarget() {
  const today = seoulDay();
  try {
    const response = await fetch(SOURCE, {
      headers: { accept: "application/json", "user-agent": "Mozilla/5.0" },
      cache: "no-store",
      signal: AbortSignal.timeout(8000),
    });
    if (!response.ok) return;
    const quote = parseNyFedTarget(await response.json());
    if (!quote) return;
    await saveQuote(quote, today);
    fedMemory = { day: today, quote: { ...quote, fresh: true } };
  } catch {
    // 받지 못하면 마지막 저장값을 유지한다.
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
