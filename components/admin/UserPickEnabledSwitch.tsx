"use client";

import { useState, useTransition } from "react";
import { adminSetUserPickEnabled } from "@/lib/server/admin-actions";

export function UserPickEnabledSwitch({
  userId,
  email,
  enabled,
}: {
  userId: string;
  email: string;
  enabled: boolean;
}) {
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);

  function toggle() {
    const next = !enabled;
    const confirmed = window.confirm(
      next
        ? `${email}의 추천종목을 켜시겠습니까?\n켜면 추천종목 버튼을 실행할 수 있습니다.`
        : `${email}의 추천종목을 끄시겠습니까?\n끄면 버튼을 눌러도 실행되지 않습니다.`,
    );
    if (!confirmed) return;
    setMessage(null);
    startTransition(async () => {
      const result = await adminSetUserPickEnabled(userId, next);
      setMessage({
        ok: result.ok,
        text: result.ok ? (result.message ?? (next ? "켰습니다." : "껐습니다.")) : result.message,
      });
    });
  }

  return (
    <div className="mt-2 flex flex-col items-start gap-1">
      <button
        type="button"
        role="switch"
        aria-checked={enabled}
        aria-label={`${email} 추천종목`}
        onClick={toggle}
        disabled={pending}
        className="flex items-center gap-2 disabled:opacity-40"
      >
        <span className={`relative h-6 w-11 shrink-0 rounded-full ${enabled ? "bg-[#3182f6]" : "bg-[#d1d6db]"}`}>
          <span className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow-sm ${enabled ? "left-[1.35rem]" : "left-0.5"}`} />
        </span>
        <span className={`text-[12px] font-semibold ${enabled ? "text-[#3182f6]" : "text-[#8b95a1]"}`}>
          {pending ? "저장 중" : enabled ? "추천종목 켜짐" : "추천종목 꺼짐"}
        </span>
      </button>
      {message ? (
        <p className={`max-w-[16rem] text-[11px] leading-4 ${message.ok ? "text-[#3182f6]" : "text-[#f04452]"}`}>{message.text}</p>
      ) : null}
    </div>
  );
}
