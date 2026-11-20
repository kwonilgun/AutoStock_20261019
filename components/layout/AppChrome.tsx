"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";
import type { AdviceChromeState } from "@/lib/advice-model";
import { readBrowserClaudeCredential, subscribeBrowserClaudeKey, syncBrowserClaudeCookie } from "@/lib/claude-browser-key";
import { AdviceBackButton, AdviceButton } from "@/components/layout/AdviceButton";
import { LiveMarksTicker } from "@/components/layout/LiveMarksTicker";
import { Nav } from "@/components/layout/Nav";
import { SettingsButton } from "@/components/layout/SettingsButton";
import { signOut } from "@/lib/server/auth-actions";

function isBare(pathname: string) {
  return pathname === "/login" || pathname === "/signup" || pathname.startsWith("/admin");
}

export function AppChrome({ children, advice }: { children: React.ReactNode; advice: AdviceChromeState }) {
  const pathname = usePathname();

  useEffect(() => {
    function sync() {
      syncBrowserClaudeCookie(Boolean(readBrowserClaudeCredential()));
    }
    sync();
    return subscribeBrowserClaudeKey(sync);
  }, [pathname, advice.browserClaude]);

  if (isBare(pathname)) return children;

  return (
    <div className="min-h-screen bg-[#f2f4f6]">
      <header className="sticky top-0 z-10 bg-[#f2f4f6]">
        <div className="mx-auto flex max-w-lg items-center justify-between gap-3 px-5 pt-[max(0.75rem,env(safe-area-inset-top))] pb-2">
          <div className="flex min-w-0 flex-wrap items-center gap-2">
            <p className="text-[20px] font-bold tracking-tight text-[#191f28]">에그발란스</p>
            <AdviceButton />
            <span className="text-[12px] font-semibold text-[#4e5968]">Claude</span>
          </div>
          <div className="flex shrink-0 items-start gap-1.5">
            {pathname === "/advice" ? (
              <AdviceBackButton />
            ) : (
              <>
                <form action={signOut}>
                  <button
                    type="submit"
                    className="flex h-10 items-center justify-center rounded-full bg-white px-3.5 text-[13px] font-semibold text-[#4e5968]"
                  >
                    로그아웃
                  </button>
                </form>
                <SettingsButton />
              </>
            )}
          </div>
        </div>
      </header>
      <main className="mx-auto w-full max-w-lg px-4 pt-1 pb-4">{children}</main>
      <footer className="mx-auto max-w-lg px-5 pb-[calc(5.75rem+env(safe-area-inset-bottom))] text-[12px] leading-5 text-[#8b95a1]">
        국면과 목표 비중은 관리자가 지정합니다. 매매 결정은 직접 확인한 뒤 진행해 주세요.
      </footer>
      <LiveMarksTicker />
      <Nav />
    </div>
  );
}
