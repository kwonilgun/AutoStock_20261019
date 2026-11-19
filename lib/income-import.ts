import { z } from "zod";

export const IMPORTED_INCOME_LIMIT = 80;

const KINDS = ["dividend", "interest", "sale"] as const;

function numeric(value: unknown): unknown {
  if (typeof value === "number") return value;
  if (typeof value !== "string") return value;
  const parsed = Number(value.replace(/,/g, "").replace(/−/g, "-").trim());
  return Number.isFinite(parsed) ? parsed : value;
}

function calendarDate(value: string): boolean {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return false;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  if (year < 1990 || year > 2100) return false;
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
}

const importedIncomeSchema = z
  .object({
    kind: z.enum(KINDS),
    date: z.string().trim().refine(calendarDate, "날짜"),
    amount: z.preprocess(numeric, z.number().finite().min(-1_000_000_000_000).max(1_000_000_000_000)),
    currency: z.enum(["KRW", "USD"]),
    note: z.preprocess((value) => (typeof value === "string" ? value.trim().slice(0, 40) : ""), z.string().max(40)),
  })
  .strict()
  .superRefine((row, context) => {
    if (row.amount === 0) context.addIssue({ code: "custom", message: "금액", path: ["amount"] });
    if (row.kind !== "sale" && row.amount < 0) context.addIssue({ code: "custom", message: "금액", path: ["amount"] });
  });

const importedIncomesSchema = z
  .object({
    incomes: z.array(importedIncomeSchema).max(IMPORTED_INCOME_LIMIT),
  })
  .strict();

export type ImportedIncome = z.infer<typeof importedIncomeSchema>;

/** 모델이 코드 펜스를 붙여도 객체 하나만 읽는다. 스키마 밖 필드는 거절한다. */
export function parseImportedIncomes(payload: unknown): ImportedIncome[] {
  const value = typeof payload === "string" ? unwrapJson(payload) : payload;
  const parsed = importedIncomesSchema.safeParse(value);
  if (!parsed.success) throw new Error("응답 형식이 아니어서 가져오지 않았습니다.");
  return parsed.data.incomes;
}

function unwrapJson(text: string): unknown {
  const trimmed = text.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");
  const start = trimmed.indexOf("{");
  const end = trimmed.lastIndexOf("}");
  if (start < 0 || end <= start) throw new Error("응답 형식이 아니어서 가져오지 않았습니다.");
  return JSON.parse(trimmed.slice(start, end + 1));
}

export function incomeImportKey(row: { date: string; kind: string; currency: string; amount: number; note: string }): string {
  const amount = Math.round(row.amount * 10000) / 10000;
  return `${row.date}|${row.kind}|${row.currency}|${amount}|${row.note.trim()}`;
}
