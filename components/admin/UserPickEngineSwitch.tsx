"use client";

import { useEffect, useState, useTransition } from "react";
import { PICK_ENGINES, type PickEngine } from "@/lib/pick-engine";
import { adminSetUserPickEngine } from "@/lib/server/admin-actions";

export function UserPickEngineSwitch({
  userId,
  email,
  engine,
}: {
  userId: string;
  email: string;
  engine: PickEngine;
}) {
  const [pending, startTransition] = useTransition();
  const [current, setCurrent] = useState(engine);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);

  useEffect(() => setCurrent(engine), [engine]);

  function choose(next: PickEngine) {
    if (next === current || pending) return;
    const confirmed = window.confirm(
      next === "claude"
        ? `${email}의 추천 종목을 Claude로 바꾸시겠습니까?\n호출 비용은 관리자가 저장한 Claude 키로 청구됩니다.`
        : `${email}의 추천 종목을 Spark로 바꾸시겠습니까?`,
    );
    if (!confirmed) return;
    setMessage(null);
    startTransition(async () => {
      const result = await adminSetUserPickEngine(userId, next);
      if (result.ok) setCurrent(next);
      setMessage({
        ok: result.ok,
        text: result.ok ? (result.message ?? "저장했습니다.") : result.message,
      });
    });
  }

  return (
    <div className="mt-2">
      <p className="text-[12px] font-medium text-[#8b95a1]">추천 종목 모델</p>
      <span className="mt-1 inline-flex rounded-full bg-[#f2f4f6] p-0.5">
        {PICK_ENGINES.map((id) => {
          const on = current === id;
          return (
            <button
              key={id}
              type="button"
              aria-pressed={on}
              disabled={pending}
              onClick={() => choose(id)}
              className={`h-7 rounded-full px-2.5 text-[12px] font-semibold disabled:opacity-40 ${
                on ? "bg-[#3182f6] text-white" : "text-[#4e5968]"
              }`}
            >
              {id === "spark" ? "Spark" : "Claude"}
            </button>
          );
        })}
      </span>
      {message ? (
        <p className={`mt-1 max-w-[18rem] text-[11px] leading-4 ${message.ok ? "text-[#3182f6]" : "text-[#f04452]"}`}>
          {message.text}
        </p>
      ) : null}
    </div>
  );
}
