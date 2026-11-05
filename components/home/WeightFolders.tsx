"use client";

import { useState } from "react";
import { formatPercent } from "@/lib/format";

export type WeightFolder = {
  label: string;
  weight: number;
  members: { label: string; weight: number }[];
};

function ChevronIcon({ open }: { open: boolean }) {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden
      className={`shrink-0 text-[#8b95a1] transition-transform ${open ? "rotate-180" : ""}`}
    >
      <path d="M6 9.5 12 15.5 18 9.5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function WeightBar({ weight }: { weight: number }) {
  return (
    <span className="mt-2 block h-1.5 overflow-hidden rounded-full bg-[#f2f4f6]">
      <span
        className="block h-full rounded-full bg-[#3182f6]"
        style={{ width: `${Math.min(100, Math.max(0, weight * 100))}%` }}
      />
    </span>
  );
}

export function WeightFolders({ phase, groups }: { phase: string; groups: WeightFolder[] }) {
  const [sectionOpen, setSectionOpen] = useState(false);
  const [openLabels, setOpenLabels] = useState<string[]>([]);

  function toggle(label: string) {
    setOpenLabels((current) => (current.includes(label) ? current.filter((item) => item !== label) : [...current, label]));
  }

  return (
    <section className="rounded-[22px] bg-white px-5">
      <button
        type="button"
        aria-expanded={sectionOpen}
        onClick={() => setSectionOpen((current) => !current)}
        className="flex w-full items-center gap-2 py-5 text-left"
      >
        <span className="min-w-0 flex-1 text-[17px] font-bold text-[#191f28]">이번 달 목표 비중</span>
        <span className="shrink-0 text-[13px] font-medium text-[#8b95a1]">{phase} 국면</span>
        <ChevronIcon open={sectionOpen} />
      </button>
      {sectionOpen ? (
        <div className="pb-5">
          <p className="text-[13px] leading-5 text-[#8b95a1]">그룹을 누르면 세부 비중이 펼쳐집니다.</p>
          <ul className="mt-1">
            {groups.map((group) => {
              const open = openLabels.includes(group.label);
              return (
                <li key={group.label} className="border-b border-[#f2f4f6] last:border-b-0">
                  <button
                    type="button"
                    aria-expanded={open}
                    onClick={() => toggle(group.label)}
                    className="w-full py-3.5 text-left"
                  >
                    <span className="flex items-center justify-between gap-3">
                      <span className="text-[16px] font-bold text-[#191f28]">{group.label}</span>
                      <span className="ml-auto text-[16px] font-bold tabular-nums text-[#191f28]">{formatPercent(group.weight)}</span>
                      <ChevronIcon open={open} />
                    </span>
                    <WeightBar weight={group.weight} />
                  </button>
                  {open ? (
                    <ul className="pb-2 pl-3">
                      {group.members.map((member) => (
                        <li key={member.label} className="border-t border-[#f2f4f6] py-2.5">
                          <span className="flex items-baseline justify-between gap-3">
                            <span className="text-[14px] font-semibold text-[#333d4b]">{member.label}</span>
                            <span className="text-[14px] font-semibold tabular-nums text-[#4e5968]">{formatPercent(member.weight)}</span>
                          </span>
                          <WeightBar weight={member.weight} />
                        </li>
                      ))}
                    </ul>
                  ) : null}
                </li>
              );
            })}
          </ul>
        </div>
      ) : null}
    </section>
  );
}
