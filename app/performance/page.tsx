import { PerformanceDesk } from "@/components/performance/PerformanceDesk";
import { ViewFrame } from "@/components/frame/ViewFrame";

export default function PerformancePage() {
  return (
    <ViewFrame refreshMarks>
      {(view) => (
        <div className="mx-auto flex w-full max-w-lg flex-col gap-3">
          <PerformanceDesk
            points={view.valuations}
            positionDays={view.positionDays}
            incomes={view.returnIncomes}
            holdings={view.holdings}
            usdKrw={view.portfolio.usdKrw}
          />
        </div>
      )}
    </ViewFrame>
  );
}
