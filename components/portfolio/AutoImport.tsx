"use client";

import { useEffect, useRef, useState } from "react";
import { classify, normalizeTicker, sleeveForSecurity } from "@/lib/engine/classify";
import { SLEEVE_LABEL } from "@/lib/engine/config";
import type { Currency, Sleeve } from "@/lib/engine/types";
import { holdingImportChange, parseImportedHoldings, preferredMatch, type HeldPosition, type ImportedHolding } from "@/lib/holdings-import";
import type { SecurityMatch } from "@/lib/quotes/parse";
import { saveHolding, suggestSecurities } from "@/lib/server/actions";
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
  holdings?: unknown;
  step?: string | null;
  status?: number | null;
  detail?: string | null;
};

function reportImport(entry: { step: string; ok?: boolean; message?: string; status?: number | null; detail?: string | null }) {
  void logHoldingImport(entry).catch(() => undefined);
}

type PreviewRow = {
  name: string;
  quantity: string;
  avgPrice: string;
  matches: SecurityMatch[];
  ticker: string;
  include: boolean;
};

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

function marketOf(ticker: string, match?: SecurityMatch): "KR" | "US" {
  if (match) return match.market;
  const known = classify(ticker).market;
  if (known) return known;
  return /^\d{6}$/.test(ticker) ? "KR" : "US";
}

function sleeveOf(ticker: string, match?: SecurityMatch): Sleeve {
  if (match) return sleeveForSecurity(match.code, match.name, match.market);
  return classify(ticker).sleeve ?? (marketOf(ticker) === "US" ? "US_EQUITY" : "KR_EQUITY");
}

function heldPosition(held: HeldPosition[], ticker: string): HeldPosition | undefined {
  const code = normalizeTicker(ticker);
  return held.find((item) => item.ticker === code);
}

function rowChange(held: HeldPosition[], ticker: string, quantityText: string, avgText: string): "new" | "changed" | "same" | null {
  const code = normalizeTicker(ticker);
  if (!code) return null;
  const quantity = Number(quantityText.replace(/,/g, ""));
  const avgPrice = Number(avgText.replace(/,/g, ""));
  if (!(quantity > 0) || !(avgPrice > 0)) return null;
  return holdingImportChange(heldPosition(held, code), { quantity, avgPrice });
}

async function matchRows(holdings: ImportedHolding[], held: HeldPosition[]): Promise<PreviewRow[]> {
  const rows: PreviewRow[] = new Array(holdings.length);
  let cursor = 0;
  async function worker() {
    while (cursor < holdings.length) {
      const index = cursor;
      cursor += 1;
      const holding = holdings[index];
      const matches = await suggestSecurities(holding.name);
      const picked = preferredMatch(holding.name, matches);
      const ticker = picked?.code ?? "";
      const change = ticker ? rowChange(held, ticker, String(holding.quantity), String(holding.avgPrice)) : null;
      rows[index] = {
        name: holding.name,
        quantity: String(holding.quantity),
        avgPrice: String(holding.avgPrice),
        matches,
        ticker,
        include: Boolean(ticker) && change !== "same",
      };
    }
  }
  await Promise.all(Array.from({ length: Math.min(4, holdings.length) }, () => worker()));
  return rows;
}

