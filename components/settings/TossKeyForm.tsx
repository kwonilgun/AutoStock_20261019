"use client";

import { useState, useTransition } from "react";
import { deleteTossKeys, saveTossKeys } from "@/lib/server/toss-actions";
import type { TossKeyMask } from "@/lib/server/toss-keys";

const fieldClass =
  "h-12 w-full rounded-2xl bg-[#f2f4f6] px-4 text-[16px] font-semibold text-[#191f28] outline-none ring-[#3182f6] placeholder:font-medium placeholder:text-[#b0b8c1] focus:ring-2";

export function TossKeyForm({ saved }: { saved: TossKeyMask | null }) {
  const [mask, setMask] = useState(saved);
  const [clientId, setClientId] = useState("");
  const [clientSecret, setClientSecret] = useState("");
  const [secretEditing, setSecretEditing] = useState(false);
  const [idEditing, setIdEditing] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  const [pending, start] = useTransition();
  const secretMask = mask && clientSecret.length === 0 && !secretEditing ? `····${mask.clientSecretLast4}` : "";
  const idMask = mask && clientId.length === 0 && !idEditing ? `····${mask.clientIdLast4}` : "";

  return (
    <section className="rounded-[22px] bg-white px-5 py-5">
      <p className="text-[13px] font-medium text-[#8b95a1]">토스증권</p>
      <h2 className="mt-1 text-[16px] font-bold text-[#191f28]">Open API 키</h2>
      <p className="mt-1.5 text-[13px] leading-5 text-[#6b7684]">
        이 계정의 자산 화면에만 쓰입니다. 서버에는 암호화해서 저장하고, 저장 뒤에는 끝 네 자리만 보여 줍니다.
      </p>
      {mask ? (
        <p className="mt-3 text-[13px] font-medium text-[#4e5968]">
          Client ID ····{mask.clientIdLast4} · Client Secret ····{mask.clientSecretLast4}
        </p>
      ) : (
        <p className="mt-3 text-[13px] text-[#8b95a1]">아직 저장하지 않았습니다.</p>
      )}
      <form
        className="mt-4 flex flex-col gap-3"
        onSubmit={(event) => {
          event.preventDefault();
          setMessage(null);
          setFailed(false);
          start(async () => {
            if (mask && !clientId.trim() && !clientSecret.trim()) {
              setFailed(false);
              setMessage("저장된 키입니다. 바꾸려면 칸을 눌러 새 값을 입력해 주세요.");
              return;
            }
            const result = await saveTossKeys(clientId, clientSecret);
            setFailed(!result.ok);
            setMessage(result.message);
            if (!result.ok) return;
            setMask(result.saved);
            setClientId("");
            setClientSecret("");
            setSecretEditing(false);
            setIdEditing(false);
          });
        }}
      >
        <label className="flex flex-col gap-1.5">
          <span className="text-[13px] font-semibold text-[#4e5968]">Client ID</span>
          <input
            name="clientId"
            autoComplete="off"
            spellCheck={false}
            readOnly={Boolean(idMask)}
            value={idMask || clientId}
            onFocus={() => setIdEditing(true)}
            onBlur={() => setIdEditing(false)}
            onChange={(event) => setClientId(event.target.value)}
            className={fieldClass}
          />
        </label>
        <label className="flex flex-col gap-1.5">
          <span className="text-[13px] font-semibold text-[#4e5968]">Client Secret</span>
          <input
            name="clientSecret"
            type={secretMask ? "text" : "password"}
            autoComplete="off"
            spellCheck={false}
            readOnly={Boolean(secretMask)}
            value={secretMask || clientSecret}
            onFocus={() => setSecretEditing(true)}
            onBlur={() => setSecretEditing(false)}
            onChange={(event) => setClientSecret(event.target.value)}
            className={fieldClass}
          />
        </label>
        <div className="flex items-center gap-2">
          <button
            type="submit"
            disabled={pending}
            className="inline-flex h-11 items-center rounded-xl bg-[#3182f6] px-4 text-[15px] font-semibold text-white disabled:opacity-50"
          >
            저장
          </button>
          {mask ? (
            <button
              type="button"
              disabled={pending}
              onClick={() => {
                setMessage(null);
                setFailed(false);
                start(async () => {
                  const result = await deleteTossKeys();
                  setFailed(!result.ok);
                  setMessage(result.message);
                  if (result.ok) setMask(null);
                });
              }}
              className="inline-flex h-11 items-center rounded-xl bg-[#f2f4f6] px-4 text-[15px] font-semibold text-[#f04452] disabled:opacity-50"
            >
              삭제
            </button>
          ) : null}
        </div>
      </form>
      {message ? <p className={`mt-3 text-[13px] font-medium ${failed ? "text-[#f04452]" : "text-[#3182f6]"}`}>{message}</p> : null}
    </section>
  );
}
