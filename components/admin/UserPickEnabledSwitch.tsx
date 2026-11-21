"use client";

import { useEffect, useState, useTransition } from "react";
import { adminResetUserPickUsed, adminSetUserPickEnabled, adminSetUserPickLimit } from "@/lib/server/admin-actions";

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
    <>
      <button
        type="button"
        role="switch"
        aria-checked={enabled}
        aria-label={`${email} 추천종목`}
        onClick={toggle}
        disabled={pending}
        className="flex shrink-0 items-center gap-2 disabled:opacity-40"
      >
        <span className={`relative h-6 w-11 shrink-0 rounded-full ${enabled ? "bg-[#3182f6]" : "bg-[#d1d6db]"}`}>
          <span className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow-sm ${enabled ? "left-[1.35rem]" : "left-0.5"}`} />
        </span>
        <span className={`text-[12px] font-semibold ${enabled ? "text-[#3182f6]" : "text-[#8b95a1]"}`}>
          {pending ? "저장 중" : enabled ? "추천종목 켜짐" : "추천종목 꺼짐"}
        </span>
      </button>
      {message ? (
        <p className={`basis-full text-[11px] leading-4 ${message.ok ? "text-[#3182f6]" : "text-[#f04452]"}`}>{message.text}</p>
      ) : null}
      {enabled ? (
        <div className="basis-full">
          <PickLimitEditor userId={userId} email={email} limit={limit} used={used} />
        </div>
      ) : null}
    </>
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
  const [resetting, startReset] = useTransition();
  const [value, setValue] = useState(String(limit));
  const [shownUsed, setShownUsed] = useState(used);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);

  useEffect(() => setValue(String(limit)), [limit]);
  useEffect(() => setShownUsed(used), [used]);

  function step(delta: number) {
    const current = Number(value);
    const base = Number.isInteger(current) ? current : limit;
    const next = Math.min(999, Math.max(0, base + delta));
    setValue(String(next));
    setMessage(null);
  }

  function save() {
    const next = Number(value);
    if (!Number.isInteger(next) || next < 0 || next > 999) {
      setMessage({ ok: false, text: "0부터 999 사이의 횟수를 입력해 주세요." });
      return;
    }
    if (next === limit || pending) return;
    const confirmed = window.confirm(
      `${email}의 Ai-종목추천 횟수 제한을 ${next}회로 바꾸시겠습니까?\n지금까지 ${shownUsed}회 사용했습니다.`,
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

  function resetUsed() {
    if (shownUsed === 0 || resetting) return;
    const confirmed = window.confirm(
      `${email}의 Ai-종목추천 사용 횟수를 0으로 되돌리시겠습니까?\n지금까지 ${shownUsed}회 사용했습니다. 횟수 제한은 그대로 둡니다.`,
    );
    if (!confirmed) return;
    setMessage(null);
    startReset(async () => {
      const result = await adminResetUserPickUsed(userId);
      if (result.ok) setShownUsed(0);
      setMessage({
        ok: result.ok,
        text: result.ok ? (result.message ?? "사용 횟수를 0으로 되돌렸습니다.") : result.message,
      });
    });
  }

  const numeric = Number(value);

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <div className="flex items-center gap-1">
        <span className="text-[12px] font-semibold text-[#4e5968]">횟수</span>
        <button
          type="button"
          aria-label={`${email} 횟수 내리기`}
          onClick={() => step(-1)}
          disabled={pending || (Number.isInteger(numeric) && numeric <= 0)}
          className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#f2f4f6] text-[22px] font-bold leading-none text-[#191f28] disabled:opacity-40"
        >
          −
        </button>
        <input
          type="number"
          inputMode="numeric"
          min={0}
          max={999}
          aria-label={`${email} Ai-종목추천 횟수`}
          value={value}
          onChange={(event) => setValue(event.target.value)}
          className="h-10 w-16 rounded-xl bg-[#f2f4f6] px-2 text-center text-[16px] font-bold text-[#191f28] outline-none [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
        />
        <button
          type="button"
          aria-label={`${email} 횟수 올리기`}
          onClick={() => step(1)}
          disabled={pending || (Number.isInteger(numeric) && numeric >= 999)}
          className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#e8f3ff] text-[22px] font-bold leading-none text-[#3182f6] disabled:opacity-40"
        >
          +
        </button>
      </div>
      <button
        type="button"
        onClick={save}
        disabled={pending}
        className="h-10 rounded-full bg-[#3182f6] px-3.5 text-[13px] font-bold text-white disabled:opacity-40"
      >
        {pending ? "저장 중" : "저장"}
      </button>
      <span className="text-[11px] font-medium text-[#8b95a1]">사용 {shownUsed}회</span>
      <button
        type="button"
        onClick={resetUsed}
        disabled={resetting || shownUsed === 0}
        className="h-10 rounded-full bg-[#f2f4f6] px-3.5 text-[13px] font-bold text-[#4e5968] disabled:opacity-40"
      >
        {resetting ? "리셋 중" : "횟수 리셋"}
      </button>
      {message ? (
        <p className={`basis-full text-[11px] leading-4 ${message.ok ? "text-[#3182f6]" : "text-[#f04452]"}`}>{message.text}</p>
      ) : null}
    </div>
  );
}
