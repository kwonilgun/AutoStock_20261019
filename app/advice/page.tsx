import { unstable_rethrow } from "next/navigation";
import { AdvicePanel } from "@/components/advice/AdvicePanel";
import { ViewFrame } from "@/components/frame/ViewFrame";
import { DbError } from "@/components/layout/AppShell";
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
        <AdvicePanel brief={brief} />
      )}
    </ViewFrame>
  );
}
