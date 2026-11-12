import { ViewFrame } from "@/components/frame/ViewFrame";
import { AssetSummary } from "@/components/portfolio/AssetSummary";
import { HoldingDesk } from "@/components/portfolio/HoldingDesk";
import { SLEEVE_LABEL } from "@/lib/engine/config";
import { SLEEVES, type Sleeve } from "@/lib/engine/types";
import { portfolioHoldingGain } from "@/lib/engine/value";
import { formatNumber, formatPercent } from "@/lib/format";
import { parseRecommendAddSeed } from "@/lib/recommendations";

const SLEEVE_COLOR: Record<Sleeve, string> = {
  US_EQUITY: "#3182f6",
  KR_EQUITY: "#64a8ff",
  BOND_10Y: "#00c471",
  BOND_30Y: "#12b886",
  GOLD: "#ffb020",
  BTC: "#ff8a00",
  REIT: "#7b61ff",
  KRW_CASH: "#d1d6db",
  USD_CASH: "#8b95a1",
};

function won(value: number): string {
  const rounded = Math.round(value);
  const sign = rounded < 0 ? "-" : "";
  return `${sign}${formatNumber(Math.abs(rounded))}원`;
}

type MixSlice = {
  id: string;
  label: string;
  color: string;
  currentWeight: number;
  currentKrw: number;
};

const BOND_SLEEVES: Sleeve[] = ["BOND_10Y", "BOND_30Y"];

function composition(sleeves: { sleeve: Sleeve; currentWeight: number; currentKrw: number }[]): MixSlice[] {
  const held = sleeves.filter((sleeve) => sleeve.currentKrw > 0);
  const slices: MixSlice[] = [];
  let bondPlaced = false;
  for (const sleeve of held) {
    if (BOND_SLEEVES.includes(sleeve.sleeve)) {
      if (bondPlaced) continue;
      const bonds = held.filter((item) => BOND_SLEEVES.includes(item.sleeve));
      slices.push({
        id: "BOND",
        label: "채권",
        color: SLEEVE_COLOR.BOND_10Y,
        currentWeight: bonds.reduce((sum, item) => sum + item.currentWeight, 0),
        currentKrw: bonds.reduce((sum, item) => sum + item.currentKrw, 0),
      });
      bondPlaced = true;
      continue;
    }
    slices.push({
      id: sleeve.sleeve,
      label: SLEEVE_LABEL[sleeve.sleeve],
      color: SLEEVE_COLOR[sleeve.sleeve],
      currentWeight: sleeve.currentWeight,
      currentKrw: sleeve.currentKrw,
    });
  }
  return slices;
}

function SleeveDonut({ items }: { items: MixSlice[] }) {
  const size = 88;
  const stroke = 12;
  const radius = (size - stroke) / 2;
  const center = size / 2;
  const circumference = 2 * Math.PI * radius;
  const total = items.reduce((sum, item) => sum + Math.max(0, item.currentWeight), 0) || 1;
  const gap = items.length > 1 ? 2.5 : 0;
  let cursor = 0;

  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="shrink-0" aria-hidden>
      <circle cx={center} cy={center} r={radius} fill="none" stroke="#f2f4f6" strokeWidth={stroke} />
      {items.map((item) => {
        const length = (Math.max(0, item.currentWeight) / total) * circumference;
        const dash = Math.max(length - gap, length > 0 ? 1 : 0);
        const segment = (
          <circle
            key={item.id}
            cx={center}
            cy={center}
            r={radius}
            fill="none"
            stroke={item.color}
            strokeWidth={stroke}
            strokeDasharray={`${dash} ${circumference - dash}`}
            strokeDashoffset={-cursor}
            transform={`rotate(-90 ${center} ${center})`}
          />
        );
        cursor += length;
        return segment;
      })}
    </svg>
  );
}

export default async function PortfolioPage({
  searchParams,
}: {
  searchParams: Promise<{ ticker?: string | string[]; sleeve?: string | string[]; currency?: string | string[] }>;
}) {
  const seed = parseRecommendAddSeed(await searchParams);
  return (
    <ViewFrame refreshMarks>
      {(view) => {
        const sleeves = SLEEVES.map((sleeve) => view.result.sleeves.find((item) => item.sleeve === sleeve)).filter(
          (item): item is NonNullable<typeof item> => Boolean(item),
        );
        const mix = composition(sleeves);
        const weightSum = sleeves.reduce((sum, sleeve) => sum + sleeve.currentWeight, 0);
        const held = view.holdings.filter((holding) => holding.quantity > 0);
        const holdingCount = held.length;
        const priceGain = portfolioHoldingGain(held, view.portfolio.usdKrw);

        return (
          <div className="mx-auto flex w-full max-w-lg flex-col gap-3">
            <AssetSummary
              totalKrw={view.result.totalKrw}
              holdingCount={holdingCount}
              priceGainKrw={priceGain?.gainKrw ?? null}
              weightWarning={sleeves.length > 0 && Math.abs(weightSum - 1) > 0.001}
              blockedReason={view.result.blockedReason}
              fx={view.portfolio.usdKrw}
              fxSource={view.portfolio.fxSource === "manual" ? "manual" : "auto"}
            />

            <section className="rounded-[22px] bg-white px-4 py-3.5">
              <h2 className="text-[15px] font-bold text-[#191f28]">자산 구성</h2>
              {mix.length === 0 ? (
                <p className="mt-2 text-[14px] text-[#8b95a1]">보유 금액이 없습니다.</p>
              ) : (
                <div className="mt-2.5 flex items-center gap-3">
                  <SleeveDonut items={mix} />
                  <ul className="grid min-w-0 flex-1 grid-cols-2 gap-x-3 gap-y-1.5">
                    {mix.map((slice) => (
                      <li key={slice.id} className="min-w-0">
                        <p className="flex items-center gap-1">
                          <span className="h-1.5 w-1.5 shrink-0 rounded-full" style={{ background: slice.color }} />
                          <span className="truncate text-[12px] font-semibold text-[#4e5968]">{slice.label}</span>
                          <span className="shrink-0 text-[12px] font-bold tabular-nums text-[#191f28]">
                            {formatPercent(slice.currentWeight)}
                          </span>
                        </p>
                        <p className="truncate pl-2.5 text-[11px] tabular-nums text-[#8b95a1]">{won(slice.currentKrw)}</p>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </section>

            <HoldingDesk
              holdings={view.holdings.filter((holding) => holding.quantity > 0)}
              fx={view.portfolio.usdKrw}
              quantityEvents={view.quantityEvents}
              seed={seed}
            />
          </div>
        );
      }}
    </ViewFrame>
  );
}
