"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import {
  RECOMMEND_CATEGORIES,
  RECOMMEND_LABEL,
  recommendAddHref,
  recommendAddSeed,
  type RecommendAddSeed,
  type RecommendItems,
  type RecommendItem,
  type RecommendCategory,
} from "@/lib/recommendations";

type Picked = { category: RecommendCategory; item: RecommendItem };

export function RecommendList({
  items,
  onAdd,
  embedded = false,
}: {
  items: RecommendItems;
  onAdd?: (seed: RecommendAddSeed) => void;
  embedded?: boolean;
}) {
  const router = useRouter();
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [picked, setPicked] = useState<Picked | null>(null);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog || !picked || dialog.open) return;
    dialog.showModal();
  }, [picked]);

  function close() {
    const dialog = dialogRef.current;
    if (dialog?.open) {
      dialog.close();
      return;
    }
    setPicked(null);
  }

  function confirmAdd() {
    if (!picked) return;
    const seed = recommendAddSeed(picked.category, picked.item);
    if (!seed) return;
    if (onAdd) {
      close();
      onAdd(seed);
      return;
    }
    router.push(recommendAddHref(seed));
  }

  const title = picked?.item.name || picked?.item.ticker || "";

  return (
    <>
      {RECOMMEND_CATEGORIES.map((category) => {
        const rows = items[category];
        if (embedded && rows.length === 0) return null;
        return (
          <section
            key={category}
            className={embedded ? "mt-4 border-t border-[#f2f4f6] pt-4" : "rounded-[22px] bg-white px-5 py-5"}
          >
            <h2 className="flex items-baseline justify-between text-[17px] font-bold text-[#191f28]">
              {RECOMMEND_LABEL[category]}
              <span className="text-[13px] font-medium text-[#8b95a1]">{rows.length}개</span>
            </h2>
            {rows.length === 0 ? (
              <p className="mt-2 text-[14px] text-[#8b95a1]">추천 종목이 없습니다.</p>
            ) : (
              <ul className="mt-1">
                {rows.map((item, index) => (
                  <li key={`${item.ticker}-${index}`} className="border-b border-[#f2f4f6] last:border-b-0">
                    <button
                      type="button"
                      className="flex w-full items-center gap-2 py-3 text-left"
                      onClick={() => setPicked({ category, item })}
                    >
                      <span className="w-5 shrink-0 text-[13px] font-semibold text-[#3182f6] tabular-nums">{index + 1}</span>
                      <span className="min-w-0 flex-1">
                        <span className="flex items-baseline gap-2">
                          <span className="min-w-0 truncate text-[16px] font-bold text-[#191f28]">{item.name || item.ticker}</span>
                          {item.name && item.ticker ? (
                            <span className="shrink-0 text-[13px] font-medium text-[#8b95a1]">{item.ticker}</span>
                          ) : null}
                        </span>
                        {item.note ? (
                          <span className="mt-1 block text-[13px] leading-5 whitespace-pre-wrap text-[#4e5968]">{item.note}</span>
                        ) : null}
                      </span>
                      <span className="shrink-0 text-[13px] font-semibold text-[#3182f6]">추가</span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </section>
        );
      })}

      <dialog
        ref={dialogRef}
        aria-labelledby="recommend-add-title"
        className="w-[min(100%-2rem,22rem)] rounded-[22px] border-0 bg-white p-5 text-[#191f28] shadow-[0_12px_40px_rgba(25,31,40,0.16)] backdrop:bg-[#191f28]/40"
        onClick={(event) => {
          if (event.target === event.currentTarget) close();
        }}
        onClose={() => setPicked(null)}
      >
        {picked ? (
          <div className="grid gap-4">
            <div>
              <h2 id="recommend-add-title" className="text-[17px] font-bold text-[#191f28]">
                자산에 추가할까요?
              </h2>
              <p className="mt-2 text-[16px] font-bold text-[#191f28]">{title}</p>
              {picked.item.name && picked.item.ticker ? (
                <p className="mt-0.5 text-[13px] font-medium text-[#8b95a1]">{picked.item.ticker}</p>
              ) : null}
              <p className="mt-2 text-[13px] leading-5 text-[#4e5968]">
                확인하면 자산 화면의 종목 추가에 티커와 자산군을 채워 둡니다. 수량과 평균단가를 입력한 뒤 추가하면 됩니다.
              </p>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                className="h-12 rounded-2xl bg-[#f2f4f6] text-[16px] font-bold text-[#4e5968]"
                onClick={close}
              >
                취소
              </button>
              <button
                type="button"
                className="h-12 rounded-2xl bg-[#3182f6] text-[16px] font-bold text-white"
                onClick={confirmAdd}
              >
                확인
              </button>
            </div>
          </div>
        ) : null}
      </dialog>
    </>
  );
}
