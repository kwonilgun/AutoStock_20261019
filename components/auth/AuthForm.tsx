"use client";

import { useEffect, useRef, useState } from "react";
import { useActionState } from "react";
import { LOGIN_SPLASH_KEY } from "@/components/layout/SplashScreen";
import type { AuthState } from "@/lib/server/auth-actions";

export function AuthForm({
  mode,
  action,
  reset = false,
}: {
  mode: "login" | "signup";
  action: (prev: AuthState, formData: FormData) => Promise<AuthState>;
  /** 로그인 화면은 항상 비운다. 브라우저에 저장된 아이디·비밀번호가 다시 채워지지 않게 한다. */
  reset?: boolean;
}) {
  const [state, formAction, pending] = useActionState(action, null);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const blockAutofill = mode === "login" || reset;
  const [emailLocked, setEmailLocked] = useState(blockAutofill);
  const [passwordLocked, setPasswordLocked] = useState(blockAutofill);
  const emailLockedRef = useRef(blockAutofill);
  const passwordLockedRef = useRef(blockAutofill);
  const formRef = useRef<HTMLFormElement>(null);
  const submitLabel = mode === "login" ? "로그인" : "가입하고 시작";

  useEffect(() => {
    if (mode !== "login" || !state?.message) return;
    sessionStorage.removeItem(LOGIN_SPLASH_KEY);
  }, [mode, state]);

  useEffect(() => {
    if (!blockAutofill) return;
    const clear = () => {
      const form = formRef.current;
      if (!form) return;
      if (emailLockedRef.current) {
        const input = form.querySelector<HTMLInputElement>('input[name="email"]');
        if (input && input.value !== "") input.value = "";
        setEmail("");
      }
      if (passwordLockedRef.current) {
        const input = form.querySelector<HTMLInputElement>('input[name="password"]');
        if (input && input.value !== "") input.value = "";
        setPassword("");
      }
    };
    clear();
    const interval = window.setInterval(clear, 200);
    return () => window.clearInterval(interval);
  }, [blockAutofill]);

  function unlock(field: "email" | "password", event: { currentTarget: HTMLInputElement }) {
    event.currentTarget.readOnly = false;
    if (field === "email") {
      emailLockedRef.current = false;
      setEmailLocked(false);
      return;
    }
    passwordLockedRef.current = false;
    setPasswordLocked(false);
  }

  return (
    <form
      ref={formRef}
      action={formAction}
      className="relative mt-6 grid gap-3"
      autoComplete={blockAutofill ? "off" : undefined}
      onSubmit={() => {
        if (mode === "login") sessionStorage.setItem(LOGIN_SPLASH_KEY, "1");
      }}
    >
      {blockAutofill ? (
        <div aria-hidden="true" className="pointer-events-none absolute h-0 w-0 overflow-hidden opacity-0">
          <input type="text" tabIndex={-1} autoComplete="username" defaultValue="" />
          <input type="password" tabIndex={-1} autoComplete="current-password" defaultValue="" />
        </div>
      ) : null}
      <label className="grid gap-1 text-sm">
        <span className="text-[#6d675d]">{mode === "login" ? "이메일 또는 관리자 ID" : "이메일"}</span>
        <input
          name="email"
          type={mode === "login" ? "text" : "email"}
          autoComplete={blockAutofill ? "off" : "email"}
          autoCapitalize="none"
          autoCorrect="off"
          spellCheck={false}
          required
          readOnly={emailLocked}
          value={blockAutofill ? email : undefined}
          onChange={blockAutofill ? (event) => setEmail(event.target.value) : undefined}
          onPointerDown={blockAutofill ? (event) => unlock("email", event) : undefined}
          onFocus={blockAutofill ? (event) => unlock("email", event) : undefined}
          suppressHydrationWarning
          className="rounded-xl border border-[#e4dccb] bg-white px-3 py-2"
        />
      </label>
      <label className="grid gap-1 text-sm">
        <span className="text-[#6d675d]">비밀번호</span>
        <input
          name="password"
          type="password"
          autoComplete="new-password"
          required
          minLength={mode === "signup" ? 4 : undefined}
          readOnly={passwordLocked}
          value={blockAutofill ? password : undefined}
          onChange={blockAutofill ? (event) => setPassword(event.target.value) : undefined}
          onPointerDown={blockAutofill ? (event) => unlock("password", event) : undefined}
          onFocus={blockAutofill ? (event) => unlock("password", event) : undefined}
          suppressHydrationWarning
          className="rounded-xl border border-[#e4dccb] bg-white px-3 py-2"
        />
      </label>
      {mode === "signup" ? <p className="text-xs text-[#6d675d]">비밀번호는 4자 이상입니다.</p> : null}
      {state?.message ? (
        <p role="alert" className="text-sm text-[#8a3b2b]">
          {state.message}
        </p>
      ) : null}
      <button type="submit" disabled={pending} className="mt-1 rounded-xl bg-[#1c1915] px-3 py-2.5 text-sm text-white">
        {pending ? "처리 중" : submitLabel}
      </button>
    </form>
  );
}
