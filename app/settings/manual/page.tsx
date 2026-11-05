import Link from "next/link";
import { ViewFrame } from "@/components/frame/ViewFrame";
import { UserManual } from "@/components/settings/UserManual";

export default function ManualPage() {
  return (
    <ViewFrame>
      {() => (
        <div className="mx-auto flex w-full max-w-lg flex-col gap-3">
          <div className="px-1 pt-1">
            <Link href="/settings" className="inline-flex items-center gap-1 text-[14px] font-semibold text-[#3182f6]">
              <BackIcon />
              설정
            </Link>
            <h1 className="mt-1 text-[22px] font-bold tracking-tight text-[#191f28]">사용자 매뉴얼</h1>
          </div>
          <UserManual />
        </div>
      )}
    </ViewFrame>
  );
}

function BackIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path d="M15 6 8.5 12 15 18" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
