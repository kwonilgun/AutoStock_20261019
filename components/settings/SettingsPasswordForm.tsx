"use client";

import { useActionState, useEffect, useState } from "react";
import { changePassword } from "@/lib/server/auth-actions";

const FIELDS = [
  { name: "current", label: "지금 비밀번호", autoComplete: "current-password" },
  { name: "next", label: "새 비밀번호 (4자 이상)", autoComplete: "new-password" },
  { name: "confirm", label: "새 비밀번호 확인", autoComplete: "new-password" },
] as const;

export function PasswordSettingRow() {
  const [open, setOpen] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  return (
    <>
      <button
        type="button"
        onClick={() => {
          setNotice(null);
          setOpen(true);
        }}
        className="flex w-full items-center justify-between py-3 text-left"
      >
        <span>
          <span className="block text-[16px] font-semibold text-[#191f28]">비밀번호 변경</span>
          {notice ? <span className="mt-0.5 block text-[13px] font-medium text-[#3182f6]">{notice}</span> : null}
        </span>
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden className="text-[#b0b8c1]">
          <path d="m9 6 6 6-6 6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>
      {open ? (
        <PasswordDialog
          onClose={() => setOpen(false)}
          onSuccess={(message) => {
            setNotice(message);
            setOpen(false);
          }}
        />
      ) : null}
    </>
  );
}

function PasswordDialog({ onClose, onSuccess }: { onClose: () => void; onSuccess: (message: string) => void }) {
  const [state, formAction, pending] = useActionState(changePassword, null);

  useEffect(() => {
    if (state?.ok) onSuccess(state.message);
  }, [state, onSuccess]);

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
        aria-labelledby="password-dialog-title"
        className="w-full max-w-md rounded-[22px] bg-white px-5 py-6"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-center justify-between">
          <h2 id="password-dialog-title" className="text-[18px] font-bold text-[#191f28]">
            비밀번호 변경
          </h2>
          <button type="button" onClick={onClose} aria-label="닫기" className="rounded-full p-1 text-[#8b95a1]">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden>
              <path d="M6 6l12 12M18 6 6 18" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
            </svg>
          </button>
        </div>
        <p className="mt-1 text-[13px] text-[#8b95a1]">새 비밀번호는 4자 이상이어야 합니다.</p>
        <form action={formAction} className="mt-4 grid gap-3">
          {FIELDS.map((field, index) => (
            <label key={field.name} className="grid gap-1.5">
              <span className="text-[13px] font-medium text-[#8b95a1]">{field.label}</span>
              <input
                name={field.name}
                type="password"
                autoComplete={field.autoComplete}
                autoFocus={index === 0}
                required
                minLength={field.name === "current" ? undefined : 4}
                suppressHydrationWarning
                className="rounded-xl bg-[#f2f4f6] px-4 py-3 text-[15px] text-[#191f28] outline-none focus:ring-2 focus:ring-[#3182f6]"
              />
            </label>
          ))}
          {state && !state.ok ? (
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
              className="rounded-xl bg-[#3182f6] px-4 py-3 text-[15px] font-semibold text-white disabled:opacity-60"
            >
              {pending ? "변경 중" : "변경하기"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
