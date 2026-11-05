"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

export function SettingsButton() {
  const pathname = usePathname();
  const active = pathname === "/settings" || pathname.startsWith("/settings/");

  return (
    <Link
      href="/settings"
      aria-label="설정"
      aria-current={active ? "page" : undefined}
      className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full ${
        active ? "bg-[#3182f6] text-white" : "bg-white text-[#4e5968]"
      }`}
    >
      <svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
        <path
          fillRule="evenodd"
          d="M10.3 2.6a1.6 1.6 0 0 1 3.1 0l.3 1.7a7.4 7.4 0 0 1 1.7.7l1.6-.8a1.6 1.6 0 0 1 2.2 2.2l-.8 1.6c.3.5.5 1.1.7 1.7l1.7.3a1.6 1.6 0 0 1 0 3.1l-1.7.3a7.4 7.4 0 0 1-.7 1.7l.8 1.6a1.6 1.6 0 0 1-2.2 2.2l-1.6-.8a7.4 7.4 0 0 1-1.7.7l-.3 1.7a1.6 1.6 0 0 1-3.1 0l-.3-1.7a7.4 7.4 0 0 1-1.7-.7l-1.6.8a1.6 1.6 0 0 1-2.2-2.2l.8-1.6a7.4 7.4 0 0 1-.7-1.7l-1.7-.3a1.6 1.6 0 0 1 0-3.1l1.7-.3c.2-.6.4-1.2.7-1.7l-.8-1.6a1.6 1.6 0 0 1 2.2-2.2l1.6.8c.5-.3 1.1-.5 1.7-.7l.3-1.7ZM12 15.2a3.2 3.2 0 1 0 0-6.4 3.2 3.2 0 0 0 0 6.4Z"
          clipRule="evenodd"
        />
      </svg>
    </Link>
  );
}
