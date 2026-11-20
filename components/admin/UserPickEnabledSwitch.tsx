"use client";

import { useEffect, useState, useTransition } from "react";
import { adminSetUserPickEnabled, adminSetUserPickLimit } from "@/lib/server/admin-actions";

export function UserPickEnabledSwitch({
  userId,
  email,
  enabled,
  limit,
  used,
}: {
  userId: string;
  email: string;
  enabled: boolean;
  limit: number;
  used: number;
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
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
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
        {enabled ? <PickLimitEditor userId={userId} email={email} limit={limit} used={used} /> : null}
      </div>
      {message ? (
        <p className={`max-w-[16rem] text-[11px] leading-4 ${message.ok ? "text-[#3182f6]" : "text-[#f04452]"}`}>{message.text}</p>
      ) : null}
    </div>
  );
}

function PickLimitEditor({
  userId,
  email,
  limit,
  used,
}: {
  userId: string;
  email: string;
  limit: number;
  used: number;
}) {
  const [pending, startTransition] = useTransition();
  const [value, setValue] = useState(String(limit));
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);

  useEffect(() => setValue(String(limit)), [limit]);

  function save() {
    const next = Number(value);
    if (!Number.isInteger(next) || next < 0 || next > 999) {
      setMessage({ ok: false, text: "0부터 999 사이의 횟수를 입력해 주세요." });
      return;
    }
    if (next === limit || pending) return;
    const confirmed = window.confirm(
      `${email}의 Ai-종목추천 횟수 제한을 ${next}회로 바꾸시겠습니까?\n지금까지 ${used}회 사용했습니다.`,
    );
    if (!confirmed) return;
    setMessage(null);
    startTransition(async () => {
      const result = await adminSetUserPickLimit(userId, next);
      setMessage({
        ok: result.ok,
        text: result.ok ? (result.message ?? "저장했습니다.") : result.message,
      });
    });
  }

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <label className="flex items-center gap-1 text-[12px] font-semibold text-[#4e5968]">
        횟수
        <input
          type="number"
          inputMode="numeric"
          min={0}
          max={999}
          aria-label={`${email} Ai-종목추천 횟수`}
          value={value}
          onChange={(event) => setValue(event.target.value)}
          className="h-7 w-14 rounded-lg bg-[#f2f4f6] px-2 text-center text-[13px] font-bold text-[#191f28] outline-none"
        />
      </label>
      <button
        type="button"
        onClick={save}
        disabled={pending}
        className="h-7 rounded-full bg-[#3182f6] px-2.5 text-[12px] font-bold text-white disabled:opacity-40"
      >
        {pending ? "저장 중" : "저장"}
      </button>
      <span className="text-[11px] font-medium text-[#8b95a1]">사용 {used}회</span>
      {message ? (
        <p className={`basis-full text-[11px] leading-4 ${message.ok ? "text-[#3182f6]" : "text-[#f04452]"}`}>{message.text}</p>
      ) : null}
    </div>
  );
}
