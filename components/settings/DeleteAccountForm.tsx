"use client";

import { useActionState, useEffect, useState } from "react";
import { deleteAccount } from "@/lib/server/auth-actions";

export function DeleteAccountRow() {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className="w-full py-3 text-left text-[16px] font-semibold text-[#f04452]">
        회원 탈퇴
      </button>
      {open ? <DeleteAccountDialog onClose={() => setOpen(false)} /> : null}
    </>
  );
}

function DeleteAccountDialog({ onClose }: { onClose: () => void }) {
  const [state, formAction, pending] = useActionState(deleteAccount, null);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-30 flex items-end justify-center bg-black/40 px-4 pb-[max(1rem,env(safe-area-inset-bottom))] sm:items-center"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="delete-account-title"
        className="w-full max-w-md rounded-[22px] bg-white px-5 py-6"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-center justify-between">
          <h2 id="delete-account-title" className="text-[18px] font-bold text-[#191f28]">
            회원 탈퇴
          </h2>
          <button type="button" onClick={onClose} aria-label="닫기" className="rounded-full p-1 text-[#8b95a1]">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden>
              <path d="M6 6l12 12M18 6 6 18" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
            </svg>
          </button>
        </div>
        <p className="mt-2 text-[14px] leading-6 text-[#4e5968]">
          계정과 이 계정의 포트폴리오, 보유, 기록이 삭제됩니다. 삭제한 뒤에는 되돌릴 수 없습니다.
        </p>
        <form action={formAction} className="mt-4 grid gap-3">
          <label className="grid gap-1.5">
            <span className="text-[13px] font-medium text-[#8b95a1]">비밀번호</span>
            <input
              name="password"
              type="password"
              autoComplete="current-password"
              autoFocus
              required
              suppressHydrationWarning
              className="rounded-xl bg-[#f2f4f6] px-4 py-3 text-[15px] text-[#191f28] outline-none focus:ring-2 focus:ring-[#3182f6]"
            />
          </label>
          {state?.message ? (
            <p role="alert" className="text-[13px] font-medium text-[#f04452]">
              {state.message}
            </p>
          ) : null}
          <div className="mt-1 grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={onClose}
              className="rounded-xl bg-[#f2f4f6] px-4 py-3 text-[15px] font-semibold text-[#4e5968]"
            >
              취소
            </button>
            <button
              type="submit"
              disabled={pending}
              className="rounded-xl bg-[#f04452] px-4 py-3 text-[15px] font-semibold text-white disabled:opacity-60"
            >
              {pending ? "탈퇴 중" : "탈퇴하기"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
