"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { ReportArchive } from "@/components/recommend/ReportArchive";
import { formatDay } from "@/lib/format";
import {
  RECOMMEND_CATEGORIES,
  RECOMMEND_LABEL,
  RECOMMEND_MAX_ITEMS,
  type RecommendCategory,
  type RecommendItem,
  type RecommendItems,
} from "@/lib/recommendations";
import type { AnalysisReportView } from "@/lib/reports";
import { adminDeleteReport, adminSaveRecommendations, adminSaveReport, adminUpdateReport } from "@/lib/server/admin-actions";

type Notice = { ok: boolean; text: string } | null;

const EMPTY_ROW: RecommendItem = { ticker: "", name: "", note: "" };

export function RecommendEditor({ items }: { items: RecommendItems }) {
  const [selected, setSelected] = useState<RecommendCategory>("US_STOCK");
  const [message, setMessage] = useState<Notice>(null);

  return (
    <section className="rounded-[22px] bg-white px-5 py-5">
      <h2 className="text-[17px] font-bold text-[#191f28]">추천 종목</h2>
      <p className="mt-1 text-[13px] leading-5 text-[#8b95a1]">
        저장하면 홈 화면의 추천 종목 카드에 바로 보입니다. 분류마다 {RECOMMEND_MAX_ITEMS}개까지 넣을 수 있습니다.
      </p>
      <div className="mt-4 grid grid-cols-3 gap-1.5">
        {RECOMMEND_CATEGORIES.map((category) => {
          const active = category === selected;
          return (
            <button
              key={category}
              type="button"
              onClick={() => {
                setSelected(category);
                setMessage(null);
              }}
              className={`rounded-xl py-2 text-[13px] font-bold ${active ? "bg-[#3182f6] text-white" : "bg-[#f2f4f6] text-[#4e5968]"}`}
            >
              {RECOMMEND_LABEL[category]}
              <span className="block text-[10px] font-medium">{items[category].length}개</span>
            </button>
          );
        })}
      </div>
      <CategoryForm
        key={`${selected}:${JSON.stringify(items[selected])}`}
        category={selected}
        items={items[selected]}
        onNotice={setMessage}
      />
      {message ? (
        <p className={`mt-3 text-[14px] font-medium ${message.ok ? "text-[#3182f6]" : "text-[#f04452]"}`}>{message.text}</p>
      ) : null}
    </section>
  );
}

function CategoryForm({
  category,
  items,
  onNotice: setMessage,
}: {
  category: RecommendCategory;
  items: RecommendItem[];
  onNotice: (notice: Notice) => void;
}) {
  const [rows, setRows] = useState<RecommendItem[]>(() => (items.length ? items : [EMPTY_ROW]));
  const [pending, startTransition] = useTransition();

  function update(index: number, field: keyof RecommendItem, value: string) {
    setRows((prev) => prev.map((row, i) => (i === index ? { ...row, [field]: value } : row)));
  }

  function move(index: number, delta: number) {
    setRows((prev) => {
      const target = index + delta;
      if (target < 0 || target >= prev.length) return prev;
      const next = [...prev];
      [next[index], next[target]] = [next[target], next[index]];
      return next;
    });
  }

  function save() {
    setMessage(null);
    startTransition(async () => {
      const result = await adminSaveRecommendations(category, rows);
      setMessage({ ok: result.ok, text: result.message ?? "저장했습니다." });
    });
  }

  return (
    <div className="mt-4">
      <ul className="flex flex-col gap-2">
        {rows.map((row, index) => (
          <li key={index} className="rounded-2xl bg-[#f9fafb] p-3">
            <div className="flex gap-1.5">
              <input
                aria-label="티커"
                placeholder="티커"
                value={row.ticker}
                onChange={(event) => update(index, "ticker", event.target.value)}
                className="w-24 shrink-0 rounded-lg border border-[#e5e8eb] bg-white px-2 py-1.5 text-[14px] font-semibold uppercase"
              />
              <input
                aria-label="종목명"
                placeholder="종목명"
                value={row.name}
                onChange={(event) => update(index, "name", event.target.value)}
                className="min-w-0 flex-1 rounded-lg border border-[#e5e8eb] bg-white px-2 py-1.5 text-[14px]"
              />
            </div>
            <textarea
              aria-label="추천 이유"
              placeholder="추천 이유 (선택)"
              rows={2}
              value={row.note}
              onChange={(event) => update(index, "note", event.target.value)}
              className="mt-1.5 w-full resize-y rounded-lg border border-[#e5e8eb] bg-white px-2 py-1.5 text-[13px] leading-5"
            />
            <div className="mt-1 flex justify-end gap-3 text-[12px] font-semibold text-[#8b95a1]">
              <button type="button" onClick={() => move(index, -1)} disabled={index === 0} className="disabled:opacity-30">
                위로
              </button>
              <button type="button" onClick={() => move(index, 1)} disabled={index === rows.length - 1} className="disabled:opacity-30">
                아래로
              </button>
              <button type="button" onClick={() => setRows((prev) => prev.filter((_, i) => i !== index))} className="text-[#f04452]">
                삭제
              </button>
            </div>
          </li>
        ))}
      </ul>
      <button
        type="button"
        onClick={() => setRows((prev) => [...prev, EMPTY_ROW])}
        disabled={rows.length >= RECOMMEND_MAX_ITEMS}
        className="mt-2 w-full rounded-xl border border-dashed border-[#d1d6db] py-2.5 text-[14px] font-semibold text-[#4e5968] disabled:opacity-40"
      >
        종목 추가
      </button>
      <button
        type="button"
        onClick={save}
        disabled={pending}
        className="mt-3 w-full rounded-xl bg-[#3182f6] py-3 text-[15px] font-semibold text-white disabled:opacity-40"
      >
        {pending ? "저장 중" : `${RECOMMEND_LABEL[category]} 추천 저장`}
      </button>
    </div>
  );
}

