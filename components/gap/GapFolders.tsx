"use client";

import { useState } from "react";
import type { GapView } from "@/lib/engine/gap";
import type { Sleeve } from "@/lib/engine/types";
import { formatNumber, formatPercent, formatPp } from "@/lib/format";

const SLEEVE_COLOR: Record<Sleeve, string> = {
  US_EQUITY: "#3182f6",
  KR_EQUITY: "#64a8ff",
  BOND_10Y: "#00c471",
  BOND_30Y: "#12b886",
  GOLD: "#ffb020",
  BTC: "#ff8a00",
  REIT: "#7b61ff",
  FUND: "#845ef7",
  KRW_CASH: "#d1d6db",
  USD_CASH: "#8b95a1",
};

const STATUS_LABEL: Record<GapView["status"], string> = {
  over: "과다",
  under: "부족",
  hold: "유지",
  match: "일치",
};

export type GapFolder = {
  label: string;
  color: string;
  summary: GapView;
  members: GapView[];
};

function won(value: number): string {
  const rounded = Math.round(value);
  const sign = rounded < 0 ? "-" : "";
  return `${sign}${formatNumber(Math.abs(rounded))}원`;
}

function gapTone(status: GapView["status"]): string {
  if (status === "over") return "text-[#f04452]";
  if (status === "under") return "text-[#3182f6]";
  return "text-[#8b95a1]";
}

function gapMoney(sleeve: GapView): string {
  if (sleeve.status === "match") return "목표와 같아요";
  if (sleeve.status === "hold") return "±2%p 안쪽이라 그대로 둡니다";
  const diff = Math.round(sleeve.currentKrw - sleeve.targetKrw);
  if (diff > 0) return `목표보다 ${won(diff)} 많아요`;
  if (diff < 0) return `목표보다 ${won(Math.abs(diff))} 부족해요`;
  return sleeve.status === "over" ? "목표보다 조금 많아요" : "목표보다 조금 부족해요";
}

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

function WeightBar({ weight, target, color, thick }: { weight: number; target: number; color: string; thick?: boolean }) {
  return (
    <div className={`relative rounded-full bg-[#e5e8eb] ${thick ? "mt-3 h-2" : "mt-2 h-1"}`}>
      <span
        className="block h-full rounded-full"
        style={{ width: `${Math.min(100, Math.max(0, weight * 100))}%`, background: color }}
      />
      <span
        className={`absolute top-1/2 w-0.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-[#191f28] ${thick ? "h-3.5" : "h-2.5"}`}
        style={{ left: `${Math.min(100, Math.max(0, target * 100))}%` }}
      />
    </div>
  );
}

function GroupSummary({ sleeve, color }: { sleeve: GapView; color: string }) {
  return (
    <div className="min-w-0">
      <div className="flex items-center justify-between gap-3">
        <span className="flex min-w-0 items-center gap-2">
          <span className="h-3 w-3 shrink-0 rounded-full" style={{ background: color }} />
          <span className="truncate text-[18px] font-bold text-[#191f28]">{sleeve.label}</span>
          <span className="shrink-0 rounded-full bg-[#f2f4f6] px-2 py-0.5 text-[11px] font-semibold text-[#6b7684]">전체</span>
        </span>
        <span className={`shrink-0 text-[18px] font-bold tabular-nums ${gapTone(sleeve.status)}`}>{formatPp(sleeve.gapPp)}</span>
      </div>
      <p className="mt-1.5 pl-5 text-[13px]  tabular-nums tracking-tight text-[#191f28]">합계 {won(sleeve.currentKrw)}</p>
      <p className="mt-0.5 pl-5 text-[13px] leading-5 text-[#4e5968]">
        현재 {formatPercent(sleeve.currentWeight)} · 목표 {formatPercent(sleeve.targetWeight)} · {STATUS_LABEL[sleeve.status]}
      </p>
      <p className={`mt-0.5 pl-5 text-[13px] font-semibold ${gapTone(sleeve.status)}`}>{gapMoney(sleeve)}</p>
      <div className="pl-5">
        <WeightBar weight={sleeve.currentWeight} target={sleeve.targetWeight} color={color} thick />
      </div>
    </div>
  );
}

function MemberLine({ sleeve, color }: { sleeve: GapView; color: string }) {
  return (
    <div className="min-w-0">
      <div className="flex items-center justify-between gap-3">
        <span className="flex min-w-0 items-center gap-2">
          <span className="h-1.5 w-1.5 shrink-0 rounded-full" style={{ background: color }} />
          <span className="truncate text-[14px] font-medium text-[#4e5968]">{sleeve.label}</span>
        </span>
        <span className={`shrink-0 text-[14px] font-semibold tabular-nums ${gapTone(sleeve.status)}`}>{formatPp(sleeve.gapPp)}</span>
      </div>
      <p className="mt-1 pl-3.5 text-[13px] font-semibold tabular-nums text-[#191f28]">{won(sleeve.currentKrw)}</p>
      <p className="mt-0.5 pl-3.5 text-[12px] leading-5 text-[#8b95a1]">
        현재 {formatPercent(sleeve.currentWeight)} · 목표 {formatPercent(sleeve.targetWeight)} · {STATUS_LABEL[sleeve.status]}
      </p>
      <p className={`mt-0.5 pl-3.5 text-[12px] ${gapTone(sleeve.status)}`}>{gapMoney(sleeve)}</p>
      <div className="pl-3.5">
        <WeightBar weight={sleeve.currentWeight} target={sleeve.targetWeight} color={color} />
      </div>
      {sleeve.guardNote ? <p className="mt-1.5 pl-3.5 text-[12px] font-medium text-[#f04452]">{sleeve.guardNote}</p> : null}
    </div>
  );
}

export function GapFolders({ groups }: { groups: GapFolder[] }) {
  const [openLabels, setOpenLabels] = useState<string[]>([]);

  function toggle(label: string) {
    setOpenLabels((current) => (current.includes(label) ? current.filter((item) => item !== label) : [...current, label]));
  }

  return (
    <section className="rounded-[22px] bg-white px-5 py-5">
      <h2 className="text-[17px] font-bold text-[#191f28]">자산별 괴리</h2>
      <p className="mt-1 text-[13px] leading-5 text-[#8b95a1]">
        그룹을 누르면 세부 자산이 펼쳐집니다. 막대는 현재 비중, 눈금은 목표 비중입니다.
      </p>
      <ul>
        {groups.map((group) => {
          const open = openLabels.includes(group.label);
          return (
            <li key={group.label} className="border-b border-[#f2f4f6] last:border-b-0">
              <button type="button" aria-expanded={open} onClick={() => toggle(group.label)} className="flex w-full items-start gap-2 py-4 text-left">
                <span className="min-w-0 flex-1">
                  <GroupSummary sleeve={group.summary} color={group.color} />
                </span>
                <span className="mt-1 shrink-0">
                  <ChevronIcon open={open} />
                </span>
              </button>
              {open ? (
                <ul className="mb-4 ml-5 rounded-2xl bg-[#f4f6f8] px-3">
                  {group.members.map((member) => (
                    <li key={member.id} className="border-b border-[#e5e8eb] py-3 last:border-b-0">
                      <MemberLine sleeve={member} color={SLEEVE_COLOR[member.colorSleeve]} />
                    </li>
                  ))}
                </ul>
              ) : null}
            </li>
          );
        })}
      </ul>
    </section>
  );
}
