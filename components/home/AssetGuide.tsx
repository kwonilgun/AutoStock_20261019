"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";

const STEPS = [
  {
    title: "종목은 이름과 수량",
    body: "주식, 채권, 금은 종목명과 보유 수량을 입력합니다.",
  },
  {
    title: "현금은 금액만",
    body: "자산군에서 원화 또는 달러를 고르고, 가지고 있는 금액만 입력합니다.",
  },
  {
    title: "추가를 누르면 반영",
    body: "추가를 누르면 홈의 총자산에 바로 더해집니다.",
  },
];

export function AssetGuide({ userId, empty }: { userId: string; empty: boolean }) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!empty) return;
    setOpen(true);
  }, [empty, userId]);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog || !open || dialog.open) return;
    dialog.showModal();
  }, [open]);

  function close() {
    const dialog = dialogRef.current;
    if (dialog?.open) dialog.close();
    setOpen(false);
  }

  if (!open) return null;

  return (
    <dialog
      ref={dialogRef}
      aria-labelledby="asset-guide-title"
      className="fixed inset-auto top-1/2 left-1/2 m-0 w-[min(100%-2rem,22rem)] -translate-x-1/2 -translate-y-1/2 rounded-[22px] border-0 bg-white p-0 text-[#191f28] shadow-[0_16px_48px_rgba(25,31,40,0.18)] backdrop:bg-[#191f28]/45"
      onClick={(event) => {
        if (event.target === event.currentTarget) close();
      }}
      onClose={() => setOpen(false)}
    >
      <div className="px-5 pt-6 pb-5">
        <p className="text-[13px] font-semibold text-[#3182f6]">자산이 0원입니다</p>
        <h2 id="asset-guide-title" className="mt-1 text-[20px] leading-7 font-bold tracking-tight">
          가지고 있는 자산을 등록해 주세요
        </h2>
        <p className="mt-2 text-[14px] leading-6 text-[#4e5968]">
          지금은 0원입니다. 아래 자산 화면에서 종목과 현금을 입력하면 목표 비중과 차이를 계산합니다.
        </p>
        <ol className="mt-4 grid gap-3">
          {STEPS.map((step, index) => (
            <li key={step.title} className="flex gap-3">
              <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-[#e8f3ff] text-[13px] font-bold text-[#3182f6]">
                {index + 1}
              </span>
              <span>
                <span className="block text-[15px] font-bold">{step.title}</span>
                <span className="mt-0.5 block text-[13px] leading-5 text-[#6b7684]">{step.body}</span>
              </span>
            </li>
          ))}
        </ol>
        <Link
          href="/portfolio"
          className="mt-5 flex h-12 items-center justify-center rounded-2xl bg-[#3182f6] text-[16px] font-bold text-white"
        >
          자산 등록하기
        </Link>
        <button type="button" onClick={close} className="mt-2 h-10 w-full text-[14px] font-semibold text-[#8b95a1]">
          나중에 할게요
        </button>
      </div>
    </dialog>
  );
}
