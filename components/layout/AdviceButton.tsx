"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState, type MouseEvent } from "react";
import { ClaudeCredentialDialog } from "@/components/claude/ClaudeCredentialDialog";
import { browserClaudeReady } from "@/lib/claude-browser-key";

const RETURN_KEY = "advice-return";

function appPath(path: string | null): string | null {
  if (!path || !path.startsWith("/") || path.startsWith("//") || path === "/advice") return null;
  return path;
}

function useAdviceReturn() {
  const pathname = usePathname();
  const [returnTo, setReturnTo] = useState("/");

  useEffect(() => {
    if (pathname === "/advice") {
      const saved = appPath(sessionStorage.getItem(RETURN_KEY));
      if (saved) setReturnTo(saved);
      return;
    }
    sessionStorage.setItem(RETURN_KEY, pathname);
    setReturnTo(pathname);
  }, [pathname]);

  return { active: pathname === "/advice", returnTo };
}

export function AdviceBackButton() {
  const { returnTo } = useAdviceReturn();

  return (
    <Link
      href={returnTo}
      className="flex h-10 items-center justify-center gap-0.5 rounded-full bg-white px-3.5 text-[13px] font-semibold text-[#4e5968]"
    >
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden>
        <path d="M15 6.5 8.5 12 15 17.5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
      뒤로
    </Link>
  );
}

export function AdviceButton() {
  const router = useRouter();
  const { active, returnTo } = useAdviceReturn();
  const [credentialOpen, setCredentialOpen] = useState(false);

  function onAdviceClick(event: MouseEvent<HTMLAnchorElement>) {
    if (active || browserClaudeReady()) return;
    event.preventDefault();
    setCredentialOpen(true);
  }

  return (
    <>
      <Link
        href={active ? returnTo : "/advice"}
        aria-current={active ? "page" : undefined}
        onClick={onAdviceClick}
        className={`flex h-10 shrink-0 items-center rounded-full px-3.5 text-[13px] font-semibold ${
          active ? "bg-[#3182f6] text-white" : "bg-white text-[#4e5968]"
        }`}
      >
        오늘 자문
      </Link>
      <ClaudeCredentialDialog
        open={credentialOpen}
        onClose={() => setCredentialOpen(false)}
        onSaved={() => {
          setCredentialOpen(false);
          router.push("/advice");
        }}
      />
    </>
  );
}
