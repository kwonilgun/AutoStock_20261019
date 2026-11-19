"use client";

import { useEffect, useRef, useState } from "react";
import { INCOME_KIND_LABEL, INCOME_KINDS, type IncomeKind } from "@/lib/engine/history";
import type { Currency } from "@/lib/engine/types";
import { incomeImportKey, parseImportedIncomes, type ImportedIncome } from "@/lib/income-import";
import { formatGroupedInput } from "@/lib/format";
import { addReturnIncome } from "@/lib/server/actions";
import { logHoldingImport } from "@/lib/server/import-log";

const PAGE_SOURCE = "eggbalance-holdings";
const EXT_SOURCE = "eggbalance-extension";

type Reply = {
  source?: string;
  id?: string;
  type?: string;
  ok?: boolean;
  error?: string | null;
  hasKey?: boolean;
  hasWorkspace?: boolean;
  incomes?: unknown;
  income?: boolean;
  step?: string | null;
  status?: number | null;
  detail?: string | null;
};

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

const STALE_EXTENSION = "확장 프로그램이 이전 버전입니다. chrome://extensions에서 에그발란스 보유 가져오기를 새로고침한 뒤, 이 화면도 새로고침해 주세요.";

function explainReply(error: string | null | undefined): string {
  if (error === "알 수 없는 요청입니다.") return STALE_EXTENSION;
  return error || "가져오지 못했습니다.";
}

function reportImport(entry: { step: string; ok?: boolean; message?: string; status?: number | null; detail?: string | null }) {
  void logHoldingImport(entry).catch(() => undefined);
}

