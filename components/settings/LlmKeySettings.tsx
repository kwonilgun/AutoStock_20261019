"use client";

import { useActionState, useEffect, useState } from "react";
import { MEMBER_PROVIDERS, MEMBER_PROVIDER_META, type LlmKeyMask, type MemberProvider } from "@/lib/advice-model";
import { deleteMemberLlmKey, saveMemberLlmKey } from "@/lib/server/llm-key-actions";

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

export function LlmKeySettings({ keys }: { keys: LlmKeyMask[] }) {
  const [open, setOpen] = useState(false);

  return (
    <section className="rounded-[22px] bg-white px-5">
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen((current) => !current)}
        className="flex w-full items-center gap-2 py-5 text-left"
      >
        <span className="min-w-0 flex-1 text-[17px] font-bold text-[#191f28]">자문 모델</span>
        <span className="shrink-0 text-[13px] font-medium text-[#8b95a1]">{keys.length}개</span>
        <ChevronIcon open={open} />
      </button>
      {open ? (
        <div className="pb-5">
          <p className="text-[13px] leading-5 text-[#6b7684]">
            내 API 키로 오늘 자문을 받을 수 있습니다. 키를 넣지 않으면 Qwen을 사용합니다. 자산의 자동 추가에 Claude 키를 저장해 두면
            오늘 자문은 그 키를 사용합니다. 저장한 키는 이 설정 화면에서 다시 볼 수 있습니다.
          </p>
          <div className="mt-4 flex flex-col gap-4">
            {MEMBER_PROVIDERS.map((provider) => (
              <KeyRow key={provider} provider={provider} saved={keys.find((key) => key.provider === provider) ?? null} />
            ))}
          </div>
        </div>
      ) : null}
    </section>
  );
}

function KeyRow({ provider, saved }: { provider: MemberProvider; saved: LlmKeyMask | null }) {
  const meta = MEMBER_PROVIDER_META[provider];
  const [editing, setEditing] = useState(!saved);
  const [state, formAction, pending] = useActionState(saveMemberLlmKey, null);

  useEffect(() => {
    if (state?.ok) setEditing(false);
  }, [state]);

  useEffect(() => {
    if (!saved) setEditing(true);
  }, [saved]);

  return (
    <div className="border-t border-[#f2f4f6] pt-4 first:border-t-0 first:pt-0">
      <div className="flex items-center justify-between gap-3">
        <p className="text-[16px] font-semibold text-[#191f28]">{meta.label}</p>
        {saved ? (
          <form action={deleteMemberLlmKey}>
            <input type="hidden" name="provider" value={provider} />
            <button type="submit" className="text-[13px] font-semibold text-[#f04452]">
              지우기
            </button>
          </form>
        ) : null}
      </div>
      <p className="mt-0.5 text-[12px] leading-5 text-[#8b95a1]">{meta.hint}</p>
      {saved && !editing ? (
        <div className="mt-2">
          {saved.secret ? (
            <p className="break-all rounded-xl bg-[#f2f4f6] px-4 py-3 font-mono text-[13px] leading-5 text-[#191f28]">{saved.secret}</p>
          ) : (
            <p className="text-[14px] text-[#f04452]">저장한 키를 읽지 못했습니다. 다시 입력해 주세요.</p>
          )}
          <button type="button" onClick={() => setEditing(true)} className="mt-2 text-[13px] font-semibold text-[#3182f6]">
            바꾸기
          </button>
        </div>
      ) : (
        <form action={formAction} className="mt-2 flex gap-2">
          <input type="hidden" name="provider" value={provider} />
          <input
            name="secret"
            type="text"
            autoComplete="off"
            spellCheck={false}
            required
            placeholder="API 키"
            defaultValue={saved?.secret ?? ""}
            className="min-w-0 flex-1 rounded-xl bg-[#f2f4f6] px-4 py-3 font-mono text-[13px] text-[#191f28] outline-none focus:ring-2 focus:ring-[#3182f6]"
          />
          <button
            type="submit"
            disabled={pending}
            className="shrink-0 rounded-xl bg-[#3182f6] px-4 text-[14px] font-semibold text-white disabled:opacity-60"
          >
            {pending ? "저장 중" : "저장"}
          </button>
        </form>
      )}
      {state && !state.ok ? (
        <p role="alert" className="mt-2 text-[13px] font-medium text-[#f04452]">
          {state.message}
        </p>
      ) : null}
      {state?.ok && !editing ? <p className="mt-2 text-[13px] font-medium text-[#3182f6]">{state.message}</p> : null}
    </div>
  );
}
