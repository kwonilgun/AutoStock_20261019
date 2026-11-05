import Link from "next/link";
import { redirect } from "next/navigation";
import { PasswordForm } from "@/components/admin/PasswordForm";
import { signOut } from "@/lib/server/auth-actions";
import { getCurrentUser } from "@/lib/server/session";

export default async function AdminPasswordPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (user.role !== "admin") redirect("/");

  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center px-6 py-16">
      <p className="text-sm text-[#6d675d]">에그밸런스 관리자</p>
      <h1 className="mt-1 text-2xl font-semibold">비밀번호 변경</h1>
      <p className="mt-2 text-sm leading-6 text-[#5c564c]">
        {user.mustChangePassword
          ? "임시 비밀번호로 로그인했습니다. 관리자 기능을 쓰려면 먼저 새 비밀번호로 바꿔 주세요."
          : "새 비밀번호는 4자 이상이어야 합니다."}
      </p>
      <PasswordForm />
      <div className="mt-4 flex items-center justify-between text-sm text-[#5c564c]">
        {user.mustChangePassword ? (
          <span />
        ) : (
          <Link href="/admin" className="underline">
            관리자 화면으로
          </Link>
        )}
        <form action={signOut}>
          <button type="submit" className="underline">
            로그아웃
          </button>
        </form>
      </div>
    </main>
  );
}
