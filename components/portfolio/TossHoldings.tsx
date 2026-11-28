import Link from "next/link";
import { classify, normalizeTicker } from "@/lib/engine/classify";
import type { Sleeve } from "@/lib/engine/types";
import { holdingGain, valueKrw } from "@/lib/engine/value";
import { formatNumber, formatReturn, formatUsd } from "@/lib/format";
import type { TossHoldingsResult } from "@/lib/server/toss";
import type { TossHolding } from "@/lib/toss/parse";

const GROUPS: { label: string; sleeves: Sleeve[] }[] = [
  { label: "주식", sleeves: ["US_EQUITY", "KR_EQUITY"] },
  { label: "채권", sleeves: ["BOND_10Y", "BOND_30Y"] },
  { label: "자산", sleeves: ["GOLD", "BTC", "REIT"] },
  { label: "펀드", sleeves: ["FUND"] },
  { label: "현금", sleeves: ["KRW_CASH", "USD_CASH"] },
];

function won(value: number): string {
  const rounded = Math.round(value);
  const sign = rounded < 0 ? "-" : "";
  return `${sign}${formatNumber(Math.abs(rounded))}원`;
}

function signedWon(value: number): string {
  const rounded = Math.round(value);
  if (rounded === 0) return "0원";
  return `${rounded > 0 ? "+" : "−"}${formatNumber(Math.abs(rounded))}원`;
}

function toneClass(value: number): string {
  if (Math.round(value * 1000) / 10 === 0) return "text-[#8b95a1]";
  return value > 0 ? "text-[#f04452]" : "text-[#3182f6]";
}

function priceText(price: number, currency: TossHolding["currency"]): string {
  return currency === "USD" ? formatUsd(price) : `${formatNumber(price)}원`;
}

function quantityText(quantity: number): string {
  const qty = Number.isInteger(quantity) ? formatNumber(quantity) : formatNumber(Math.round(quantity * 10000) / 10000);
  return `${qty}주`;
}

function title(holding: TossHolding): string {
  const name = holding.name.trim();
  if (!name || normalizeTicker(name) === normalizeTicker(holding.symbol)) return holding.symbol;
  return `${name}-${holding.symbol}`;
}

function sleeveFor(holding: TossHolding): Sleeve {
  const known = classify(holding.symbol).sleeve;
  if (known) return known;
  return holding.marketCountry === "KR" ? "KR_EQUITY" : "US_EQUITY";
}

function HoldingRow({ holding, fx }: { holding: TossHolding; fx: number }) {
  const shaped = {
    quantity: holding.quantity,
    price: holding.lastPrice,
    currency: holding.currency,
    avgPrice: holding.averagePurchasePrice,
  };
  const value = valueKrw(shaped, fx);
  const gain = holdingGain(shaped, fx);
  const detail = `${quantityText(holding.quantity)} · ${priceText(holding.lastPrice, holding.currency)} · 1주 평균금액 ${priceText(holding.averagePurchasePrice, holding.currency)}`;
  return (
    <li className="border-b border-[#f2f4f6] py-3.5 last:border-b-0">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate text-[16px] font-bold text-[#191f28]">{title(holding)}</p>
          <p className="mt-0.5 text-[13px] leading-5 text-[#8b95a1]">{detail}</p>
        </div>
        <div className="shrink-0 text-right">
          <p className="text-[16px] font-bold tabular-nums text-[#191f28]">{value == null ? "시세 없음" : won(value)}</p>
          {gain ? (
            <p className={`mt-0.5 text-[12px] font-semibold tabular-nums ${toneClass(gain.rate)}`}>
              {signedWon(gain.gainKrw)} {formatReturn(gain.rate)}
            </p>
          ) : null}
          {holding.currency === "USD" ? (
            <p className="mt-0.5 text-[12px] tabular-nums text-[#8b95a1]">{formatUsd(holding.quantity * holding.lastPrice)}</p>
          ) : null}
        </div>
      </div>
    </li>
  );
}

export async function TossHoldings({
  fx,
  holdings,
}: {
  fx: number;
  holdings: Promise<TossHoldingsResult>;
}) {
  const result = await holdings;
  if (result.status === "hidden") return null;
  const items = result.status === "ready" ? result.items : [];
  const grouped = GROUPS.map((group) => ({
    label: group.label,
    rows: items.filter((holding) => group.sleeves.includes(sleeveFor(holding))),
  })).filter((group) => group.rows.length > 0);

  return (
    <section className="rounded-[22px] bg-white px-5 py-5">
      <h2 className="text-[17px] font-bold text-[#191f28]">토스</h2>
      {result.status === "unconfigured" ? (
        <p className="mt-3 text-[14px] leading-5 text-[#8b95a1]">
          <Link href="/settings" className="font-semibold text-[#3182f6]">
            설정
          </Link>
          에 토스증권 Open API 키를 저장하면 보유 종목이 여기에 표시됩니다.
        </p>
      ) : null}
      {result.status === "error" ? <p className="mt-3 text-[14px] leading-5 text-[#f04452]">{result.message}</p> : null}
      {result.status === "ready" && items.length === 0 ? (
        <p className="mt-3 text-[14px] leading-5 text-[#8b95a1]">보유 종목이 없습니다.</p>
      ) : null}
      {grouped.map((group) => (
        <div key={group.label}>
          <p className="pt-4 text-[13px] font-semibold text-[#8b95a1]">{group.label}</p>
          <ul>
            {group.rows.map((holding) => (
              <HoldingRow key={`${holding.marketCountry}-${holding.symbol}`} holding={holding} fx={fx} />
            ))}
          </ul>
        </div>
      ))}
    </section>
  );
}
