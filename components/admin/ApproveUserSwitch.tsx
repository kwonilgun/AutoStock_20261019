"use client";

import { useState, useTransition } from "react";
import { adminSetUserApproved } from "@/lib/server/admin-actions";

export function ApproveUserSwitch({
  userId,
  email,
  approved,
}: {
  userId: string;
  email: string;
  approved: boolean;
}) {
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);

  function toggle() {
    const next = !approved;
    const confirmed = window.confirm(
      next
        ? `${email} 계정을 승인하시겠습니까?\n승인하면 로그인할 수 있습니다.`
        : `${email} 승인을 끄시겠습니까?\n끄면 로그인할 수 없고, 접속 중이면 로그아웃됩니다.`,
    );
    if (!confirmed) return;
    setMessage(null);
    startTransition(async () => {
      const result = await adminSetUserApproved(userId, next);
      setMessage({
        ok: result.ok,
        text: result.ok ? (result.message ?? (next ? "승인했습니다." : "승인을 껐습니다.")) : result.message,
      });
    });
  }

  return (
    <div className="mt-2 flex flex-col items-start gap-1">
      <button
        type="button"
        role="switch"
        aria-checked={approved}
        aria-label={`${email} 승인`}
        onClick={toggle}
        disabled={pending}
        className="flex items-center gap-2 disabled:opacity-40"
      >
        <span className={`relative h-6 w-11 shrink-0 rounded-full ${approved ? "bg-[#3182f6]" : "bg-[#d1d6db]"}`}>
          <span
            className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow-sm ${approved ? "left-[1.35rem]" : "left-0.5"}`}
          />
        </span>
        <span className={`text-[12px] font-semibold ${approved ? "text-[#3182f6]" : "text-[#8b95a1]"}`}>
          {pending ? "저장 중" : approved ? "승인 켜짐" : "승인 꺼짐"}
        </span>
      </button>
      {message ? (
        <p className={`max-w-[16rem] text-[11px] leading-4 ${message.ok ? "text-[#3182f6]" : "text-[#f04452]"}`}>
          {message.text}
        </p>
      ) : null}
    </div>
  );
}
