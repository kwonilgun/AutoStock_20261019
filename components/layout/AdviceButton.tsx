"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";

const RETURN_KEY = "advice-return";

function appPath(path: string | null): string | null {
  if (!path || !path.startsWith("/") || path.startsWith("//") || path === "/advice") return null;
  return path;
}

export function AdviceButton() {
  const pathname = usePathname();
  const active = pathname === "/advice";
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

  return (
    <Link
      href={active ? returnTo : "/advice"}
      aria-current={active ? "page" : undefined}
      className={`flex h-10 shrink-0 items-center rounded-full px-3.5 text-[13px] font-semibold ${
        active ? "bg-[#3182f6] text-white" : "bg-white text-[#4e5968]"
      }`}
    >
      오늘 자문
    </Link>
  );
}
