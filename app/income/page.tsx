import { ViewFrame } from "@/components/frame/ViewFrame";
import { ReturnIncomeForm } from "@/components/performance/ReturnIncomeForm";
import { seoulDay } from "@/lib/format";

export default function IncomePage() {
  const today = seoulDay();
  return (
    <ViewFrame>
      {(view) => (
        <div className="mx-auto flex w-full max-w-lg flex-col gap-3">
          <ReturnIncomeForm incomes={view.returnIncomes} points={view.valuations} today={today} usdKrw={view.portfolio.usdKrw} />
        </div>
      )}
    </ViewFrame>
  );
}