function askExtension(type: string, extra: { apiKey?: string; workspaceId?: string } = {}, timeoutMs = 20000): Promise<Reply> {
  const id = crypto.randomUUID();
  return new Promise((resolve, reject) => {
    const timer = window.setTimeout(() => {
      window.removeEventListener("message", onMessage);
      reject(new Error("timeout"));
    }, timeoutMs);
    function onMessage(event: MessageEvent) {
      if (event.source !== window || event.origin !== window.location.origin) return;
      const data = event.data as Reply | null;
      if (!data || data.source !== EXT_SOURCE || data.id !== id) return;
      window.clearTimeout(timer);
      window.removeEventListener("message", onMessage);
      resolve(data);
    }
    window.addEventListener("message", onMessage);
    window.postMessage({ source: PAGE_SOURCE, id, type, ...extra }, window.location.origin);
  });
}

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
  const [installed, setInstalled] = useState<boolean | null>(null);
  const [hasKey, setHasKey] = useState(false);
  const [hasWorkspace, setHasWorkspace] = useState(false);
  const [supportsIncome, setSupportsIncome] = useState(false);
  const [apiKey, setApiKey] = useState("");
  const [workspaceId, setWorkspaceId] = useState("");
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
    let cancelled = false;
    function onReady(event: MessageEvent) {
      if (event.source !== window || event.origin !== window.location.origin) return;
      const data = event.data as Reply | null;
      if (data?.source === EXT_SOURCE && data.type === "ready") setInstalled(true);
    }
    window.addEventListener("message", onReady);
    askExtension("ping", {}, 1500)
      .then((reply) => {
        if (cancelled) return;
        setInstalled(reply.ok === true);
        setHasKey(reply.hasKey === true);
        setHasWorkspace(reply.hasWorkspace === true);
        setSupportsIncome(reply.income === true);
        if (reply.ok === true && reply.income !== true) setError(STALE_EXTENSION);
        else if (reply.ok !== true) setError("수익 가져오기 확장이 응답하지 않습니다. 크롬에 확장을 불러온 뒤 이 화면을 새로고침해 주세요.");
      })
      .catch(() => {
        if (cancelled) return;
        setInstalled(false);
        setError(null);
      });
    return () => {
      cancelled = true;
      window.removeEventListener("message", onReady);
    };
  }, [open]);

  function close() {
    setApiKey("");
    setWorkspaceId("");
    setRows(null);
    setError(null);
    setBusy(null);
    setReplace(false);
    onClose();
  }

  function updateRow(index: number, patch: Partial<PreviewRow>) {
    setRows((current) => (current ? current.map((row, rowIndex) => (rowIndex === index ? { ...row, ...patch } : row)) : current));
  }

  async function runImport(key?: string) {
    setError(null);
    setBusy(key ? "키를 저장하고 수익 화면을 읽는 중" : "수익 화면을 읽는 중");
    try {
      const workspace = workspaceId.trim();
      if (key || workspace) {
        const saved = await askExtension("save-key", { ...(key ? { apiKey: key } : {}), ...(workspace ? { workspaceId: workspace } : {}) }, 5000);
        reportImport({
          step: saved.step || "save-key",
          ok: saved.ok === true,
          message: saved.error || "",
          status: saved.status,
          detail: saved.detail,
        });
        if (!saved.ok) throw new Error(saved.error || "키를 저장하지 못했습니다.");
        setHasKey(true);
        setHasWorkspace(saved.hasWorkspace === true);
        setApiKey("");
        setWorkspaceId("");
      }
      setBusy("화면 글자에서 배당, 이자, 판매 수익을 읽는 중");
      const reply = await askExtension("import-income", {}, 45000);
      const replyError = reply.ok ? "" : explainReply(reply.error);
      reportImport({
        step: reply.step || "import-income",
        ok: reply.ok === true,
        message: replyError,
        status: reply.status,
        detail: reply.detail,
      });
      if (!reply.ok) throw new Error(replyError);
      const incomes = parseImportedIncomes({ incomes: reply.incomes });
      if (incomes.length === 0) throw new Error("화면에서 배당, 이자, 판매 수익을 찾지 못했습니다.");
      setRows(previewRows(incomes, existing));
    } catch (cause) {
      const message = cause instanceof Error && cause.message !== "timeout" ? cause.message : "확장 프로그램 응답이 없습니다.";
      reportImport({ step: "ui", ok: false, message });
      setError(message);
    } finally {
      setBusy(null);
    }
  }

  async function clearKey() {
    setError(null);
    const reply = await askExtension("clear-key", {}, 5000).catch(() => null);
    if (!reply?.ok) {
      setError(reply?.error || "키를 지우지 못했습니다.");
      return;
    }
    setHasKey(false);
    setHasWorkspace(false);
    setRows(null);
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
      const label = `${row.date} ${INCOME_KIND_LABEL[row.kind]}`;
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
        이 브라우저에 로그인해 둔 증권사 배당, 이자, 판매 수익 화면의 글자만 읽습니다. 로그인과 주문은 하지 않습니다. 종류, 날짜, 금액, 종목명을 추출하려고 그 글자를 Anthropic API로 보냅니다. 판매 수익은 판 금액이 아니라 번 금액입니다. 계좌번호 꼴의 숫자는 보내기 전에 가립니다. API 키는 이 브라우저의 확장 저장소에만 두고, 에그발란스 서버에는 저장하지 않습니다.
      </p>

      {installed === null ? <p className="mt-4 text-[13px] font-medium text-[#8b95a1]">확장을 확인하는 중</p> : null}

      {installed === false ? (
        <div className="mt-4 rounded-2xl bg-[#f2f4f6] px-4 py-3 text-[13px] leading-5 text-[#4e5968]">
          <p className="font-semibold text-[#191f28]">크롬 확장이 필요합니다.</p>
          <ol className="mt-2 list-decimal space-y-1 pl-5">
            <li>주소창에 chrome://extensions 를 엽니다.</li>
            <li>개발자 모드를 켭니다.</li>
            <li>압축해제된 확장 프로그램을 로드하고 이 프로젝트의 extension 폴더를 고릅니다.</li>
            <li>증권사 수익 화면과 이 페이지를 새로고침합니다.</li>
          </ol>
        </div>
      ) : null}

      {installed && !rows ? (
        <div className="mt-4">
          {hasKey ? (
            <div className="flex items-center justify-between gap-3">
              <p className="text-[14px] font-semibold text-[#191f28]">이 브라우저에 Claude 키가 있습니다.</p>
              <button type="button" className="text-[13px] font-semibold text-[#f04452]" onClick={clearKey} disabled={Boolean(busy)}>
                키 지우기
              </button>
            </div>
          ) : (
            <label className="grid gap-1.5">
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
          <label className="mt-3 grid gap-1.5">
            <span className="text-[13px] font-medium text-[#8b95a1]">워크스페이스 ID{hasWorkspace ? " · 저장됨" : ""}</span>
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
          <button
            type="button"
            disabled={Boolean(busy) || !supportsIncome || (!hasKey && apiKey.trim().length === 0)}
            onClick={() => runImport(hasKey ? undefined : apiKey.trim())}
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
