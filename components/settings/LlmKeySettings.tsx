"use client";

import { useEffect, useState } from "react";
import {
  readBrowserClaudeCredential,
  rememberBrowserClaude,
  rememberBrowserClaudeWorkspace,
  subscribeBrowserClaudeKey,
} from "@/lib/claude-browser-key";

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

function maskedKey(apiKey: string): string {
  return "*".repeat(Math.max(apiKey.length, 8));
}

export function LlmKeySettings() {
  const [open, setOpen] = useState(false);
  const [storedKey, setStoredKey] = useState("");
  const [workspaceId, setWorkspaceId] = useState("");
  const [replacingKey, setReplacingKey] = useState(false);
  const [nextKey, setNextKey] = useState("");
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    function load() {
      const stored = readBrowserClaudeCredential();
      setStoredKey(stored?.apiKey ?? "");
      setWorkspaceId(stored?.workspaceId ?? "");
    }
    load();
    return subscribeBrowserClaudeKey(load);
  }, []);

  function save() {
    setNotice(null);
    setError(null);
    const workspace = workspaceId.trim();
    if (!workspace) {
      setError("워크스페이스 ID를 입력해 주세요.");
      return;
    }
    const key = replacingKey || !storedKey ? nextKey.trim() : storedKey;
    if (!key) {
      setError("Claude API 키를 입력해 주세요.");
      return;
    }
    if (replacingKey || !storedKey) rememberBrowserClaude(key, workspace);
    else rememberBrowserClaudeWorkspace(workspace);
    setStoredKey(key);
    setWorkspaceId(workspace);
    setNextKey("");
    setReplacingKey(false);
    setNotice("이 브라우저에 저장했습니다.");
  }

  const hasKey = storedKey.length > 0;

  return (
    <section className="rounded-[22px] bg-white px-5">
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen((current) => !current)}
        className="flex w-full items-center gap-2 py-5 text-left"
      >
        <span className="min-w-0 flex-1 text-[17px] font-bold text-[#191f28]">자문 모델</span>
        <span className="shrink-0 text-[13px] font-medium text-[#8b95a1]">{hasKey ? "1개" : "0개"}</span>
        <ChevronIcon open={open} />
      </button>
      {open ? (
        <div className="pb-5">
          <p className="text-[13px] leading-5 text-[#6b7684]">
            오늘 자문은 이 브라우저의 Claude 키로만 받습니다. API 키는 별표로만 보이고, 워크스페이스 ID는 여기서 확인하고 바꿀 수
            있습니다. 키와 ID는 에그발란스 서버에 저장하지 않습니다.
          </p>
          <div className="mt-4 border-t border-[#f2f4f6] pt-4">
            <p className="text-[16px] font-semibold text-[#191f28]">Claude</p>
            <p className="mt-0.5 text-[12px] leading-5 text-[#8b95a1]">console.anthropic.com에서 발급한 키와 워크스페이스 ID</p>
            {hasKey && !replacingKey ? (
              <div className="mt-3">
                <p className="text-[13px] font-medium text-[#8b95a1]">Claude API 키</p>
                <p className="mt-1.5 break-all rounded-xl bg-[#f2f4f6] px-4 py-3 font-mono text-[13px] leading-5 tracking-wider text-[#191f28]">
                  {maskedKey(storedKey)}
                </p>
                <button type="button" onClick={() => setReplacingKey(true)} className="mt-2 text-[13px] font-semibold text-[#3182f6]">
                  키 바꾸기
                </button>
              </div>
            ) : (
              <label className="mt-3 grid gap-1.5">
                <span className="text-[13px] font-medium text-[#8b95a1]">Claude API 키</span>
                <input
                  type="password"
                  autoComplete="off"
                  spellCheck={false}
                  value={nextKey}
                  onChange={(event) => setNextKey(event.target.value)}
                  placeholder="API 키"
                  className="h-12 w-full rounded-2xl bg-[#f2f4f6] px-4 font-mono text-[14px] text-[#191f28] outline-none ring-[#3182f6] focus:ring-2"
                />
              </label>
            )}
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
            <p className="mt-1.5 text-[12px] leading-5 text-[#8b95a1]">platform.claude.com/settings/workspaces 의 ID 열입니다.</p>
            {error ? (
              <p role="alert" className="mt-2 text-[13px] font-medium text-[#f04452]">
                {error}
              </p>
            ) : null}
            {notice ? <p className="mt-2 text-[13px] font-medium text-[#3182f6]">{notice}</p> : null}
            <button
              type="button"
              onClick={save}
              className="mt-3 h-12 w-full rounded-2xl bg-[#3182f6] text-[15px] font-bold text-white"
            >
              저장
            </button>
          </div>
        </div>
      ) : null}
    </section>
  );
}
