import type { GapBucket } from "./gap";
import { seoulClock } from "./kr-holiday";
import { formatPercent, formatPp } from "@/lib/format";

/** 화면과 같이 소수 한 자리로 반올림한 뒤, 회원이 정한 범위 밖이면 알린다. */
export const DEFAULT_GAP_ALERT_BAND = { over: 5, under: 5 };

export type GapAlertBand = { over: number; under: number };

export type AlertSlot = "08" | "14";

export function parseGapBandInput(value: unknown): number | null {
  const text = typeof value === "number" ? String(value) : typeof value === "string" ? value.trim().replace(/%/g, "") : "";
  if (!text) return null;
  const number = Number(text);
  if (!Number.isFinite(number) || number < 0 || number > 100) return null;
  return Math.round(number * 10) / 10;
}

export function gapAlertBand(over: unknown, under: unknown): GapAlertBand {
  return {
    over: parseGapBandInput(over) ?? DEFAULT_GAP_ALERT_BAND.over,
    under: parseGapBandInput(under) ?? DEFAULT_GAP_ALERT_BAND.under,
  };
}

export function crossesGapAlert(gapPp: number, band: GapAlertBand = DEFAULT_GAP_ALERT_BAND): boolean {
  const rounded = Math.round(gapPp * 10) / 10;
  return rounded >= band.over || rounded <= -band.under;
}

/** 오전 8시부터 9시 30분, 오후 2시부터 3시 30분. 잠들었다 깨어난 맥이 그 안에 들어오면 그 회차만 보낸다. */
export function alertSlot(date = new Date()): AlertSlot | null {
  const clock = seoulClock(date);
  const minuteOfDay = clock.hour * 60 + clock.minute;
  if (minuteOfDay >= 8 * 60 && minuteOfDay < 9 * 60 + 30) return "08";
  if (minuteOfDay >= 14 * 60 && minuteOfDay < 15 * 60 + 30) return "14";
  return null;
}

export function alertHits(buckets: GapBucket[], band: GapAlertBand = DEFAULT_GAP_ALERT_BAND): GapBucket[] {
  return buckets.filter((bucket) => crossesGapAlert(bucket.summary.gapPp, band));
}

function gapSide(bucket: GapBucket): string {
  if (bucket.summary.status === "over") return "과다";
  if (bucket.summary.status === "under") return "부족";
  if (bucket.summary.status === "match") return "일치";
  return "유지";
}

function writeBuckets(lines: string[], buckets: GapBucket[], band: GapAlertBand): void {
  for (const bucket of buckets) {
    const summary = bucket.summary;
    lines.push(`${bucket.label} ${gapSide(bucket)} ${formatPp(summary.gapPp)}`);
    lines.push(`지금 ${formatPercent(summary.currentWeight)} · 목표 ${formatPercent(summary.targetWeight)}`);
    for (const member of bucket.members) {
      if (!crossesGapAlert(member.gapPp, band)) continue;
      lines.push(`· ${member.label} ${formatPp(member.gapPp)}`);
    }
    lines.push("");
  }
}

export function formatGapAlert(
  when: string,
  buckets: GapBucket[],
  title = "에그발란스 괴리",
  band: GapAlertBand = DEFAULT_GAP_ALERT_BAND,
): string {
  const lines = [title, when, ""];
  writeBuckets(lines, buckets, band);
  return lines.join("\n").trim();
}

/** 텔레그램 /start 코드 또는 코드만 온 메시지에서 연결 코드를 꺼낸다. */
export function telegramStartCode(text: string): string | null {
  const trimmed = text.trim();
  const start = trimmed.match(/^\/start(?:@\w+)?\s+([A-Za-z0-9_-]+)$/);
  if (start?.[1]) return start[1];
  if (/^[A-Za-z0-9_-]{6,32}$/.test(trimmed)) return trimmed;
  return null;
}

/** 화면에는 /start 만 보이고 코드가 빠진 시작 메시지. */
export function isBareTelegramStart(text: string): boolean {
  return /^\/start(?:@\w+)?$/.test(text.trim());
}
