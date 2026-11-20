import { ViewFrame } from "@/components/frame/ViewFrame";
import { GapFolders, type GapFolder } from "@/components/gap/GapFolders";
import { SeoulClock } from "@/components/home/SeoulClock";
import { SLEEVE_LABEL } from "@/lib/engine/config";
import { gapViews, sleeveStatus, type GapView } from "@/lib/engine/gap";
import { emptyMessage } from "@/lib/engine/rebalance";
import type { Sleeve, SleeveSnapshot } from "@/lib/engine/types";

const GROUPS: { label: string; color: string; sleeves: Sleeve[] }[] = [
  { label: "주식", color: "#3182f6", sleeves: ["US_EQUITY", "KR_EQUITY"] },
  { label: "채권", color: "#00c471", sleeves: ["BOND_10Y", "BOND_30Y"] },
  { label: "자산", color: "#ffb020", sleeves: ["GOLD", "BTC", "REIT"] },
  { label: "현금", color: "#8b95a1", sleeves: ["KRW_CASH", "USD_CASH"] },
];

function sleeveView(sleeve: SleeveSnapshot): GapView {
  return {
    id: sleeve.sleeve,
    label: SLEEVE_LABEL[sleeve.sleeve],
    colorSleeve: sleeve.sleeve,
    currentKrw: sleeve.currentKrw,
    currentWeight: sleeve.currentWeight,
    targetWeight: sleeve.targetWeight,
    targetKrw: sleeve.targetKrw,
    gapPp: sleeve.gapPp,
    status: sleeveStatus(sleeve.currentWeight, sleeve.targetWeight),
    guardNote: sleeve.guardNote,
  };
}

function groupView(label: string, colorSleeve: Sleeve, parts: GapView[]): GapView {
  const currentKrw = parts.reduce((sum, part) => sum + part.currentKrw, 0);
  const currentWeight = parts.reduce((sum, part) => sum + part.currentWeight, 0);
  const targetWeight = parts.reduce((sum, part) => sum + part.targetWeight, 0);
  const targetKrw = parts.reduce((sum, part) => sum + part.targetKrw, 0);
  return {
    id: label,
    label,
    colorSleeve,
    currentKrw,
    currentWeight,
    targetWeight,
    targetKrw,
    gapPp: (currentWeight - targetWeight) * 100,
    status: sleeveStatus(currentWeight, targetWeight),
    guardNote: null,
  };
}

export default function GapPage() {
  return (
    <ViewFrame refreshMarks>
      {(view) => {
        const message = emptyMessage(view.result);
        const items = gapViews(view.result.sleeves);
        const over = items.filter((item) => item.status === "over").length;
        const under = items.filter((item) => item.status === "under").length;
        const off = over + under;
        const bySleeve = new Map(view.result.sleeves.map((sleeve) => [sleeve.sleeve, sleeve]));
        const groups: GapFolder[] = GROUPS.flatMap((group) => {
          const members = group.sleeves.flatMap((sleeve) => {
            const snapshot = bySleeve.get(sleeve);
            if (!snapshot) return [];
            if (sleeve === "BTC" && snapshot.currentKrw <= 0 && snapshot.targetWeight <= 0) return [];
            return [sleeveView(snapshot)];
          });
          if (members.length === 0) return [];
          return [{ ...group, summary: groupView(group.label, group.sleeves[0], members), members }];
        });

        return (
          <div className="mx-auto flex w-full max-w-lg flex-col gap-3">
            <section className="rounded-[22px] bg-white px-5 pt-6 pb-5">
              <div className="flex items-center justify-between gap-3">
                <p className="text-[15px] font-medium text-[#4e5968]">목표에서 벗어난 자산</p>
                <SeoulClock />
              </div>
              <p className="mt-1 text-[32px] leading-tight font-bold tracking-tight text-[#191f28] tabular-nums">{off}개</p>
              <p className="mt-2 text-[14px] text-[#8b95a1]">
                {off === 0 ? "모두 ±2%p 안쪽이라 그대로 둡니다" : `과다 ${over}개 · 부족 ${under}개`}
              </p>
              <p className="mt-1 text-[13px] text-[#8b95a1]">{view.phase} 국면 기준</p>
              {message ? <p className="mt-3 text-[13px] font-medium text-[#f04452]">{message}</p> : null}
            </section>

            <GapFolders groups={groups} />
          </div>
        );
      }}
    </ViewFrame>
  );
}
