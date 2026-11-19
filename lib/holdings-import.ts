import { z } from "zod";

export const IMPORTED_HOLDING_LIMIT = 40;

function numeric(value: unknown): unknown {
  if (typeof value === "number") return value;
  if (typeof value !== "string") return value;
  const parsed = Number(value.replace(/,/g, "").trim());
  return Number.isFinite(parsed) ? parsed : value;
}

const importedHoldingSchema = z
  .object({
    name: z.string().trim().min(1).max(80),
    quantity: z.preprocess(numeric, z.number().finite().positive().max(1_000_000_000)),
    avgPrice: z.preprocess(numeric, z.number().finite().positive().max(1_000_000_000_000)),
    currency: z.enum(["KRW", "USD"]),
  })
  .strict();

const importedHoldingsSchema = z
  .object({
    holdings: z.array(importedHoldingSchema).max(IMPORTED_HOLDING_LIMIT),
  })
  .strict();

export type ImportedHolding = z.infer<typeof importedHoldingSchema>;

/**
 * 계좌번호, 긴 잔액 숫자, 연락처를 가리고 길이를 자른다.
 * extension/collect.js 의 maskHoldingsPage 와 같은 순서로 둔다.
 */
export function maskHoldingsPage(raw: string, limit = 12_000): string {
  const source = raw.slice(0, 40_000);
  const masked = source
    .replace(/<\/?page>/gi, "")
    .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, "[이메일]")
    .replace(/\d{6}-\d{7}/g, "[주민번호]")
    .replace(/01[016789]-?\d{3,4}-?\d{4}/g, "[전화]")
    .replace(/\d{2,4}-\d{2,6}-\d{3,8}/g, "[계좌]")
    .replace(/\d{10,}/g, "[숫자]");
  return masked.replace(/[ \t]+\n/g, "\n").replace(/\n{3,}/g, "\n\n").trim().slice(0, limit);
}

/** 모델이 코드 펜스를 붙여도 객체 하나만 읽는다. 스키마 밖 필드는 거절한다. */
export function parseImportedHoldings(payload: unknown): ImportedHolding[] {
  const value = typeof payload === "string" ? unwrapJson(payload) : payload;
  const parsed = importedHoldingsSchema.safeParse(value);
  if (!parsed.success) throw new Error("응답 형식이 아니어서 가져오지 않았습니다.");
  return parsed.data.holdings;
}

function unwrapJson(text: string): unknown {
  const trimmed = text.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");
  const start = trimmed.indexOf("{");
  const end = trimmed.lastIndexOf("}");
  if (start < 0 || end <= start) throw new Error("응답 형식이 아니어서 가져오지 않았습니다.");
  return JSON.parse(trimmed.slice(start, end + 1));
}

function compact(value: string): string {
  return value.trim().replace(/\s+/g, "").toUpperCase();
}

export type HeldPosition = {
  ticker: string;
  quantity: number;
  avgPrice: number | null;
};

function sameHoldingAmount(left: number, right: number): boolean {
  if (!Number.isFinite(left) || !Number.isFinite(right)) return false;
  const diff = Math.abs(left - right);
  return diff <= 1e-6 || diff <= Math.max(Math.abs(left), Math.abs(right)) * 1e-8;
}

/** 보유 중이면 수량 또는 1주 평균금액이 다를 때만 바꾼다. 없으면 새 종목이다. */
export function holdingImportChange(
  existing: HeldPosition | undefined,
  next: { quantity: number; avgPrice: number },
): "new" | "changed" | "same" {
  if (!existing) return "new";
  const quantitySame = sameHoldingAmount(existing.quantity, next.quantity);
  const priceSame = existing.avgPrice != null && sameHoldingAmount(existing.avgPrice, next.avgPrice);
  return quantitySame && priceSame ? "same" : "changed";
}

/** 종목명 또는 코드가 하나만 정확히 같을 때만 고른다. 비슷한 ETF가 여럿이면 비운다. */
export function preferredMatch<T extends { code: string; name: string }>(name: string, matches: T[]): T | null {
  const wanted = compact(name);
  if (!wanted) return null;
  const exact = matches.filter((match) => compact(match.name) === wanted || compact(match.code) === wanted);
  return exact.length === 1 ? exact[0] : null;
}
