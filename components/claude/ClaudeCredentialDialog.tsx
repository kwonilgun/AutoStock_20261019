"use client";

import { useEffect, useRef, useState } from "react";
import {
  forgetBrowserClaude,
  forgetBrowserClaudeWorkspace,
  readBrowserClaudeCredential,
  rememberBrowserClaude,
} from "@/lib/claude-browser-key";

export function ClaudeCredentialDialog({
  open,
  onClose,
  onSaved,
}: {
  open: boolean;
  onClose: () => void;
  onSaved: () => void;
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [hasKey, setHasKey] = useState(false);
  const [storedWorkspace, setStoredWorkspace] = useState("");
  const [apiKey, setApiKey] = useState("");
  const [workspaceId, setWorkspaceId] = useState("");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const stored = readBrowserClaudeCredential();
    setHasKey(Boolean(stored?.apiKey));
    setStoredWorkspace(stored?.workspaceId ?? "");
    setApiKey("");
    setWorkspaceId("");
    setError(null);
  }, [open]);

  function close() {
    setApiKey("");
    setWorkspaceId("");
    setError(null);
    onClose();
  }

  function clearKey() {
    forgetBrowserClaude();
    setHasKey(false);
    setStoredWorkspace("");
    setApiKey("");
    setWorkspaceId("");
    setError(null);
  }

  function clearWorkspace() {
    forgetBrowserClaudeWorkspace();
    setStoredWorkspace("");
    setWorkspaceId("");
    setError(null);
  }

  function save() {
    const stored = readBrowserClaudeCredential();
    const key = hasKey ? (stored?.apiKey ?? "") : apiKey.trim();
    const workspace = storedWorkspace || workspaceId.trim();
    if (!key || !workspace) {
      setError("Claude API 키와 워크스페이스 ID를 입력해 주세요.");
      return;
    }
    rememberBrowserClaude(key, workspace);
    onSaved();
  }

  const canSave = (hasKey || apiKey.trim().length > 0) && (storedWorkspace.length > 0 || workspaceId.trim().length > 0);

  return (
    <dialog
      ref={dialogRef}
      aria-labelledby="claude-credential-title"
      className="fixed inset-auto top-1/2 left-1/2 m-0 max-h-[88dvh] w-[min(100%-2rem,32rem)] -translate-x-1/2 -translate-y-1/2 overflow-y-auto rounded-[22px] border-0 bg-white p-5 text-[#191f28] shadow-[0_16px_48px_rgba(25,31,40,0.18)] backdrop:bg-[#191f28]/40"
      onClick={(event) => {
        if (event.target === event.currentTarget) close();
      }}
      onClose={() => {
        if (!open) return;
        close();
      }}
    >
      <div className="flex items-start justify-between gap-3">
        <h2 id="claude-credential-title" className="text-[17px] font-bold text-[#191f28]">
          Claude 키 입력
        </h2>
        <button type="button" className="shrink-0 text-[14px] font-semibold text-[#4e5968]" onClick={close}>
          닫기
        </button>
      </div>
      <p className="mt-2 text-[13px] leading-5 text-[#4e5968]">
        계속하려면 Claude API 키와 워크스페이스 ID를 입력해 주세요. 키와 ID는 이 브라우저에만 두고, 에그발란스 서버에는 저장하지 않습니다.
      </p>

      {hasKey ? (
        <div className="mt-4 flex items-center justify-between gap-3">
          <p className="text-[14px] font-semibold text-[#191f28]">이 브라우저에 Claude 키가 있습니다.</p>
          <button type="button" className="shrink-0 text-[13px] font-semibold text-[#f04452]" onClick={clearKey}>
            키 지우기
          </button>
        </div>
      ) : (
        <label className="mt-4 grid gap-1.5">
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
          <button type="button" className="shrink-0 text-[13px] font-semibold text-[#f04452]" onClick={clearWorkspace}>
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
            platform.claude.com/settings/workspaces 의 ID 열을 넣습니다.
          </p>
        </>
      )}

      {error ? (
        <p role="alert" className="mt-3 text-[13px] font-medium leading-5 text-[#f04452]">
          {error}
        </p>
      ) : null}

      <button
        type="button"
        disabled={!canSave}
        onClick={save}
        className="mt-4 h-12 w-full rounded-2xl bg-[#3182f6] text-[15px] font-bold text-white disabled:opacity-60"
      >
        저장하고 계속
      </button>
    </dialog>
  );
}
