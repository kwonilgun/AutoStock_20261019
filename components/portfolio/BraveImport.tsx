"use client";

import { useEffect, useRef, useState, type ClipboardEvent } from "react";
import type { HeldPosition, HoldingImageType } from "@/lib/holdings-import";
import { extractHoldingImage, prepareHoldingImage } from "@/lib/holdings-paste";
import { HoldingImportRows, applyRowPatch, matchRows, saveChosenHoldings, type PreviewRow } from "@/components/portfolio/holding-import-shared";
import { readBrowserClaudeCredential, rememberBrowserClaudeWorkspace } from "@/lib/claude-browser-key";

export function BraveImport({
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
  const [shot, setShot] = useState<{ preview: string; mediaType: HoldingImageType; data: string } | null>(null);
  const shotRef = useRef<{ preview: string } | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [rows, setRows] = useState<PreviewRow[] | null>(null);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  function replaceShot(next: { preview: string; mediaType: HoldingImageType; data: string } | null) {
    if (shotRef.current?.preview) URL.revokeObjectURL(shotRef.current.preview);
    shotRef.current = next;
    setShot(next);
  }

  function close() {
    replaceShot(null);
    setRows(null);
    setError(null);
    setBusy(null);
    onClose();
  }

  async function takeImage(file: File | null) {
    if (!file) return;
    setError(null);
    try {
      const prepared = await prepareHoldingImage(file);
      replaceShot({ ...prepared, preview: URL.createObjectURL(file) });
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "이미지를 읽지 못했습니다.");
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
    const stored = readBrowserClaudeCredential();
    const key = stored?.apiKey ?? "";
    const workspace = stored?.workspaceId ?? "";
    if (!key || !workspace) {
      setError("Claude API 키와 워크스페이스 ID를 먼저 입력해 주세요.");
      return;
    }
    if (!shot) {
      setError("보유 화면 이미지를 넣어 주세요.");
      return;
    }
    try {
      setBusy("캡처 이미지에서 종목을 읽는 중");
      const result = await extractHoldingImage(key, workspace, shot);
      if (!result.ok) throw new Error(result.message);
      if (result.workspaceId) rememberBrowserClaudeWorkspace(result.workspaceId);
      setBusy("종목 코드와 맞추는 중");
      setRows(await matchRows(result.holdings, held));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "가져오지 못했습니다.");
    } finally {
      setBusy(null);
    }
  }

  async function confirmSave() {
    if (!rows) return;
    setError(null);
    setBusy("저장하는 중");
    const result = await saveChosenHoldings(rows, held);
    setBusy(null);
    if (!result.ok) {
      setError(result.message);
      return;
    }
    onSaved(result.message);
  }

  return (
    <dialog
      ref={dialogRef}
      aria-labelledby="brave-import-title"
      className="fixed inset-auto top-1/2 left-1/2 m-0 max-h-[88dvh] w-[min(100%-2rem,32rem)] -translate-x-1/2 -translate-y-1/2 overflow-y-auto rounded-[22px] border-0 bg-white p-5 text-[#191f28] shadow-[0_16px_48px_rgba(25,31,40,0.18)] backdrop:bg-[#191f28]/40"
      onClick={(event) => {
        if (event.target === event.currentTarget) close();
      }}
      onPaste={onPasteImage}
      onClose={close}
    >
      <div className="flex items-start justify-between gap-3">
        <h2 id="brave-import-title" className="text-[17px] font-bold text-[#191f28]">
          보유 종목 가져오기
        </h2>
        <button type="button" className="shrink-0 text-[14px] font-semibold text-[#4e5968]" onClick={close}>
          닫기
        </button>
      </div>
      <p className="mt-2 text-[13px] leading-5 text-[#4e5968]">
        증권사 보유 화면을 캡처해 아래에 붙여 넣거나 파일을 고릅니다. 종목 표에서 종목명, 수량, 1주 평균금액, 현재가를 포함된 이미지를 캡쳐해서 Claude로 보냅니다. 캡쳐화면은 서버에 저장하지 않습니다. Claude API 키는 이 브라우저에만 두고, 에그발란스 서버에는 저장하지 않습니다.
      </p>

      {!rows ? (
        <div className="mt-4">
          <div className="grid gap-1.5">
            <span className="text-[13px] font-medium text-[#8b95a1]">보유 화면 이미지</span>
            {shot ? (
              <div className="overflow-hidden rounded-2xl bg-[#f2f4f6]">
                <img src={shot.preview} alt="가져온 보유 화면" className="max-h-52 w-full object-contain" />
                <div className="flex justify-end px-3 py-2">
                  <button type="button" className="text-[13px] font-semibold text-[#f04452]" onClick={() => replaceShot(null)} disabled={Boolean(busy)}>
                    이미지 지우기
                  </button>
                </div>
              </div>
            ) : (
              <label className="flex min-h-40 cursor-pointer flex-col items-center justify-center gap-2 rounded-2xl bg-[#f2f4f6] px-4 py-6 text-center">
                <span className="text-[14px] font-semibold text-[#191f28]">캡처한 화면을 붙여 넣거나 파일을 고르세요</span>
                <span className="text-[12px] leading-5 text-[#8b95a1]">종목명, 수량, 1주 평균금액, 현재가가 보이게 잘라 주세요.</span>
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
          <button
            type="button"
            disabled={Boolean(busy) || !shot}
            onClick={runImport}
            className="mt-3 h-12 w-full rounded-2xl bg-[#3182f6] text-[15px] font-bold text-white disabled:opacity-60"
          >
            {busy || "가져오기"}
          </button>
        </div>
      ) : null}

      {rows ? (
        <HoldingImportRows
          rows={rows}
          held={held}
          busy={busy}
          onUpdate={(index, patch) => setRows((current) => (current ? applyRowPatch(current, held, index, patch) : current))}
          onClose={close}
          onConfirm={confirmSave}
        />
      ) : null}

      {error ? (
        <p role="alert" className="mt-3 text-[13px] font-medium leading-5 text-[#f04452]">
          {error}
        </p>
      ) : null}
    </dialog>
  );
}
