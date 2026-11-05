"use client";

import Link, { useLinkStatus } from "next/link";
import { usePathname, useRouter } from "next/navigation";
import type { ReactNode } from "react";

const LIVE_QUOTES = new Set(["/portfolio", "/gap", "/performance"]);

const LINKS = [
  { href: "/", label: "홈", icon: HomeIcon },
  { href: "/portfolio", label: "자산", icon: WalletIcon },
  { href: "/income", label: "수익", icon: IncomeIcon },
  { href: "/gap", label: "괴리", icon: ScaleIcon },
  { href: "/performance", label: "성과", icon: ChartIcon },
];

export function Nav() {
  const pathname = usePathname();
  const router = useRouter();

  return (
    <nav className="fixed bottom-0 left-1/2 z-20 w-full max-w-lg -translate-x-1/2 border-t border-[#e5e8eb] bg-white">
      <div className="grid grid-cols-5 pb-[max(0.35rem,env(safe-area-inset-bottom))]">
        {LINKS.map((link) => {
          const active = pathname === link.href;
          const Icon = link.icon;
          return (
            <Link
              key={link.href}
              href={link.href}
              prefetch={false}
              onClick={(event) => {
                if (!LIVE_QUOTES.has(link.href) || pathname !== link.href) return;
                event.preventDefault();
                router.refresh();
              }}
              className="flex min-h-14 flex-col items-center justify-center gap-0.5 text-[11px] font-medium"
            >
              <TabFace active={active} label={link.label} icon={Icon} />
            </Link>
          );
        })}
      </div>
    </nav>
  );
}

function TabFace({
  active,
  label,
  icon: Icon,
}: {
  active: boolean;
  label: string;
  icon: (props: { active: boolean }) => ReactNode;
}) {
  const { pending } = useLinkStatus();
  const on = active || pending;
  return (
    <span className={`flex flex-col items-center gap-0.5 ${on ? "text-[#3182f6]" : "text-[#8b95a1]"}`}>
      <Icon active={on} />
      {label}
    </span>
  );
}

function HomeIcon({ active }: { active: boolean }) {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M4 10.5 12 4l8 6.5V20a1 1 0 0 1-1 1h-5.2v-5.2h-3.6V21H5a1 1 0 0 1-1-1v-9.5Z"
        stroke="currentColor"
        strokeWidth={active ? 2 : 1.6}
        strokeLinejoin="round"
      />
    </svg>
  );
}

function WalletIcon({ active }: { active: boolean }) {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" aria-hidden>
      <rect x="3" y="6.5" width="18" height="13" rx="2.5" stroke="currentColor" strokeWidth={active ? 2 : 1.6} />
      <path d="M3 10h18" stroke="currentColor" strokeWidth={active ? 2 : 1.6} />
      <circle cx="16.5" cy="14.5" r="1" fill="currentColor" />
    </svg>
  );
}

function IncomeIcon({ active }: { active: boolean }) {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" aria-hidden>
      <circle cx="12" cy="12" r="8" stroke="currentColor" strokeWidth={active ? 2 : 1.6} />
      <path
        d="M12 16.2V8.4M8.8 11.2 12 8.2l3.2 3"
        stroke="currentColor"
        strokeWidth={active ? 2 : 1.6}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function ScaleIcon({ active }: { active: boolean }) {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path d="M12 4v16M5 8h14" stroke="currentColor" strokeWidth={active ? 2 : 1.6} strokeLinecap="round" />
      <path d="M7.5 8 4.5 14a3 3 0 0 0 6 0L7.5 8Zm9 0L13.5 14a3 3 0 0 0 6 0L16.5 8Z" stroke="currentColor" strokeWidth={active ? 2 : 1.6} strokeLinejoin="round" />
    </svg>
  );
}

function ChartIcon({ active }: { active: boolean }) {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path d="M4 17.5 9.2 12l3.1 3.1L20 7.5" stroke="currentColor" strokeWidth={active ? 2 : 1.6} strokeLinecap="round" strokeLinejoin="round" />
      <path d="M14.5 7.5H20V13" stroke="currentColor" strokeWidth={active ? 2 : 1.6} strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
