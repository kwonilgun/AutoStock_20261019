"use client";

import { useEffect, useRef, useState } from "react";
import { useFormStatus } from "react-dom";
import { signOut } from "@/lib/server/auth-actions";

export function SignOutButton({ className }: { className: string }) {
  const [open, setOpen] = useState(false);
  const dialogRef = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  return (
    <>
      <button type="button" className={className} onClick={() => setOpen(true)}>
        로그아웃
      </button>
      <dialog
        ref={dialogRef}
        aria-labelledby="sign-out-title"
        className="fixed inset-auto top-1/2 left-1/2 m-0 w-[min(100%-2rem,22rem)] -translate-x-1/2 -translate-y-1/2 rounded-[22px] border-0 bg-white p-5 text-[#191f28] shadow-[0_16px_48px_rgba(25,31,40,0.18)] backdrop:bg-[#191f28]/40"
        onClick={(event) => {
          if (event.target === event.currentTarget) setOpen(false);
        }}
        onClose={() => setOpen(false)}
      >
        <h2 id="sign-out-title" className="text-[17px] font-bold text-[#191f28]">
          로그아웃할까요?
        </h2>
        <p className="mt-2 text-[14px] leading-6 text-[#4e5968]">
          이 기기에서 로그아웃합니다. 자산 데이터는 계정에 남아 있습니다.
        </p>
        <form action={signOut}>
          <div className="mt-5 grid grid-cols-2 gap-2">
            <button
              type="button"
              className="h-12 rounded-2xl bg-[#f2f4f6] text-[15px] font-bold text-[#4e5968]"
              onClick={() => setOpen(false)}
            >
              취소
            </button>
            <SignOutConfirmButton />
          </div>
        </form>
      </dialog>
    </>
  );
}

function SignOutConfirmButton() {
  const { pending } = useFormStatus();

  return (
    <button
      type="submit"
      disabled={pending}
      className="h-12 rounded-2xl bg-[#3182f6] text-[15px] font-bold text-white disabled:opacity-60"
    >
      {pending ? "로그아웃 중" : "로그아웃"}
    </button>
  );
}
