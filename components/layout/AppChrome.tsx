"use client";

import { usePathname } from "next/navigation";
import { LiveMarksTicker } from "@/components/layout/LiveMarksTicker";
import { Nav } from "@/components/layout/Nav";
import { SettingsButton } from "@/components/layout/SettingsButton";
import { signOut } from "@/lib/server/auth-actions";

function isBare(pathname: string) {
  return pathname === "/login" || pathname === "/signup" || pathname.startsWith("/admin");
}

export function AppChrome({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  if (isBare(pathname)) return children;

  return (
    <div className="min-h-screen bg-[#f2f4f6]">
      <header className="sticky top-0 z-10 bg-[#f2f4f6]">
        <div className="mx-auto flex max-w-lg items-center justify-between gap-3 px-5 pt-[max(0.75rem,env(safe-area-inset-top))] pb-2">
          <p className="text-[20px] font-bold tracking-tight text-[#191f28]">에그밸런스</p>
          <div className="flex shrink-0 items-center gap-1.5">
            <form action={signOut}>
              <button
                type="submit"
                className="flex h-10 items-center rounded-full bg-white px-3.5 text-[13px] font-semibold text-[#4e5968]"
              >
                로그아웃
              </button>
            </form>
            <SettingsButton />
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
