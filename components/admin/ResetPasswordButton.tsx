"use client";

import { useState, useTransition } from "react";
import { adminResetUserPassword } from "@/lib/server/admin-actions";

export function ResetPasswordButton({ userId, email }: { userId: string; email: string }) {
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);

  function reset() {
    const confirmed = window.confirm(
      `${email}의 비밀번호를 0000으로 바꾸시겠습니까?\n기존 로그인은 끊기고, 0000으로 다시 로그인해야 합니다.`,
    );
    if (!confirmed) return;
    setMessage(null);
    startTransition(async () => {
      const result = await adminResetUserPassword(userId);
      setMessage({
        ok: result.ok,
        text: result.ok ? (result.message ?? "비밀번호를 0000으로 바꿨습니다.") : result.message,
      });
    });
  }

  return (
    <div className="flex shrink-0 flex-col items-end gap-1">
      <button
        type="button"
        onClick={reset}
        disabled={pending}
        className="rounded-full bg-[#f2f4f6] px-2.5 py-1 text-[12px] font-semibold text-[#4e5968] disabled:opacity-40"
      >
        {pending ? "리셋 중" : "비밀번호 리셋"}
      </button>
      {message ? (
        <p className={`max-w-[12rem] text-right text-[11px] leading-4 ${message.ok ? "text-[#3182f6]" : "text-[#f04452]"}`}>
          {message.text}
        </p>
      ) : null}
    </div>
  );
}
