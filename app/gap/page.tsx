import { ViewFrame } from "@/components/frame/ViewFrame";
import { GapFolders, type GapFolder } from "@/components/gap/GapFolders";
import { SeoulClock } from "@/components/home/SeoulClock";
import { gapBuckets } from "@/lib/engine/gap";
import { emptyMessage } from "@/lib/engine/rebalance";

const BUCKET_COLOR: Record<string, string> = {
  주식: "#3182f6",
  채권: "#00c471",
  자산: "#ffb020",
  현금: "#8b95a1",
};

export default function GapPage() {
  return (
    <ViewFrame refreshMarks>
      {(view) => {
        const message = emptyMessage(view.result);
        const buckets = gapBuckets(view.result.sleeves, view.baseTargets);
        const over = buckets.filter((bucket) => bucket.summary.status === "over").length;
        const under = buckets.filter((bucket) => bucket.summary.status === "under").length;
        const off = over + under;
        const groups: GapFolder[] = buckets.map((bucket) => ({
          label: bucket.label,
          color: BUCKET_COLOR[bucket.label] ?? "#8b95a1",
          summary: bucket.summary,
          members: bucket.members,
        }));

        return (
          <div className="mx-auto flex w-full max-w-lg flex-col gap-3">
            <section className="rounded-[22px] bg-white px-5 pt-6 pb-5">
              <div className="flex items-center justify-between gap-3">
                <p className="text-[15px] font-medium text-[#4e5968]">목표에서 벗어난 묶음</p>
                <SeoulClock />
              </div>
              <p className="mt-1 text-[32px] leading-tight font-bold tracking-tight text-[#191f28] tabular-nums">{off}개</p>
              <p className="mt-2 text-[14px] text-[#8b95a1]">
                {off === 0 ? "주식·채권·자산·현금이 모두 ±2%p 안쪽이라 그대로 둡니다" : `과다 ${over}개 · 부족 ${under}개`}
              </p>
              <p className="mt-1 text-[13px] text-[#8b95a1]">주식, 채권, 자산, 현금 기준 · {view.phase} 국면 · 내 목표</p>
              {message ? <p className="mt-3 text-[13px] font-medium text-[#f04452]">{message}</p> : null}
            </section>

            <GapFolders groups={groups} />
          </div>
        );
      }}
    </ViewFrame>
  );
}
