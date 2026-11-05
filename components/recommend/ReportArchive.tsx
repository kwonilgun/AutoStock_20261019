"use client";

import { useEffect, useState, type ReactNode } from "react";
import { formatDay } from "@/lib/format";
import type { AnalysisReportView } from "@/lib/reports";

function ChevronIcon({ open }: { open: boolean }) {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden
      className={`shrink-0 transition-transform ${open ? "rotate-180" : ""}`}
    >
      <path d="M6 9.5 12 15.5 18 9.5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function seoulClock(iso: string): string {
  return new Intl.DateTimeFormat("ko-KR", {
    timeZone: "Asia/Seoul",
    hour: "numeric",
    minute: "2-digit",
    hourCycle: "h12",
  }).format(new Date(iso));
}

export function ReportArchive({
  reports,
  focusId = null,
  focusTick = 0,
  detail,
  notice,
}: {
  reports: AnalysisReportView[];
  focusId?: string | null;
  focusTick?: number;
  detail?: (report: AnalysisReportView) => ReactNode;
  notice?: ReactNode;
}) {
  const [openIds, setOpenIds] = useState<string[]>([]);
  const counts = new Map<string, number>();
  for (const report of reports) counts.set(report.date, (counts.get(report.date) ?? 0) + 1);

  useEffect(() => {
    if (!focusId) return;
    setOpenIds((current) => (current.includes(focusId) ? current : [focusId, ...current]));
  }, [focusId, focusTick]);

  function toggle(id: string) {
    setOpenIds((current) => (current.includes(id) ? current.filter((item) => item !== id) : [id, ...current]));
  }

  return (
    <section className="rounded-[22px] bg-white px-5 py-5">
      <p className="min-w-0 flex-1 text-[17px] font-bold text-[#191f28]">분석 리포트</p>
      {notice}
      {reports.length === 0 ? (
        <p className="mt-2 text-[14px] text-[#8b95a1]">아직 등록된 리포트가 없습니다.</p>
      ) : (
        <div className="mt-1">
          {reports.map((report) => {
            const open = openIds.includes(report.id);
            const when = (counts.get(report.date) ?? 0) > 1 ? ` ${seoulClock(report.createdAt)}` : "";
            return (
              <article key={report.id} className="border-b border-[#f2f4f6] last:border-b-0">
                <button
                  type="button"
                  aria-expanded={open}
                  onClick={() => toggle(report.id)}
                  className="flex w-full items-center gap-2 py-3 text-left"
                >
                  <span className="shrink-0 text-[13px] font-semibold whitespace-nowrap text-[#8b95a1]">
                    {formatDay(report.date)}
                    {when}
                  </span>
                  <span className="min-w-0 flex-1 truncate text-[15px] font-bold text-[#191f28]">
                    {report.title || "제목 없음"}
                  </span>
                  <ChevronIcon open={open} />
                </button>
                {open ? (
                  <div className="pb-3">
                    {detail ? (
                      detail(report)
                    ) : report.body ? (
                      <p className="text-[15px] leading-7 whitespace-pre-wrap text-[#333d4b]">{report.body}</p>
                    ) : (
                      <p className="text-[14px] text-[#8b95a1]">본문이 없습니다.</p>
                    )}
                  </div>
                ) : null}
              </article>
            );
          })}
        </div>
      )}
    </section>
  );
}