export function ReportEditor({ reports, today }: { reports: AnalysisReportView[]; today: string }) {
  const [date, setDate] = useState(today);
  const [draftTitle, setDraftTitle] = useState("");
  const [draftBody, setDraftBody] = useState("");
  const [message, setMessage] = useState<Notice>(null);
  const [messageAt, setMessageAt] = useState<"form" | "list">("form");
  const [focusId, setFocusId] = useState<string | null>(null);
  const [focusTick, setFocusTick] = useState(0);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editTitle, setEditTitle] = useState("");
  const [editBody, setEditBody] = useState("");
  const [confirmId, setConfirmId] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  function save() {
    setMessage(null);
    startTransition(async () => {
      const result = await adminSaveReport(date, draftTitle, draftBody);
      setMessageAt("form");
      setMessage({ ok: result.ok, text: result.message ?? "추가했습니다." });
      if (!result.ok) return;
      setDraftTitle("");
      setDraftBody("");
      setEditingId(null);
      setConfirmId(null);
      if (result.id) {
        setFocusId(result.id);
        setFocusTick((tick) => tick + 1);
      }
      router.refresh();
    });
  }

  function startEdit(report: AnalysisReportView) {
    setEditingId(report.id);
    setEditTitle(report.title);
    setEditBody(report.body);
    setConfirmId(null);
    setMessage(null);
  }

  function commitEdit(id: string) {
    setMessage(null);
    startTransition(async () => {
      const result = await adminUpdateReport(id, editTitle, editBody);
      setMessageAt("list");
      setMessage({ ok: result.ok, text: result.message ?? "고쳤습니다." });
      if (!result.ok) return;
      setEditingId(null);
      setFocusId(id);
      setFocusTick((tick) => tick + 1);
      router.refresh();
    });
  }

  function remove(id: string) {
    setMessage(null);
    startTransition(async () => {
      const result = await adminDeleteReport(id);
      setMessageAt("list");
      setMessage({ ok: result.ok, text: result.message ?? "지웠습니다." });
      if (!result.ok) return;
      setConfirmId(null);
      if (editingId === id) setEditingId(null);
      router.refresh();
    });
  }

  return (
    <>
      <section className="rounded-[22px] bg-white px-5 py-5">
        <h2 className="text-[17px] font-bold text-[#191f28]">분석 리포트 추가</h2>
        <p className="mt-1 text-[13px] leading-5 text-[#8b95a1]">
          같은 날짜에도 리포트를 여러 개 추가할 수 있습니다. 이미 올린 글은 아래 목록을 펼쳐 고칩니다. 홈 화면에도 같은
          순서로 보이고, 줄바꿈은 입력한 대로 유지됩니다.
        </p>
        <label className="mt-4 block text-[13px] font-semibold text-[#4e5968]">
          날짜
          <input
            aria-label="리포트 날짜"
            type="date"
            min="2020-01-01"
            max={today}
            value={date}
            onChange={(event) => {
              setDate(event.target.value);
              setMessage(null);
            }}
            className="mt-1 w-full rounded-lg border border-[#e5e8eb] px-3 py-2 text-[15px] font-semibold"
          />
        </label>
        <p className="mt-2 text-[13px] text-[#8b95a1]">
          {date ? `${formatDay(date)}에 새 리포트를 추가합니다.` : "날짜를 고르세요."}
        </p>
        <input
          aria-label="리포트 제목"
          placeholder="제목"
          value={draftTitle}
          onChange={(event) => setDraftTitle(event.target.value)}
          className="mt-3 w-full rounded-lg border border-[#e5e8eb] px-3 py-2 text-[15px] font-semibold"
        />
        <textarea
          aria-label="리포트 본문"
          placeholder="시장 분석, 추천 근거, 유의할 점 등을 적어 주세요."
          rows={12}
          value={draftBody}
          onChange={(event) => setDraftBody(event.target.value)}
          className="mt-2 w-full resize-y rounded-lg border border-[#e5e8eb] px-3 py-2 text-[14px] leading-6"
        />
        <button
          type="button"
          onClick={save}
          disabled={pending}
          className="mt-3 w-full rounded-xl bg-[#3182f6] py-3 text-[15px] font-semibold text-white disabled:opacity-40"
        >
          {pending ? "추가 중" : "이 날짜로 추가"}
        </button>
        {message && messageAt === "form" ? (
          <p className={`mt-3 text-[14px] font-medium ${message.ok ? "text-[#3182f6]" : "text-[#f04452]"}`}>{message.text}</p>
        ) : null}
      </section>
      <ReportArchive
        reports={reports}
        focusId={focusId}
        focusTick={focusTick}
        notice={
          message && messageAt === "list" ? (
            <p className={`mt-2 text-[14px] font-medium ${message.ok ? "text-[#3182f6]" : "text-[#f04452]"}`}>{message.text}</p>
          ) : null
        }
        detail={(report) =>
          editingId === report.id ? (
            <div>
              <input
                aria-label="리포트 제목 수정"
                placeholder="제목"
                value={editTitle}
                onChange={(event) => setEditTitle(event.target.value)}
                className="w-full rounded-lg border border-[#e5e8eb] px-3 py-2 text-[15px] font-semibold"
              />
              <textarea
                aria-label="리포트 본문 수정"
                placeholder="본문"
                rows={10}
                value={editBody}
                onChange={(event) => setEditBody(event.target.value)}
                className="mt-2 w-full resize-y rounded-lg border border-[#e5e8eb] px-3 py-2 text-[14px] leading-6"
              />
              <div className="mt-2 grid grid-cols-2 gap-2">
                <button
                  type="button"
                  disabled={pending}
                  onClick={() => setEditingId(null)}
                  className="rounded-xl bg-[#f2f4f6] py-2.5 text-[14px] font-semibold text-[#4e5968] disabled:opacity-40"
                >
                  취소
                </button>
                <button
                  type="button"
                  disabled={pending}
                  onClick={() => commitEdit(report.id)}
                  className="rounded-xl bg-[#3182f6] py-2.5 text-[14px] font-semibold text-white disabled:opacity-40"
                >
                  {pending ? "저장 중" : "수정 저장"}
                </button>
              </div>
            </div>
          ) : confirmId === report.id ? (
            <div className="rounded-2xl bg-[#fff4f4] px-3 py-3">
              <p className="text-[14px] font-medium text-[#f04452]">
                {formatDay(report.date)} {report.title || "제목 없음"} 리포트를 지울까요?
              </p>
              <div className="mt-2 grid grid-cols-2 gap-2">
                <button
                  type="button"
                  disabled={pending}
                  onClick={() => setConfirmId(null)}
                  className="rounded-xl bg-white py-2.5 text-[14px] font-semibold text-[#4e5968] disabled:opacity-40"
                >
                  취소
                </button>
                <button
                  type="button"
                  disabled={pending}
                  onClick={() => remove(report.id)}
                  className="rounded-xl bg-[#f04452] py-2.5 text-[14px] font-semibold text-white disabled:opacity-40"
                >
                  지우기
                </button>
              </div>
            </div>
          ) : (
            <div>
              {report.body ? (
                <p className="text-[15px] leading-7 whitespace-pre-wrap text-[#333d4b]">{report.body}</p>
              ) : (
                <p className="text-[14px] text-[#8b95a1]">본문이 없습니다.</p>
              )}
              <div className="mt-3 grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => startEdit(report)}
                  className="rounded-xl bg-[#f2f4f6] py-2.5 text-[14px] font-semibold text-[#4e5968]"
                >
                  내용 수정
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setConfirmId(report.id);
                    setEditingId(null);
                  }}
                  className="rounded-xl bg-[#fff4f4] py-2.5 text-[14px] font-semibold text-[#f04452]"
                >
                  삭제
                </button>
              </div>
            </div>
          )
        }
      />
    </>
  );
}
