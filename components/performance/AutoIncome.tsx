"use client";

import { useEffect, useRef, useState, type ClipboardEvent } from "react";
import { INCOME_KIND_LABEL, INCOME_KINDS, type IncomeKind } from "@/lib/engine/history";
import type { Currency } from "@/lib/engine/types";
import type { HoldingImageType } from "@/lib/holdings-import";
import { incomeImportKey, isImportedIncomeDate, type ImportedIncome } from "@/lib/income-import";
import { extractIncomeImage, reportIncomeImport } from "@/lib/income-paste";
import { prepareHoldingImage } from "@/lib/holdings-paste";
import { formatGroupedInput } from "@/lib/format";
import { addReturnIncome } from "@/lib/server/actions";
import {
  forgetBrowserClaude,
  forgetBrowserClaudeWorkspace,
  readBrowserClaudeCredential,
  rememberBrowserClaude,
  rememberBrowserClaudeWorkspace,
} from "@/lib/claude-browser-key";

const IMAGE_TOO_LARGE = "이미지가 너무 큽니다. 수익 내역만 보이게 잘라 주세요.";

type ExistingIncome = {
  date: string;
  kind: IncomeKind;
  currency: Currency;
  amount: number;
  note: string;
};

type PreviewRow = {
  kind: IncomeKind;
  date: string;
  currency: Currency;
  amount: string;
  note: string;
  include: boolean;
  duplicate: boolean;
};

type Shot = { preview: string; mediaType: HoldingImageType; data: string };

function amountText(amount: number): string {
  return formatGroupedInput(String(amount));
}

function parsedAmount(value: string): number {
  return Number(value.replace(/,/g, "").replace(/−/g, "-").trim());
}

function previewRows(incomes: ImportedIncome[], existing: ExistingIncome[]): PreviewRow[] {
  const taken = new Set(existing.map((item) => incomeImportKey(item)));
  return incomes.map((income) => {
    const duplicate = taken.has(incomeImportKey(income));
    return {
      kind: income.kind,
      date: income.date,
      currency: income.currency,
      amount: amountText(income.amount),
      note: income.note,
      include: !duplicate,
      duplicate,
    };
  });
}

