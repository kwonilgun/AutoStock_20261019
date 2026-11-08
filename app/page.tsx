import Link from "next/link";
import { EggChart } from "@/components/egg/EggChart";
import { ViewFrame } from "@/components/frame/ViewFrame";
import { AssetGuide } from "@/components/home/AssetGuide";
import { formatFedDate, formatFedTarget, formatFx } from "@/components/home/MarketRates";
import { SeoulClock } from "@/components/home/SeoulClock";
import { RecommendFold } from "@/components/home/RecommendFold";
import { WeightFolders } from "@/components/home/WeightFolders";
import { ReportArchive } from "@/components/recommend/ReportArchive";
import { gapViews } from "@/lib/engine/gap";
import type { Sleeve, SleeveSnapshot } from "@/lib/engine/types";
import { formatNumber } from "@/lib/format";
import { RECOMMEND_CATEGORIES } from "@/lib/recommendations";
import { listAnalysisReports } from "@/lib/server/analysis-reports";
import { latestFedTarget } from "@/lib/server/fed-rate";
import { getView } from "@/lib/server/portfolio";
import { getRecommendationSetting } from "@/lib/server/recommendation-setting";

const WEIGHT_GROUPS: { label: string; members: { sleeve: Sleeve; label: string }[] }[] = [
  {
    label: "주식",
    members: [
      { sleeve: "US_EQUITY", label: "미국주식" },
      { sleeve: "KR_EQUITY", label: "한국주식" },
    ],
  },
  {
    label: "채권",
    members: [
      { sleeve: "BOND_10Y", label: "10년물" },
      { sleeve: "BOND_30Y", label: "30년물" },
    ],
  },
  {
    label: "자산",
    members: [
      { sleeve: "GOLD", label: "금" },
      { sleeve: "REIT", label: "부동산" },
    ],
  },
  {
    label: "현금",
    members: [
      { sleeve: "KRW_CASH", label: "원화" },
      { sleeve: "USD_CASH", label: "달러" },
    ],
  },
];

function won(value: number): string {
  const rounded = Math.round(value);
  const sign = rounded < 0 ? "-" : "";
  return `${sign}${formatNumber(Math.abs(rounded))}원`;
}

export default async function HomePage() {
  const [recommendation, reports, fed] = await Promise.all([
    getRecommendationSetting(),
    listAnalysisReports(),
    latestFedTarget(),
    getView(),
  ]);
  const recommendCount = RECOMMEND_CATEGORIES.reduce((sum, category) => sum + recommendation.items[category].length, 0);
  const updated = recommendation.updatedAt
    ? new Intl.DateTimeFormat("ko-KR", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Seoul" }).format(
        recommendation.updatedAt,
      )
    : null;

  return (
    <ViewFrame>
      {(view) => {
        const weights = view.targets;
        const groups = WEIGHT_GROUPS.map((group) => {
          const members = group.members.map((member) => ({
            label: member.label,
            weight: weights[member.sleeve],
          }));
          return {
            label: group.label,
            weight: members.reduce((sum, member) => sum + member.weight, 0),
            members,
          };
        });

        return (
          <div className="mx-auto flex w-full max-w-lg flex-col gap-3">
            <AssetGuide userId={view.user.id} empty={view.result.totalKrw <= 0} />
            <section className="rounded-[22px] bg-white px-5 pt-6 pb-5">
              <div className="flex items-center justify-between gap-3">
                <p className="text-[15px] font-medium text-[#4e5968]">내 자산</p>
                <SeoulClock />
              </div>
              <p className="mt-1 text-[32px] leading-tight font-bold tracking-tight text-[#191f28] tabular-nums">{won(view.result.totalKrw)}</p>
              {view.result.totalKrw <= 0 ? (
                <Link href="/portfolio" className="mt-2 flex items-center gap-1.5 text-[15px] font-semibold text-[#3182f6]">
                  보유 종목과 현금을 입력해 주세요
                  <Chevron />
                </Link>
              ) : null}
              <GapBrief sleeves={view.result.sleeves} hasAssets={view.result.totalKrw > 0} />
            </section>

            <EggChart
              phase={view.phase}
              why={view.phaseWhy}
              rates={{
                fed: fed ? formatFedTarget(fed.low, fed.high) : "—",
                fedWhen: fed ? formatFedDate(fed.date) : "시세 연동 전",
                fx: formatFx(view.portfolio.usdKrw),
                fxNote: view.portfolio.fxSource === "manual" ? "직접 입력" : "자동",
              }}
            />

            <WeightFolders phase={view.phase} groups={groups} />

            <RecommendFold items={recommendation.items} count={recommendCount} updated={updated} />
            <ReportArchive reports={reports} />
            <p className="px-1 text-[12px] leading-5 text-[#8b95a1]">
              추천은 투자 판단을 돕기 위한 참고 자료이며 수익을 보장하지 않습니다.
            </p>
          </div>
        );
      }}
    </ViewFrame>
  );
}

function GapBrief({ sleeves, hasAssets }: { sleeves: SleeveSnapshot[]; hasAssets: boolean }) {
  const items = gapViews(sleeves);
  const over = items.filter((item) => item.status === "over").length;
  const under = items.filter((item) => item.status === "under").length;

  return (
    <div className="mt-4 border-t border-[#f2f4f6] pt-4">
      <div className="flex items-center justify-between gap-3">
        <p className="text-[15px] font-bold text-[#191f28]">괴리율</p>
        <Link href="/gap" className="flex items-center text-[13px] font-semibold text-[#3182f6]">
          자세히
          <Chevron />
        </Link>
      </div>
      <p className="mt-1.5 text-[13px] leading-5 text-[#6b7684]">
        지금 비중이 이번 달 목표에서 벗어난 폭입니다. 목표보다 많으면 과다, 적으면 부족입니다.
      </p>
      {hasAssets ? (
        <p className="mt-2 text-[15px] font-semibold tabular-nums">
          <span className="text-[#f04452]">과다 {over}개</span>
          <span className="mx-1.5 font-medium text-[#d1d6db]">·</span>
          <span className="text-[#3182f6]">부족 {under}개</span>
        </p>
      ) : (
        <p className="mt-2 text-[13px] text-[#8b95a1]">자산을 입력하면 과다와 부족 개수가 여기에 표시됩니다</p>
      )}
    </div>
  );
}

function Chevron() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden className="shrink-0 text-[#b0b8c1]">
      <path d="M9 6.5 15.5 12 9 17.5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
