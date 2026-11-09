"use client";

import { useState, useTransition } from "react";
import { adminDeleteUser } from "@/lib/server/admin-actions";

export function DeleteUserButton({ userId, email }: { userId: string; email: string }) {
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);

  function remove() {
    const confirmed = window.confirm(
      `${email} 계정을 삭제하시겠습니까?\n포트폴리오와 기록이 함께 지워지며, 되돌릴 수 없습니다.`,
    );
    if (!confirmed) return;
    setMessage(null);
    startTransition(async () => {
      const result = await adminDeleteUser(userId);
      setMessage({
        ok: result.ok,
        text: result.ok ? (result.message ?? "계정을 삭제했습니다.") : result.message,
      });
    });
  }

  return (
    <div className="flex shrink-0 flex-col items-end gap-1">
      <button
        type="button"
        onClick={remove}
        disabled={pending}
        className="rounded-full bg-[#fff0f1] px-2.5 py-1 text-[12px] font-semibold text-[#f04452] disabled:opacity-40"
      >
        {pending ? "삭제 중" : "삭제"}
      </button>
      {message ? (
        <p className={`max-w-[12rem] text-right text-[11px] leading-4 ${message.ok ? "text-[#3182f6]" : "text-[#f04452]"}`}>
          {message.text}
        </p>
      ) : null}
    </div>
  );
}
