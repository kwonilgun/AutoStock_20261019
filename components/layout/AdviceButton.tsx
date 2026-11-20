"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { PICK_DISABLED_MESSAGE } from "@/lib/pick-engine";

const RETURN_KEY = "advice-return";
const SHELL_PAGES = new Set(["/picks"]);

function appPath(path: string | null): string | null {
  if (!path || !path.startsWith("/") || path.startsWith("//") || SHELL_PAGES.has(path)) return null;
  return path;
}

function useShellReturn() {
  const pathname = usePathname();
  const [returnTo, setReturnTo] = useState("/");

  useEffect(() => {
    if (SHELL_PAGES.has(pathname)) {
      const saved = appPath(sessionStorage.getItem(RETURN_KEY));
      if (saved) setReturnTo(saved);
      return;
    }
    sessionStorage.setItem(RETURN_KEY, pathname);
    setReturnTo(pathname);
  }, [pathname]);

  return { pathname, returnTo };
}

export function AdviceBackButton() {
  const { returnTo } = useShellReturn();

  return (
    <Link
      href={returnTo}
      className="flex h-10 items-center justify-center gap-0.5 rounded-full bg-white px-3.5 text-[13px] font-semibold text-[#4e5968]"
    >
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden>
        <path d="M15 6.5 8.5 12 15 17.5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
      뒤로
    </Link>
  );
}

export function PickButton({ enabled }: { enabled: boolean }) {
  const { pathname, returnTo } = useShellReturn();
  const active = enabled && pathname === "/picks";
  const [noticeOpen, setNoticeOpen] = useState(false);
  const dialogRef = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (noticeOpen && !dialog.open) dialog.showModal();
    if (!noticeOpen && dialog.open) dialog.close();
  }, [noticeOpen]);

  const className = `flex h-10 shrink-0 items-center rounded-full px-4 text-[13px] font-bold text-white shadow-[0_2px_8px_rgba(49,130,246,0.35)] ${
    active ? "bg-[#1b64da]" : "bg-[#3182f6]"
  }`;

  return (
    <>
      {enabled ? (
        <Link href={active ? returnTo : "/picks"} aria-current={active ? "page" : undefined} className={className}>
          Ai-종목추천
        </Link>
      ) : (
        <button type="button" onClick={() => setNoticeOpen(true)} className={className}>
          Ai-종목추천
        </button>
      )}
      <dialog
        ref={dialogRef}
        aria-labelledby="pick-disabled-title"
        className="fixed inset-auto top-1/2 left-1/2 m-0 w-[min(100%-2rem,22rem)] -translate-x-1/2 -translate-y-1/2 rounded-[22px] border-0 bg-white p-5 text-[#191f28] shadow-[0_16px_48px_rgba(25,31,40,0.18)] backdrop:bg-[#191f28]/40"
        onClose={() => setNoticeOpen(false)}
      >
        <h2 id="pick-disabled-title" className="text-[17px] font-bold text-[#191f28]">
          Ai-종목추천
        </h2>
        <p className="mt-2 text-[14px] leading-6 text-[#4e5968]">{PICK_DISABLED_MESSAGE}</p>
        <p className="mt-12 text-[14px] leading-6 text-[#4e5968]">
          이 기능은 인공지능 LLM 모델이 회원님 포트폴리오의 괴리 데이터를 바탕으로 분석해, 최적의 종목을 추천합니다.
        </p>
        <button
          type="button"
          onClick={() => setNoticeOpen(false)}
          className="mt-4 h-11 w-full rounded-2xl bg-[#3182f6] text-[15px] font-bold text-white"
        >
          확인
        </button>
      </dialog>
    </>
  );
}
