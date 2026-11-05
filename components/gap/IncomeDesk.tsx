"use client";

import { useState, useTransition } from "react";
import { formatNumber } from "@/lib/format";
import { addIncome, deleteIncome } from "@/lib/server/actions";

export function IncomeDesk({
  incomes,
  today,
}: {
  incomes: { id: string; ticker: string; amount: number; currency: string; date: string }[];
  today: string;
}) {
  const [date, setDate] = useState(today);
  const [ticker, setTicker] = useState("JEPI");
  const [amount, setAmount] = useState("");
  const [currency, setCurrency] = useState<"KRW" | "USD">("KRW");
  const [message, setMessage] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  return (
    <section className="rounded-2xl border border-[#e4dccb] bg-white p-4">
      <h2 className="font-semibold">커버드콜 분배금</h2>
      <ul className="mt-3 grid gap-2 text-sm">
        {incomes.length === 0 ? <li className="text-[#6d675d]">이번 달 입금 없음</li> : null}
        {incomes.map((income) => (
          <li key={income.id} className="flex items-center justify-between gap-3">
            <span>
              {income.date} · {income.ticker} · {formatNumber(income.amount)} {income.currency}
            </span>
            <button
              type="button"
              className="text-[#9f2d2d]"
              onClick={() =>
                startTransition(async () => {
                  const result = await deleteIncome(income.id);
                  if (!result.ok) setMessage(result.message);
                })
              }
            >
              삭제
            </button>
          </li>
        ))}
      </ul>
      <form
        className="mt-4 grid gap-2 sm:grid-cols-4"
        onSubmit={(event) => {
          event.preventDefault();
          startTransition(async () => {
            const result = await addIncome({ date, ticker, amount: Number(amount), currency });
            if (result.ok) {
              setAmount("");
              setMessage("입금을 기록했습니다.");
            } else {
              setMessage(result.message);
            }
          });
        }}
      >
        <input type="date" value={date} onChange={(event) => setDate(event.target.value)} className="rounded-lg border border-[#e4dccb] px-2 py-1.5" required />
        <input value={ticker} onChange={(event) => setTicker(event.target.value)} className="rounded-lg border border-[#e4dccb] px-2 py-1.5" required />
        <input value={amount} onChange={(event) => setAmount(event.target.value)} inputMode="decimal" placeholder="금액" className="rounded-lg border border-[#e4dccb] px-2 py-1.5" required />
        <div className="flex gap-2">
          <select value={currency} onChange={(event) => setCurrency(event.target.value as "KRW" | "USD")} className="rounded-lg border border-[#e4dccb] px-2 py-1.5">
            <option value="KRW">KRW</option>
            <option value="USD">USD</option>
          </select>
          <button type="submit" disabled={pending} className="rounded-lg bg-[#1f4d3a] px-3 py-1.5 text-white">
            입금
          </button>
        </div>
      </form>
      {message ? <p className="mt-2 text-sm text-[#5c564c]">{message}</p> : null}
    </section>
  );
}
