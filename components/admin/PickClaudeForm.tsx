"use client";

import { useEffect, useState, useTransition } from "react";
import { adminSavePickClaude } from "@/lib/server/admin-actions";

export function PickClaudeForm({
  configured,
  last4,
  workspaceId,
}: {
  configured: boolean;
  last4: string;
  workspaceId: string;
}) {
  const [pending, startTransition] = useTransition();
  const [replacing, setReplacing] = useState(!configured);
  const [apiKey, setApiKey] = useState("");
  const [workspace, setWorkspace] = useState(workspaceId);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);

  useEffect(() => setWorkspace(workspaceId), [workspaceId]);

  function save() {
    setMessage(null);
    startTransition(async () => {
      const result = await adminSavePickClaude(replacing || !configured ? apiKey : "", workspace);
      setMessage({
        ok: result.ok,
        text: result.ok ? (result.message ?? "저장했습니다.") : result.message,
      });
      if (result.ok) {
        setApiKey("");
        setReplacing(false);
      }
    });
  }

  return (
    <section className="rounded-[22px] bg-white px-5 py-5">
      <p className="text-[13px] font-medium text-[#8b95a1]">추천 종목 Claude</p>
      <h2 className="mt-1 text-[17px] font-bold text-[#191f28]">관리자 키</h2>
      <p className="mt-2 text-[13px] leading-5 text-[#8b95a1]">
        추천 종목, 보유 가져오기, 수익 가져오기는 여기에 저장한 키와 워크스페이스로 Claude를 호출합니다. 키는 관리자
        데이터베이스에만 두고 사용자에게 보여 주지 않습니다. 서버가 켜질 때 이 값을 읽어 사용합니다.
      </p>
      {configured && !replacing ? (
        <div className="mt-4">
          <p className="text-[13px] font-medium text-[#8b95a1]">Claude API 키</p>
          <p className="mt-1.5 rounded-xl bg-[#f2f4f6] px-4 py-3 font-mono text-[13px] text-[#191f28]">
            저장됨 · 끝 4자리 {last4 || "없음"}
          </p>
          <button type="button" onClick={() => setReplacing(true)} className="mt-2 text-[13px] font-semibold text-[#3182f6]">
            키 바꾸기
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
            placeholder={configured ? "새 API 키" : "API 키"}
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
          value={workspace}
          onChange={(event) => setWorkspace(event.target.value)}
          placeholder="워크스페이스 ID"
          className="h-12 w-full rounded-2xl bg-[#f2f4f6] px-4 font-mono text-[14px] text-[#191f28] outline-none ring-[#3182f6] focus:ring-2"
        />
      </label>
      <p className="mt-1.5 text-[12px] leading-5 text-[#8b95a1]">platform.claude.com/settings/workspaces 의 ID 열입니다.</p>
      {message ? (
        <p className={`mt-2 text-[13px] font-medium ${message.ok ? "text-[#3182f6]" : "text-[#f04452]"}`}>{message.text}</p>
      ) : null}
      <button
        type="button"
        onClick={save}
        disabled={pending}
        className="mt-3 h-12 w-full rounded-2xl bg-[#3182f6] text-[15px] font-bold text-white disabled:opacity-60"
      >
        {pending ? "저장 중" : "저장"}
      </button>
    </section>
  );
}
