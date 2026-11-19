"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { AdviceBrief } from "@/components/advice/AdviceBrief";
import { SeoulClock } from "@/components/home/SeoulClock";
import { adviceEngineLabel } from "@/lib/advice-model";
import { refreshAdvice } from "@/lib/server/advice-actions";
import type { AdviceBrief as AdviceBriefView } from "@/lib/server/advice";

function savedLabel(cachedAt: string | null): string | null {
  if (!cachedAt) return null;
  const date = new Date(cachedAt);
  if (Number.isNaN(date.getTime())) return null;
  const text = new Intl.DateTimeFormat("ko-KR", {
    timeZone: "Asia/Seoul",
    month: "numeric",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(date);
  return `저장된 글 · ${text}`;
}

export function AdvicePanel({ brief }: { brief: AdviceBriefView }) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const saved = savedLabel(brief.cachedAt);

  useEffect(() => {
    setPending(false);
  }, [brief.cachedAt, brief.source, brief.phase, brief.portfolio, brief.actions, brief.leave]);

  async function onUpdate() {
    setError(null);
    setPending(true);
    const result = await refreshAdvice();
    if (!result.ok) {
      setError(result.message);
      setPending(false);
      return;
    }
    router.refresh();
  }

  return (
    <div className="mx-auto flex w-full max-w-lg flex-col gap-3">
      <section className="rounded-[22px] bg-white px-5 pt-6 pb-5">
        <div className="flex items-center justify-between gap-3">
          <div className="flex min-w-0 items-center gap-2">
            <p className="text-[15px] font-medium text-[#4e5968]">오늘 자문</p>
            <p className="truncate text-[13px] font-semibold text-[#3182f6]">{adviceEngineLabel(brief.source)}</p>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <button
              type="button"
              onClick={() => void onUpdate()}
              disabled={pending}
              className="rounded-full bg-[#3182f6] px-3 py-1.5 text-[13px] font-semibold text-white disabled:opacity-60"
            >
              {pending ? "받는 중" : "업데이트"}
            </button>
            <SeoulClock />
          </div>
        </div>
        <p className="mt-2 text-[14px] leading-5 text-[#6b7684]">
          국면, 보유, 괴리는 앱이 계산한 값을 그대로 씁니다. 저장된 글이 있으면 모델을 다시 부르지 않습니다.
        </p>
        {saved ? <p className="mt-2 text-[12px] font-medium text-[#8b95a1]">{saved}</p> : null}
        {error ? <p className="mt-2 text-[13px] font-medium text-[#f04452]">{error}</p> : null}
      </section>
      {pending ? <AdviceLoadingBody /> : <AdviceBrief brief={brief} />}
    </div>
  );
}

function AdviceLoadingBody() {
  return (
    <section className="flex flex-col items-center gap-3 rounded-[22px] bg-white px-5 py-16" aria-busy="true" aria-live="polite">
      <span className="h-8 w-8 animate-spin rounded-full border-2 border-[#d1d6db] border-t-[#3182f6]" />
      <p className="text-[14px] text-[#6b7684]">자문 글을 받고 있습니다.</p>
    </section>
  );
}
