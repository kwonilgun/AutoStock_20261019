"use client";

import { useActionState } from "react";
import { changePassword } from "@/lib/server/auth-actions";

const FIELDS = [
  { name: "current", label: "지금 비밀번호", autoComplete: "current-password" },
  { name: "next", label: "새 비밀번호 (4자 이상)", autoComplete: "new-password" },
  { name: "confirm", label: "새 비밀번호 확인", autoComplete: "new-password" },
] as const;

export function PasswordForm() {
  const [state, formAction, pending] = useActionState(changePassword, null);

  return (
    <form action={formAction} className="mt-6 grid gap-3">
      {FIELDS.map((field) => (
        <label key={field.name} className="grid gap-1 text-sm">
          <span className="text-[#6d675d]">{field.label}</span>
          <input
            name={field.name}
            type="password"
            autoComplete={field.autoComplete}
            required
            minLength={field.name === "current" ? undefined : 4}
            suppressHydrationWarning
            className="rounded-xl border border-[#e4dccb] bg-white px-3 py-2"
          />
        </label>
      ))}
      {state?.message ? (
        <p role="alert" className={`text-sm ${state.ok ? "text-[#3182f6]" : "text-[#8a3b2b]"}`}>
          {state.message}
        </p>
      ) : null}
      <button type="submit" disabled={pending} className="mt-1 rounded-xl bg-[#1c1915] px-3 py-2.5 text-sm text-white">
        {pending ? "처리 중" : "비밀번호 변경"}
      </button>
    </form>
  );
}