export function AutoIncome({
  open,
  existing,
  onClose,
  onSaved,
}: {
  open: boolean;
  existing: ExistingIncome[];
  onClose: () => void;
  onSaved: (message: string) => void;
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [ready, setReady] = useState(false);
  const [hasKey, setHasKey] = useState(false);
  const [storedWorkspace, setStoredWorkspace] = useState("");
  const [apiKey, setApiKey] = useState("");
  const [workspaceId, setWorkspaceId] = useState("");
  const [shot, setShot] = useState<Shot | null>(null);
  const shotRef = useRef<Shot | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [rows, setRows] = useState<PreviewRow[] | null>(null);
  const [replace, setReplace] = useState(false);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const stored = readBrowserClaudeCredential();
    setHasKey(Boolean(stored));
    setStoredWorkspace(stored?.workspaceId ?? "");
    setReady(true);
  }, [open]);

  function replaceShot(next: Shot | null) {
    if (shotRef.current?.preview) URL.revokeObjectURL(shotRef.current.preview);
    shotRef.current = next;
    setShot(next);
  }

  function close() {
    setApiKey("");
    setWorkspaceId("");
    replaceShot(null);
    setRows(null);
    setError(null);
    setBusy(null);
    setReplace(false);
    setReady(false);
    onClose();
  }

  function clearKey() {
    forgetBrowserClaude();
    setHasKey(false);
    setStoredWorkspace("");
    setApiKey("");
    setWorkspaceId("");
    setRows(null);
    setError(null);
  }

  function clearWorkspace() {
    forgetBrowserClaudeWorkspace();
    setStoredWorkspace("");
    setWorkspaceId("");
    setError(null);
  }

  function updateRow(index: number, patch: Partial<PreviewRow>) {
    setRows((current) => (current ? current.map((row, rowIndex) => (rowIndex === index ? { ...row, ...patch } : row)) : current));
  }

  async function takeImage(file: File | null) {
    if (!file) return;
    setError(null);
    try {
      const prepared = await prepareHoldingImage(file, IMAGE_TOO_LARGE);
      replaceShot({ ...prepared, preview: URL.createObjectURL(file) });
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : "이미지를 읽지 못했습니다.";
      reportIncomeImport({
        step: "image",
        ok: false,
        message,
        detail: `type=${file.type || "unknown"} bytes=${file.size}`,
      });
      setError(message);
    }
  }

  function onPasteImage(event: ClipboardEvent) {
    const file = Array.from(event.clipboardData.files).find((item) => item.type.startsWith("image/"));
    if (!file) return;
    event.preventDefault();
    void takeImage(file);
  }

  async function runImport() {
    setError(null);
    const key = hasKey ? (readBrowserClaudeCredential()?.apiKey ?? "") : apiKey.trim();
    const workspace = workspaceId.trim() || storedWorkspace;
    if (!key) {
      const message = "Claude API 키를 입력해 주세요.";
      reportIncomeImport({ step: "key", ok: false, message });
      setError(message);
      return;
    }
    if (!shot) {
      const message = "수익 화면 이미지를 넣어 주세요.";
      reportIncomeImport({ step: "image", ok: false, message });
      setError(message);
      return;
    }
    try {
      rememberBrowserClaude(key, workspaceId.trim() || undefined);
      setHasKey(true);
      setApiKey("");
      setWorkspaceId("");
      setBusy("캡처 이미지에서 배당, 이자, 판매 수익을 읽는 중");
      const result = await extractIncomeImage(key, workspace, shot);
      if (!result.ok) {
        setError(result.message);
        return;
      }
      if (result.workspaceId) {
        rememberBrowserClaudeWorkspace(result.workspaceId);
        setStoredWorkspace(result.workspaceId);
      }
      setRows(previewRows(result.incomes, existing));
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : "가져오지 못했습니다.";
      reportIncomeImport({ step: "ui", ok: false, message, detail: cause instanceof Error ? cause.stack?.slice(0, 500) : "" });
      setError(message);
    } finally {
      setBusy(null);
    }
  }

  async function confirmSave() {
    if (!rows) return;
    const chosen = rows.filter((row) => row.include);
    if (chosen.length === 0) {
      setError("등록할 수익을 골라 주세요.");
      return;
    }
    setError(null);
    setBusy("저장하는 중");
    let saved = 0;
    let skipped = 0;
    const failures: string[] = [];
    for (const row of chosen) {
      const amount = parsedAmount(row.amount);
      const label = `${row.note || INCOME_KIND_LABEL[row.kind]}`;
      if (!isImportedIncomeDate(row.date)) {
        failures.push(`${label}: 날짜를 입력해 주세요.`);
        continue;
      }
      if (!Number.isFinite(amount) || amount === 0) {
        failures.push(`${label}: 0이 아닌 금액을 입력해 주세요.`);
        continue;
      }
      if (row.kind !== "sale" && amount < 0) {
        failures.push(`${label}: 배당과 이자는 0보다 큰 금액만 됩니다.`);
        continue;
      }
      const duplicate = existing.some(
        (item) =>
          incomeImportKey(item) ===
          incomeImportKey({ date: row.date, kind: row.kind, currency: row.currency, amount, note: row.note }),
      );
      if (duplicate && !replace) {
        skipped += 1;
        continue;
      }
      const result = await addReturnIncome({
        date: row.date,
        kind: row.kind,
        currency: row.currency,
        amount,
        note: row.note.trim(),
      });
      if (result.ok) saved += 1;
      else failures.push(`${label}: ${result.message}`);
    }
    setBusy(null);
    if (saved === 0) {
      setError(failures[0] || (skipped > 0 ? "이미 있는 수익은 건너뛰었습니다. 또 기록하려면 아래 확인을 켜 주세요." : "저장하지 못했습니다."));
      return;
    }
    const parts = [`${saved}개를 기록했습니다.`];
    if (skipped > 0) parts.push(`이미 있는 ${skipped}개는 그대로 두었습니다.`);
    if (failures.length > 0) parts.push(`${failures.length}개는 저장하지 못했습니다.`);
    onSaved(parts.join(" "));
  }

  return (
    <dialog
      ref={dialogRef}
      aria-labelledby="auto-income-title"
      className="fixed inset-auto top-1/2 left-1/2 m-0 max-h-[88dvh] w-[min(100%-2rem,32rem)] -translate-x-1/2 -translate-y-1/2 overflow-y-auto rounded-[22px] border-0 bg-white p-5 text-[#191f28] shadow-[0_16px_48px_rgba(25,31,40,0.18)] backdrop:bg-[#191f28]/40"
      onClick={(event) => {
        if (event.target === event.currentTarget) close();
      }}
      onPaste={onPasteImage}
      onClose={close}
    >
      <div className="flex items-start justify-between gap-3">
        <h2 id="auto-income-title" className="text-[17px] font-bold text-[#191f28]">
          수익 가져오기
        </h2>
        <button type="button" className="shrink-0 text-[14px] font-semibold text-[#4e5968]" onClick={close}>
          닫기
        </button>
      </div>
      <p className="mt-2 text-[13px] leading-5 text-[#4e5968]">
        증권사 배당, 이자, 판매 수익 화면을 캡처해 아래에 붙여 넣거나 파일을 고릅니다. 수익 내역만 보이게 잘라 주세요. 종류, 날짜, 금액, 종목명을 읽으려고 그 이미지를 Anthropic API로 보냅니다. 판매 수익은 판 금액이 아니라 번 금액입니다. 계좌번호와 예금주가 보이면 그 화면도 함께 전송됩니다. API 키는 이 브라우저에만 두고, 에그발란스 서버에는 저장하지 않습니다. 키가 있으면 오늘 자문도 이 키의 Claude로 받습니다. 호출 비용은 키 소유자에게 청구됩니다.
      </p>

      {ready && !rows ? (
        <div className="mt-4">
          <div className="grid gap-1.5">
            <span className="text-[13px] font-medium text-[#8b95a1]">수익 화면 이미지</span>
            {shot ? (
              <div className="overflow-hidden rounded-2xl bg-[#f2f4f6]">
                <img src={shot.preview} alt="가져온 수익 화면" className="max-h-52 w-full object-contain" />
                <div className="flex justify-end px-3 py-2">
                  <button type="button" className="text-[13px] font-semibold text-[#f04452]" onClick={() => replaceShot(null)} disabled={Boolean(busy)}>
                    이미지 지우기
                  </button>
                </div>
              </div>
            ) : (
              <label className="flex min-h-40 cursor-pointer flex-col items-center justify-center gap-2 rounded-2xl bg-[#f2f4f6] px-4 py-6 text-center">
                <span className="text-[14px] font-semibold text-[#191f28]">캡처한 화면을 붙여 넣거나 파일을 고르세요</span>
                <span className="text-[12px] leading-5 text-[#8b95a1]">배당, 이자, 판매 수익의 날짜와 금액이 보이게 잘라 주세요.</span>
                <input
                  type="file"
                  accept="image/png,image/jpeg,image/webp,image/gif"
                  className="sr-only"
                  onChange={(event) => {
                    const file = event.target.files?.[0] ?? null;
                    event.target.value = "";
                    void takeImage(file);
                  }}
                />
              </label>
            )}
          </div>
          {hasKey ? (
            <div className="mt-3 flex items-center justify-between gap-3">
              <p className="text-[14px] font-semibold text-[#191f28]">이 브라우저에 Claude 키가 있습니다.</p>
              <button type="button" className="text-[13px] font-semibold text-[#f04452]" onClick={clearKey} disabled={Boolean(busy)}>
                키 지우기
              </button>
            </div>
          ) : (
            <label className="mt-3 grid gap-1.5">
              <span className="text-[13px] font-medium text-[#8b95a1]">Claude API 키</span>
              <input
                type="password"
                autoComplete="off"
                spellCheck={false}
                value={apiKey}
                onChange={(event) => setApiKey(event.target.value)}
                placeholder="API 키"
                className="h-12 w-full rounded-2xl bg-[#f2f4f6] px-4 font-mono text-[14px] text-[#191f28] outline-none ring-[#3182f6] focus:ring-2"
              />
            </label>
          )}
          {storedWorkspace ? (
            <div className="mt-3 flex items-center justify-between gap-3">
              <p className="text-[14px] font-semibold text-[#191f28]">이 브라우저에 워크스페이스가 있습니다.</p>
              <button type="button" className="shrink-0 text-[13px] font-semibold text-[#f04452]" onClick={clearWorkspace} disabled={Boolean(busy)}>
                워크스페이스 지우기
              </button>
            </div>
          ) : (
            <>
              <label className="mt-3 grid gap-1.5">
                <span className="text-[13px] font-medium text-[#8b95a1]">워크스페이스 ID</span>
                <input
                  type="text"
                  autoComplete="off"
                  spellCheck={false}
                  value={workspaceId}
                  onChange={(event) => setWorkspaceId(event.target.value)}
                  placeholder="워크스페이스 ID"
                  className="h-12 w-full rounded-2xl bg-[#f2f4f6] px-4 font-mono text-[14px] text-[#191f28] outline-none ring-[#3182f6] focus:ring-2"
                />
              </label>
              <p className="mt-1.5 text-[12px] leading-5 text-[#8b95a1]">
                이 키는 워크스페이스 ID가 필요합니다. platform.claude.com/settings/workspaces 의 ID 열을 넣습니다.
              </p>
            </>
          )}
          <button
            type="button"
            disabled={Boolean(busy) || !shot || (!hasKey && apiKey.trim().length === 0)}
            onClick={runImport}
            className="mt-3 h-12 w-full rounded-2xl bg-[#3182f6] text-[15px] font-bold text-white disabled:opacity-60"
          >
            {busy || (hasKey ? "가져오기" : "키 저장 후 가져오기")}
          </button>
        </div>
      ) : null}

      {rows ? (
        <div className="mt-4 flex flex-col gap-3">
          <p className="text-[13px] leading-5 text-[#4e5968]">
            배당, 이자, 판매 수익만 골랐습니다. 판매 수익은 번 금액인지 확인한 뒤 등록해 주세요. 손실은 −입니다.
          </p>
          {rows.map((row, index) => {
            const amount = parsedAmount(row.amount);
            const duplicate =
              Number.isFinite(amount) &&
              existing.some(
                (item) =>
                  incomeImportKey(item) ===
                  incomeImportKey({ date: row.date, kind: row.kind, currency: row.currency, amount, note: row.note }),
              );
            return (
              <div key={`${row.date}-${row.kind}-${index}`} className="rounded-2xl bg-[#f2f4f6] px-3 py-3">
                <label className="flex items-start gap-2">
                  <input
                    type="checkbox"
                    className="mt-1 h-4 w-4 accent-[#3182f6]"
                    checked={row.include}
                    onChange={(event) => updateRow(index, { include: event.target.checked })}
                  />
                  <span className="text-[14px] font-bold text-[#191f28]">{INCOME_KIND_LABEL[row.kind]}</span>
                </label>
                <div className="mt-2 grid grid-cols-2 gap-2">
                  <label className="grid gap-1">
                    <span className="text-[12px] font-medium text-[#8b95a1]">종류</span>
                    <select
                      value={row.kind}
                      onChange={(event) => updateRow(index, { kind: event.target.value as IncomeKind })}
                      className="h-10 rounded-xl bg-white px-3 text-[13px] font-semibold outline-none ring-[#3182f6] focus:ring-2"
                    >
                      {INCOME_KINDS.map((kind) => (
                        <option key={kind} value={kind}>
                          {INCOME_KIND_LABEL[kind]}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="grid gap-1">
                    <span className="text-[12px] font-medium text-[#8b95a1]">날짜</span>
                    <input
                      type="date"
                      value={row.date}
                      onChange={(event) => updateRow(index, { date: event.target.value })}
                      className="h-10 rounded-xl bg-white px-3 text-[13px] font-semibold outline-none ring-[#3182f6] focus:ring-2"
                    />
                  </label>
                  <label className="grid gap-1">
                    <span className="text-[12px] font-medium text-[#8b95a1]">통화</span>
                    <select
                      value={row.currency}
                      onChange={(event) => updateRow(index, { currency: event.target.value as Currency })}
                      className="h-10 rounded-xl bg-white px-3 text-[13px] font-semibold outline-none ring-[#3182f6] focus:ring-2"
                    >
                      <option value="KRW">원</option>
                      <option value="USD">달러</option>
                    </select>
                  </label>
                  <label className="grid gap-1">
                    <span className="text-[12px] font-medium text-[#8b95a1]">금액</span>
                    <input
                      value={row.amount}
                      inputMode="decimal"
                      onChange={(event) => updateRow(index, { amount: event.target.value })}
                      className="h-10 rounded-xl bg-white px-3 text-[14px] font-semibold outline-none ring-[#3182f6] focus:ring-2"
                    />
                  </label>
                </div>
                <label className="mt-2 grid gap-1">
                  <span className="text-[12px] font-medium text-[#8b95a1]">종목</span>
                  <input
                    value={row.note}
                    maxLength={40}
                    onChange={(event) => updateRow(index, { note: event.target.value })}
                    placeholder="예: JEPI, 삼성전자"
                    className="h-10 rounded-xl bg-white px-3 text-[13px] font-semibold outline-none ring-[#3182f6] placeholder:font-medium placeholder:text-[#b0b8c1] focus:ring-2"
                  />
                </label>
                {duplicate ? (
                  <p className="mt-2 text-[12px] leading-4 text-[#8b95a1]">이미 기록된 수익입니다. 아래를 켜야 한 번 더 기록합니다.</p>
                ) : null}
              </div>
            );
          })}
          <label className="flex items-center gap-2 text-[13px] font-semibold text-[#191f28]">
            <input type="checkbox" className="h-4 w-4 accent-[#3182f6]" checked={replace} onChange={(event) => setReplace(event.target.checked)} />
            이미 있는 수익도 또 기록합니다
          </label>
          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              disabled={Boolean(busy)}
              onClick={close}
              className="h-12 rounded-2xl bg-[#f2f4f6] text-[15px] font-bold text-[#4e5968] disabled:opacity-60"
            >
              취소
            </button>
            <button
              type="button"
              disabled={Boolean(busy)}
              onClick={confirmSave}
              className="h-12 rounded-2xl bg-[#3182f6] text-[15px] font-bold text-white disabled:opacity-60"
            >
              {busy || "확인하고 등록"}
            </button>
          </div>
        </div>
      ) : null}

      {error ? (
        <p role="alert" className="mt-3 text-[13px] font-medium leading-5 text-[#f04452]">
          {error}
        </p>
      ) : null}
    </dialog>
  );
}
