export type TreasuryYield = {
  date: string;
  tenYear: number;
  thirtyYear: number;
};

/** 미 재무부 일별 국채 수익률 XML에서 10년·30년이 모두 있는 가장 최근 영업일을 읽는다. */
export function parseTreasuryYieldXml(xml: string): TreasuryYield | null {
  let latest: TreasuryYield | null = null;
  for (const match of xml.matchAll(/<entry\b[\s\S]*?<\/entry>/g)) {
    const row = parseEntry(match[0]);
    if (!row) continue;
    if (!latest || row.date > latest.date) latest = row;
  }
  return latest;
}

function parseEntry(entry: string): TreasuryYield | null {
  const rawDate = tagText(entry, "NEW_DATE");
  const date = rawDate?.slice(0, 10);
  const tenYear = yieldPercent(tagText(entry, "BC_10YEAR"));
  const thirtyYear = yieldPercent(tagText(entry, "BC_30YEAR"));
  if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date) || tenYear == null || thirtyYear == null) return null;
  return { date, tenYear, thirtyYear };
}

function tagText(entry: string, tag: string): string | null {
  const match = entry.match(new RegExp(`<d:${tag}(?:\\s[^>]*)?>([^<]*)</d:${tag}>`));
  const value = match?.[1]?.trim();
  return value ? value : null;
}

function yieldPercent(value: string | null): number | null {
  if (!value) return null;
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) return null;
  return Math.round(parsed * 100) / 100;
}
