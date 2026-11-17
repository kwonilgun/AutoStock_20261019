import { unstable_rethrow } from "next/navigation";
import { AdviceBrief } from "@/components/advice/AdviceBrief";
import { ViewFrame } from "@/components/frame/ViewFrame";
import { DbError } from "@/components/layout/AppShell";
import { SeoulClock } from "@/components/home/SeoulClock";
import { seoulDay } from "@/lib/format";
import { adviceSourceFromView, loadAdvice, type AdviceBrief as AdviceBriefView } from "@/lib/server/advice";
import { latestFedTarget } from "@/lib/server/fed-rate";
import { getView } from "@/lib/server/portfolio";

export default async function AdvicePage() {
  let brief: AdviceBriefView;
  try {
    const [view, fed] = await Promise.all([getView(), latestFedTarget()]);
    brief = await loadAdvice(adviceSourceFromView(view, fed, seoulDay()));
  } catch (error) {
    unstable_rethrow(error);
    return <DbError />;
  }

  return (
    <ViewFrame>
      {() => (
        <div className="mx-auto flex w-full max-w-lg flex-col gap-3">
          <section className="rounded-[22px] bg-white px-5 pt-6 pb-5">
            <div className="flex items-center justify-between gap-3">
              <p className="text-[15px] font-medium text-[#4e5968]">오늘 자문</p>
              <SeoulClock />
            </div>
            <p className="mt-2 text-[14px] leading-5 text-[#6b7684]">
              국면, 보유, 괴리는 앱이 계산한 값을 그대로 씁니다. 아직 구현단계이고, 추후에 AI 추천과 전문가 추천을 추가할 예정입니다.
            </p>
          </section>
          <AdviceBrief brief={brief} />
        </div>
      )}
    </ViewFrame>
  );
}