export function AutoImport({
  open,
  held,
  onClose,
  onSaved,
}: {
  open: boolean;
  held: HeldPosition[];
  onClose: () => void;
  onSaved: (message: string) => void;
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [installed, setInstalled] = useState<boolean | null>(null);
  const [hasKey, setHasKey] = useState(false);
  const [hasWorkspace, setHasWorkspace] = useState(false);
  const [apiKey, setApiKey] = useState("");
  const [workspaceId, setWorkspaceId] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [rows, setRows] = useState<PreviewRow[] | null>(null);

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
        if (reply.ok !== true) setError("보유 가져오기 확장이 응답하지 않습니다. 크롬에 확장을 불러온 뒤 이 화면을 새로고침해 주세요.");
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
    onClose();
  }

  function updateRow(index: number, patch: Partial<PreviewRow>) {
    setRows((current) =>
      current
        ? current.map((row, rowIndex) => {
            if (rowIndex !== index) return row;
            const next = { ...row, ...patch };
            const change = rowChange(held, next.ticker, next.quantity, next.avgPrice);
            const include = change === "same" ? false : patch.include !== undefined ? patch.include : change ? true : next.include;
            return { ...next, include };
          })
        : current,
    );
  }

  async function runImport(key?: string) {
    setError(null);
    setBusy(key ? "키를 저장하고 보유 화면을 읽는 중" : "보유 화면을 읽는 중");
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
      setBusy("화면 글자에서 종목을 읽는 중");
      const reply = await askExtension("import", {}, 45000);
      reportImport({
        step: reply.step || "import",
        ok: reply.ok === true,
        message: reply.error || "",
        status: reply.status,
        detail: reply.detail,
      });
      if (!reply.ok) throw new Error(reply.error || "가져오지 못했습니다.");
      const holdings = parseImportedHoldings({ holdings: reply.holdings });
      if (holdings.length === 0) throw new Error("화면에서 종목명, 수량, 1주 평균금액을 찾지 못했습니다.");
      setBusy("종목 코드와 맞추는 중");
      setRows(await matchRows(holdings, held));
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
    const pending = rows.some((row) => rowChange(held, row.ticker, row.quantity, row.avgPrice) !== "same");
    if (chosen.length === 0) {
      if (!pending) {
        onSaved("수량과 1주 평균금액이 같은 종목은 그대로 두었습니다.");
        return;
      }
      setError("등록할 종목을 골라 주세요.");
      return;
    }
    const codes = chosen.map((row) => normalizeTicker(row.ticker));
    if (codes.some((code) => !code)) {
      setError("고른 종목의 코드를 확인해 주세요.");
      return;
    }
    if (new Set(codes).size !== codes.length) {
      setError("같은 종목을 두 번 골랐습니다. 하나만 남겨 주세요.");
      return;
    }
    setError(null);
    setBusy("저장하는 중");
    let added = 0;
    let updated = 0;
    let unchanged = 0;
    const failures: string[] = [];
    for (const row of chosen) {
      const ticker = normalizeTicker(row.ticker);
      const quantity = Number(row.quantity.replace(/,/g, ""));
      const avgPrice = Number(row.avgPrice.replace(/,/g, ""));
      if (!(quantity > 0) || !(avgPrice > 0)) {
        failures.push(`${row.name}: 수량과 1주 평균금액을 숫자로 입력해 주세요.`);
        continue;
      }
      const change = holdingImportChange(heldPosition(held, ticker), { quantity, avgPrice });
      if (change === "same") {
        unchanged += 1;
        continue;
      }
      const match = row.matches.find((item) => normalizeTicker(item.code) === ticker);
      const market = marketOf(ticker, match);
      const sleeve = sleeveOf(ticker, match);
      const result = await saveHolding({
        ticker,
        quantity,
        currency: (market === "US" ? "USD" : "KRW") as Currency,
        avgPrice,
        sleeve,
        isCoveredCall: sleeve === "US_EQUITY" ? classify(ticker).isCoveredCall : false,
      });
      if (!result.ok) {
        failures.push(`${row.name}: ${result.message}`);
        continue;
      }
      if (change === "new") added += 1;
      else updated += 1;
    }
    setBusy(null);
    if (added + updated === 0) {
      if (failures.length === 0) {
        onSaved(unchanged > 0 ? "수량과 1주 평균금액이 같은 종목은 그대로 두었습니다." : "저장하지 못했습니다.");
        return;
      }
      setError(failures[0]);
      return;
    }
    const parts: string[] = [];
    if (added > 0) parts.push(`새 종목 ${added}개를 추가했습니다.`);
    if (updated > 0) parts.push(`${updated}개는 수량 또는 1주 평균금액이 달라 바꿨습니다.`);
    if (unchanged > 0) parts.push(`같은 ${unchanged}개는 그대로 두었습니다.`);
    if (failures.length > 0) parts.push(`${failures.length}개는 저장하지 못했습니다.`);
    onSaved(parts.join(" "));
  }

  return (
    <dialog
      ref={dialogRef}
      aria-labelledby="auto-import-title"
      className="fixed inset-auto top-1/2 left-1/2 m-0 max-h-[88dvh] w-[min(100%-2rem,32rem)] -translate-x-1/2 -translate-y-1/2 overflow-y-auto rounded-[22px] border-0 bg-white p-5 text-[#191f28] shadow-[0_16px_48px_rgba(25,31,40,0.18)] backdrop:bg-[#191f28]/40"
      onClick={(event) => {
        if (event.target === event.currentTarget) close();
      }}
      onClose={close}
    >
      <div className="flex items-start justify-between gap-3">
        <h2 id="auto-import-title" className="text-[17px] font-bold text-[#191f28]">
          보유 종목 가져오기
        </h2>
        <button type="button" className="shrink-0 text-[14px] font-semibold text-[#4e5968]" onClick={close}>
          닫기
        </button>
      </div>
      <p className="mt-2 text-[13px] leading-5 text-[#4e5968]">
        이 브라우저에 로그인해 둔 증권사 보유 화면의 글자만 읽습니다. 로그인과 주문은 하지 않습니다. 종목명, 수량, 1주 평균금액을 추출하려고 그 글자를 Anthropic API로 보냅니다. 평균단가 칸이 따로 있으면 쓰지 않습니다. 계좌번호 꼴의 숫자는 보내기 전에 가립니다. API 키는 이 브라우저의 확장 저장소에만 두고, 에그발란스 서버에는 저장하지 않습니다. 호출 비용은 키 소유자에게 청구됩니다.
      </p>
      <p className="mt-2 text-[13px] leading-5 text-[#8b95a1]">
        증권사 약관이 화면 수집을 제한할 수 있습니다. 보안 프로그램이 화면 접근을 막으면 가져오지 못합니다.
      </p>

      {installed === null ? <p className="mt-4 text-[13px] font-medium text-[#8b95a1]">확장을 확인하는 중</p> : null}

      {installed === false ? (
        <div className="mt-4 rounded-2xl bg-[#f2f4f6] px-4 py-3 text-[13px] leading-5 text-[#4e5968]">
          <p className="font-semibold text-[#191f28]">크롬 확장이 필요합니다.</p>
          <ol className="mt-2 list-decimal space-y-1 pl-5">
            <li>주소창에 chrome://extensions 를 엽니다.</li>
            <li>개발자 모드를 켭니다.</li>
            <li>압축해제된 확장 프로그램을 로드하고 이 프로젝트의 extension 폴더를 고릅니다.</li>
            <li>증권사 보유 화면과 이 페이지를 새로고침합니다.</li>
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
            disabled={Boolean(busy) || (!hasKey && apiKey.trim().length === 0)}
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
            새 종목은 추가하고, 수량이나 1주 평균금액이 다른 종목만 바꿉니다. 같은 값은 그대로 둡니다. 비슷한 ETF는 코드를 확인한 뒤 등록해 주세요.
          </p>
          {rows.map((row, index) => {
            const ticker = normalizeTicker(row.ticker);
            const listed = row.matches.some((match) => normalizeTicker(match.code) === ticker);
            const match = row.matches.find((item) => normalizeTicker(item.code) === ticker);
            const ambiguous = row.matches.length > 1 && !preferredMatch(row.name, row.matches);
            const change = rowChange(held, row.ticker, row.quantity, row.avgPrice);
            return (
              <div key={`${row.name}-${index}`} className="rounded-2xl bg-[#f2f4f6] px-3 py-3">
                <label className="flex items-start gap-2">
                  <input
                    type="checkbox"
                    className="mt-1 h-4 w-4 accent-[#3182f6]"
                    checked={row.include}
                    disabled={change === "same"}
                    onChange={(event) => updateRow(index, { include: event.target.checked })}
                  />
                  <span className="min-w-0 flex-1">
                    <span className="block text-[14px] font-bold text-[#191f28]">{row.name}</span>
                    {ticker && match ? (
                      <span className="mt-0.5 block text-[12px] font-medium text-[#4e5968]">
                        {SLEEVE_LABEL[sleeveOf(ticker, match)]} · {match.market}
                      </span>
                    ) : null}
                  </span>
                </label>
                <div className="mt-2 grid grid-cols-2 gap-2">
                  <label className="grid gap-1">
                    <span className="text-[12px] font-medium text-[#8b95a1]">수량</span>
                    <input
                      value={row.quantity}
                      inputMode="decimal"
                      onChange={(event) => updateRow(index, { quantity: event.target.value })}
                      className="h-10 rounded-xl bg-white px-3 text-[14px] font-semibold outline-none ring-[#3182f6] focus:ring-2"
                    />
                  </label>
                  <label className="grid gap-1">
                    <span className="text-[12px] font-medium text-[#8b95a1]">1주 평균금액</span>
                    <input
                      value={row.avgPrice}
                      inputMode="decimal"
                      onChange={(event) => updateRow(index, { avgPrice: event.target.value })}
                      className="h-10 rounded-xl bg-white px-3 text-[14px] font-semibold outline-none ring-[#3182f6] focus:ring-2"
                    />
                  </label>
                </div>
                {row.matches.length > 0 ? (
                  <select
                    value={listed ? row.ticker : ""}
                    onChange={(event) => updateRow(index, { ticker: event.target.value, include: event.target.value !== "" })}
                    className="mt-2 h-10 w-full rounded-xl bg-white px-3 text-[13px] font-semibold outline-none ring-[#3182f6] focus:ring-2"
                  >
                    <option value="">종목 선택</option>
                    {row.matches.map((item) => (
                      <option key={item.code} value={item.code}>
                        {item.name} · {item.code}
                      </option>
                    ))}
                  </select>
                ) : (
                  <p className="mt-2 text-[12px] leading-4 text-[#f04452]">종목 목록에서 찾지 못했습니다. 코드를 직접 입력해 주세요.</p>
                )}
                <input
                  value={listed ? "" : row.ticker}
                  onChange={(event) => updateRow(index, { ticker: event.target.value, include: event.target.value.trim() !== "" })}
                  placeholder="코드 직접 입력"
                  className="mt-2 h-10 w-full rounded-xl bg-white px-3 text-[13px] font-semibold outline-none ring-[#3182f6] placeholder:font-medium placeholder:text-[#b0b8c1] focus:ring-2"
                />
                {ambiguous ? <p className="mt-2 text-[12px] leading-4 text-[#f04452]">이름이 비슷한 종목이 여러 개입니다. 코드를 확인해 주세요.</p> : null}
                {change === "same" ? (
                  <p className="mt-2 text-[12px] leading-4 text-[#8b95a1]">수량과 1주 평균금액이 같아서 그대로 둡니다.</p>
                ) : null}
                {change === "changed" ? (
                  <p className="mt-2 text-[12px] leading-4 text-[#8b95a1]">수량 또는 1주 평균금액이 달라 바꿉니다.</p>
                ) : null}
                {change === "new" ? <p className="mt-2 text-[12px] leading-4 text-[#8b95a1]">새 종목이라 추가합니다.</p> : null}
              </div>
            );
          })}
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
