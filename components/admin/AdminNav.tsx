"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const LINKS = [
  { href: "/admin", label: "국면·비중" },
  { href: "/admin/recommend", label: "추천 종목" },
  { href: "/admin/report", label: "분석 리포트" },
  { href: "/admin/users", label: "사용자" },
];

export function AdminNav() {
  const pathname = usePathname();
  return (
    <nav className="grid grid-cols-4 gap-1">
      {LINKS.map((link) => {
        const active = pathname === link.href;
        return (
          <Link
            key={link.href}
            href={link.href}
            className={`rounded-full px-1 py-2 text-center text-[12px] font-semibold leading-tight ${
              active ? "bg-[#3182f6] text-white" : "bg-white text-[#4e5968]"
            }`}
          >
            {link.label}
          </Link>
        );
      })}
    </nav>
  );
}
