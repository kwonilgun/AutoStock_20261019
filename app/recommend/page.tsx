import { ViewFrame } from "@/components/frame/ViewFrame";
import { RecommendList } from "@/components/recommend/RecommendList";
import { ReportArchive } from "@/components/recommend/ReportArchive";
import { RECOMMEND_CATEGORIES } from "@/lib/recommendations";
import { listAnalysisReports } from "@/lib/server/analysis-reports";
import { getRecommendationSetting } from "@/lib/server/recommendation-setting";

export default async function RecommendPage() {
  const [recommendation, reports] = await Promise.all([getRecommendationSetting(), listAnalysisReports()]);
  const total = RECOMMEND_CATEGORIES.reduce((sum, category) => sum + recommendation.items[category].length, 0);
  const updated = recommendation.updatedAt
    ? new Intl.DateTimeFormat("ko-KR", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Seoul" }).format(
        recommendation.updatedAt,
      )
    : null;

  return (
    <ViewFrame>
      {() => (
        <div className="mx-auto flex w-full max-w-lg flex-col gap-3">
          <section className="rounded-[22px] bg-white px-5 py-5">
            <div className="flex items-baseline justify-between gap-3">
              <h2 className="text-[17px] font-bold text-[#191f28]">추천 종목</h2>
              <span className="text-[13px] font-medium text-[#8b95a1]">{total}개</span>
            </div>
            <p className="mt-1 text-[13px] text-[#8b95a1]">
              {updated ? `마지막 업데이트 ${updated}` : "아직 등록된 추천이 없습니다"}
            </p>
            {total > 0 ? <RecommendList items={recommendation.items} embedded /> : null}
          </section>

          <ReportArchive reports={reports} />

          <p className="px-1 text-[12px] leading-5 text-[#8b95a1]">
            추천은 투자 판단을 돕기 위한 참고 자료이며 수익을 보장하지 않습니다.
          </p>
        </div>
      )}
    </ViewFrame>
  );
}
