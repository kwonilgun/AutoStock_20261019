export const PICK_INSTRUMENTS = ["etf", "mix", "stock"] as const;
export const PICK_ADD_TOS = ["existing", "half", "fresh"] as const;
export const PICK_MARKETS = ["kr", "both", "us"] as const;
export const PICK_AIMS = ["payout", "both", "price"] as const;
export const PICK_EXCLUDES = ["leverage", "single"] as const;
export const PICK_SECTORS = ["tech", "semi", "finance", "energy", "health", "consumer", "industrial"] as const;

export type PickInstrument = (typeof PICK_INSTRUMENTS)[number];
export type PickAddTo = (typeof PICK_ADD_TOS)[number];
export type PickMarket = (typeof PICK_MARKETS)[number];
export type PickAim = (typeof PICK_AIMS)[number];
export type PickExclude = (typeof PICK_EXCLUDES)[number];
export type PickSector = (typeof PICK_SECTORS)[number];

/** 종목 추천에 쓰는 기준. 우선만 목표 비중을 기울이고, 나머지 항목은 종목 선택에만 쓴다. */
export type PickPrefs = {
  instrument: PickInstrument;
  addTo: PickAddTo;
  market: PickMarket;
  aim: PickAim;
  exclude: PickExclude[];
  sectors: PickSector[];
};

export const PICK_INSTRUMENT_LABEL: Record<PickInstrument, string> = {
  etf: "ETF 위주",
  mix: "ETF와 개별주",
  stock: "개별주 위주",
};

export const PICK_ADD_TO_LABEL: Record<PickAddTo, string> = {
  existing: "가진 종목을 더 삼",
  half: "반반",
  fresh: "새 종목",
};

export const PICK_MARKET_LABEL: Record<PickMarket, string> = {
  kr: "한국",
  both: "둘 다",
  us: "미국",
};

export const PICK_AIM_LABEL: Record<PickAim, string> = {
  payout: "배당 이자 우선",
  both: "둘 다",
  price: "가격 상승 우선",
};

export const PICK_EXCLUDE_LABEL: Record<PickExclude, string> = {
  leverage: "레버리지·인버스",
  single: "개별 종목",
};

export const PICK_SECTOR_LABEL: Record<PickSector, string> = {
  tech: "기술",
  semi: "반도체",
  finance: "금융",
  energy: "에너지",
  health: "헬스케어",
  consumer: "소비",
  industrial: "산업·방산",
};

export const PICK_PREFS_REQUIRED_MESSAGE = "상품, 매수, 익숙한 시장, 우선을 모두 골라 주세요.";
export const PICK_PREFS_CONFLICT_MESSAGE = "개별 종목을 빼면 개별주 위주를 고를 수 없습니다.";
export const PICK_PREFS_ASK_MESSAGE = "추천 기준을 먼저 골라 주세요.";

export type PickPrefsRow = {
  instrument: string | null | undefined;
  addTo: string | null | undefined;
  market: string | null | undefined;
  aim: string | null | undefined;
  exclude: string | null | undefined;
  sectors: string | null | undefined;
};

export function pickPrefsColumns(prefs: PickPrefs) {
  return {
    pickInstrument: prefs.instrument,
    pickAddTo: prefs.addTo,
    pickMarket: prefs.market,
    pickAim: prefs.aim,
    pickExclude: prefs.exclude.join(","),
    pickSectors: prefs.sectors.join(","),
  };
}

/** 상품, 매수, 시장이 유효할 때만 기준으로 본다. 우선이 비어 있으면 둘 다로 둔다. */
export function pickPrefsFromRow(row: PickPrefsRow): PickPrefs | null {
  const parsed = readPickPrefs({
    instrument: row.instrument ?? "",
    addTo: row.addTo ?? "",
    market: row.market ?? "",
    aim: row.aim || "both",
    exclude: splitTokens(row.exclude),
    sectors: splitTokens(row.sectors),
  });
  return parsed.ok ? parsed.prefs : null;
}

export function readPickPrefs(input: {
  instrument?: unknown;
  addTo?: unknown;
  market?: unknown;
  aim?: unknown;
  exclude?: unknown;
  sectors?: unknown;
}): { ok: true; prefs: PickPrefs } | { ok: false; message: string } {
  const instrument = oneOf(input.instrument, PICK_INSTRUMENTS);
  const addTo = oneOf(input.addTo, PICK_ADD_TOS);
  const market = oneOf(input.market, PICK_MARKETS);
  const aim = oneOf(input.aim, PICK_AIMS);
  if (!instrument || !addTo || !market || !aim) return { ok: false, message: PICK_PREFS_REQUIRED_MESSAGE };
  const exclude = manyOf(input.exclude, PICK_EXCLUDES);
  const sectors = manyOf(input.sectors, PICK_SECTORS);
  if (instrument === "stock" && exclude.includes("single")) return { ok: false, message: PICK_PREFS_CONFLICT_MESSAGE };
  return { ok: true, prefs: { instrument, addTo, market, aim, exclude, sectors } };
}

/** 모델에 넘기는 말. 코드 대신 화면에서 고른 말을 쓴다. */
export function labelPickPrefs(prefs: PickPrefs) {
  return {
    instrument: PICK_INSTRUMENT_LABEL[prefs.instrument],
    buy: PICK_ADD_TO_LABEL[prefs.addTo],
    market: PICK_MARKET_LABEL[prefs.market],
    aim: PICK_AIM_LABEL[prefs.aim],
    exclude: prefs.exclude.map((id) => PICK_EXCLUDE_LABEL[id]),
    preferSectors: prefs.sectors.map((id) => PICK_SECTOR_LABEL[id]),
  };
}

export function pickPrefsSummary(prefs: PickPrefs): string {
  const parts = [PICK_INSTRUMENT_LABEL[prefs.instrument], PICK_ADD_TO_LABEL[prefs.addTo], PICK_MARKET_LABEL[prefs.market], PICK_AIM_LABEL[prefs.aim]];
  const excluded = prefs.exclude.map((id) => PICK_EXCLUDE_LABEL[id]);
  if (excluded.length > 0) parts.push(`${excluded.join(", ")} 제외`);
  const preferred = prefs.sectors.map((id) => PICK_SECTOR_LABEL[id]);
  if (preferred.length > 0) parts.push(`${preferred.join(", ")} 위주`);
  return parts.join(" · ");
}

export function pickPrefsKey(prefs: PickPrefs | null | undefined): string {
  if (!prefs) return "";
  return [prefs.instrument, prefs.addTo, prefs.market, prefs.aim, prefs.exclude.join(","), prefs.sectors.join(",")].join("|");
}

function oneOf<T extends string>(value: unknown, allowed: readonly T[]): T | null {
  if (typeof value !== "string") return null;
  const text = value.trim();
  return (allowed as readonly string[]).includes(text) ? (text as T) : null;
}

function manyOf<T extends string>(value: unknown, allowed: readonly T[]): T[] {
  const raw = Array.isArray(value) ? value : typeof value === "string" ? splitTokens(value) : [];
  const picked = new Set<string>();
  for (const item of raw) {
    if (typeof item === "string") {
      const text = item.trim();
      if (text) picked.add(text);
    }
  }
  return allowed.filter((id) => picked.has(id));
}

function splitTokens(value: string | null | undefined): string[] {
  if (!value) return [];
  return value.split(",").map((item) => item.trim()).filter(Boolean);
}
