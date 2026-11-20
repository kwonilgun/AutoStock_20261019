import { parsePickEngine, type PickEngine } from "@/lib/pick-engine";
import { PICK_HOLDING_LIMIT, PICK_PER_SLEEVE, cleanPickTicker, type PickBuy, type PickSnapshot } from "./pick-context";
import { PHASES, SLEEVES, type Phase, type Sleeve } from "./types";

export type PickItem = {
  sleeve: Sleeve;
  ticker: string;
  name: string;
  note: string;
};

/** Claude가 고른 종목만 남긴다. 요청하지 않은 자산군과 금액 필드는 버린다. */
export function parsePickReply(raw: string | null, buys: PickBuy[]): PickItem[] {
  const allowed = new Set(buys.map((buy) => buy.sleeve));
  const rows = readPicks(raw);
  const seen = new Set<string>();
  const count = new Map<Sleeve, number>();
  const items: PickItem[] = [];
  for (const row of rows) {
    if (!row || typeof row !== "object") continue;
    const sleeve = (row as { sleeve?: unknown }).sleeve;
    if (typeof sleeve !== "string" || !allowed.has(sleeve as Sleeve)) continue;
    const ticker = cleanPickTicker(String((row as { ticker?: unknown }).ticker ?? ""));
    if (!ticker) continue;
    const key = `${sleeve}:${ticker}`;
    if (seen.has(key)) continue;
    const used = count.get(sleeve as Sleeve) ?? 0;
    if (used >= PICK_PER_SLEEVE) continue;
    seen.add(key);
    count.set(sleeve as Sleeve, used + 1);
    const name = clip((row as { name?: unknown }).name, 80) || ticker;
    const note = clip((row as { note?: unknown }).note, 200);
    items.push({ sleeve: sleeve as Sleeve, ticker, name, note });
  }
  return items;
}

/** Claude가 적은 이유 문장. 코드 펜스와 JSON 껍질은 벗기고, 비어 있으면 없는 것으로 본다. */
export function parsePickReason(raw: string | null): string {
  if (!raw) return "";
  const fenced = raw.match(/```(?:json|markdown|md|text)?\s*([\s\S]*?)```/i);
  let text = (fenced?.[1] ?? raw).trim();
  if (text.startsWith("{") && text.endsWith("}")) {
    try {
      const parsed = JSON.parse(text) as { reason?: unknown; text?: unknown };
      const inner = typeof parsed.reason === "string" ? parsed.reason : typeof parsed.text === "string" ? parsed.text : "";
      if (inner.trim()) text = inner.trim();
    } catch {
      // 중괄호로 시작해도 문장이면 그대로 보여 준다.
    }
  }
  return text.replace(/[ \t]+\n/g, "\n").replace(/\n{3,}/g, "\n\n").trim().slice(0, 3000);
}

function readPicks(raw: string | null): unknown[] {
  if (!raw) return [];
  const fenced = raw.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const text = (fenced?.[1] ?? raw).trim();
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start < 0 || end <= start) return [];
  try {
    const parsed = JSON.parse(text.slice(start, end + 1)) as { picks?: unknown };
    return Array.isArray(parsed.picks) ? parsed.picks : [];
  } catch {
    return [];
  }
}

export type StoredPick = {
  snapshot: PickSnapshot;
  items: PickItem[];
  engine: PickEngine;
  /** 이미 받은 추천 이유. 다시 받기로 종목을 새로 쓰면 비운다. */
  reason?: string | null;
};

export function serializeStoredPick(body: StoredPick): string {
  const reason = readStoredReason(body.reason);
  const stored = {
    snapshot: body.snapshot,
    items: body.items,
    engine: body.engine,
    ...(reason ? { reason } : {}),
  };
  return JSON.stringify(stored);
}

/** 저장된 추천을 다시 읽는다. 종목이 없거나 형식이 깨지면 없는 것으로 본다. */
export function parseStoredPick(raw: string): StoredPick | null {
  let value: unknown;
  try {
    value = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!value || typeof value !== "object") return null;
  const snapshot = readSnapshot((value as { snapshot?: unknown }).snapshot);
  const picks = (value as { items?: unknown }).items;
  if (!snapshot || !Array.isArray(picks)) return null;
  const items = parsePickReply(JSON.stringify({ picks }), snapshot.buys);
  if (items.length === 0) return null;
  const rawEngine = (value as { engine?: unknown }).engine;
  return {
    snapshot,
    items,
    engine: parsePickEngine(typeof rawEngine === "string" ? rawEngine : undefined),
    reason: readStoredReason((value as { reason?: unknown }).reason),
  };
}

function readStoredReason(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const text = value.trim().slice(0, 3000);
  return text || null;
}

function readSnapshot(value: unknown): PickSnapshot | null {
  if (!value || typeof value !== "object") return null;
  const phase = (value as { phase?: unknown }).phase;
  const buysRaw = (value as { buys?: unknown }).buys;
  if (!phase || typeof phase !== "object" || !Array.isArray(buysRaw)) return null;
  const id = (phase as { id?: unknown }).id;
  const name = clip((phase as { name?: unknown }).name, 20);
  if (typeof id !== "string" || !(PHASES as readonly string[]).includes(id) || !name) return null;
  const buys: PickBuy[] = [];
  for (const row of buysRaw) {
    const buy = readBuy(row);
    if (!buy) return null;
    buys.push(buy);
  }
  if (buys.length === 0) return null;
  return { phase: { id: id as Phase, name }, buys };
}

function readBuy(value: unknown): PickBuy | null {
  if (!value || typeof value !== "object") return null;
  const sleeve = (value as { sleeve?: unknown }).sleeve;
  if (typeof sleeve !== "string" || !(SLEEVES as readonly string[]).includes(sleeve)) return null;
  const label = clip((value as { label?: unknown }).label, 40);
  const instrument = clip((value as { instrument?: unknown }).instrument, 160);
  const gapPp = (value as { gapPp?: unknown }).gapPp;
  const buyKrw = (value as { buyKrw?: unknown }).buyKrw;
  const holdingsRaw = (value as { holdings?: unknown }).holdings;
  if (!label || !instrument || typeof gapPp !== "number" || !Number.isFinite(gapPp)) return null;
  if (typeof buyKrw !== "number" || !Number.isFinite(buyKrw) || buyKrw <= 0) return null;
  if (!Array.isArray(holdingsRaw)) return null;
  const holdings: PickBuy["holdings"] = [];
  for (const row of holdingsRaw.slice(0, PICK_HOLDING_LIMIT)) {
    if (!row || typeof row !== "object") return null;
    const ticker = cleanPickTicker(String((row as { ticker?: unknown }).ticker ?? ""));
    const name = clip((row as { name?: unknown }).name, 80);
    const valueKrw = (row as { valueKrw?: unknown }).valueKrw;
    if (!ticker || !name || typeof valueKrw !== "number" || !Number.isFinite(valueKrw) || valueKrw <= 0) return null;
    holdings.push({ ticker, name, valueKrw });
  }
  return { sleeve: sleeve as Sleeve, label, instrument, gapPp, buyKrw, holdings };
}

function clip(value: unknown, max: number): string {
  if (typeof value !== "string") return "";
  return value.replace(/\s+/g, " ").trim().slice(0, max);
}
