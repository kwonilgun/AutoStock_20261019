import Link from "next/link";
import { redirect } from "next/navigation";
import { AdminNav } from "@/components/admin/AdminNav";
import { signOut } from "@/lib/server/auth-actions";
import { getCurrentUser } from "@/lib/server/session";

export async function requireAdminPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (user.role !== "admin") redirect("/");
  if (user.mustChangePassword) redirect("/admin/password");
  return user;
}

export function formatUpdatedAt(date: Date | null): string {
  return date
    ? new Intl.DateTimeFormat("ko-KR", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Seoul" }).format(date)
    : "아직 저장 기록 없음";
}

export function AdminShell({ subtitle, children }: { subtitle: string; children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-[#f2f4f6]">
      <header className="sticky top-0 z-10 bg-[#f2f4f6]/95 backdrop-blur">
        <div className="mx-auto flex max-w-lg items-center justify-between gap-3 px-5 pt-[max(0.75rem,env(safe-area-inset-top))] pb-2">
          <div className="min-w-0">
            <p className="text-[20px] font-bold tracking-tight text-[#191f28]">에그밸런스 관리자</p>
            <p className="truncate text-[13px] text-[#8b95a1]">{subtitle}</p>
          </div>
          <div className="flex shrink-0 gap-1.5">
            <Link href="/admin/password" className="rounded-full bg-white px-3.5 py-2 text-[13px] font-semibold text-[#4e5968]">
              비밀번호
            </Link>
            <form action={signOut}>
              <button type="submit" className="rounded-full bg-white px-3.5 py-2 text-[13px] font-semibold text-[#4e5968]">
                로그아웃
              </button>
            </form>
          </div>
        </div>
        <div className="mx-auto max-w-lg px-4 pb-3">
          <AdminNav />
        </div>
      </header>
      <main className="mx-auto flex w-full max-w-lg flex-col gap-3 px-4 pt-1 pb-10">{children}</main>
    </div>
  );
}
