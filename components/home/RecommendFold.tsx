"use client";

import { useState } from "react";
import { RecommendList } from "@/components/recommend/RecommendList";
import type { RecommendItems } from "@/lib/recommendations";

function ChevronIcon({ open }: { open: boolean }) {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden
      className={`shrink-0 text-[#8b95a1] transition-transform ${open ? "rotate-180" : ""}`}
    >
      <path d="M6 9.5 12 15.5 18 9.5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function RecommendFold({
  items,
  count,
  updated,
}: {
  items: RecommendItems;
  count: number;
  updated: string | null;
}) {
  const [open, setOpen] = useState(false);

  return (
    <section className="rounded-[22px] bg-white px-5">
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen((current) => !current)}
        className="flex w-full items-center gap-2 py-5 text-left"
      >
        <span className="min-w-0 flex-1 text-[17px] font-bold text-[#191f28]">추천 종목</span>
        <span className="shrink-0 text-[13px] font-medium text-[#8b95a1]">{count}개</span>
        <ChevronIcon open={open} />
      </button>
      {open ? (
        <div className="pb-5">
          <p className="text-[13px] text-[#8b95a1]">
            {updated ? `마지막 업데이트 ${updated}` : "아직 등록된 추천이 없습니다"}
          </p>
          {count > 0 ? <RecommendList items={items} embedded /> : null}
        </div>
      ) : null}
    </section>
  );
}
