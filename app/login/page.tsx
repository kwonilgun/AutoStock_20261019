import Link from "next/link";
import { redirect } from "next/navigation";
import { AuthForm } from "@/components/auth/AuthForm";
import { signIn } from "@/lib/server/auth-actions";
import { getCurrentUser } from "@/lib/server/session";

export default async function LoginPage() {
  const user = await getCurrentUser();
  if (user) redirect("/");

  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center px-6 py-16">
      <p className="text-sm text-[#6d675d]">에그밸런스</p>
      <h1 className="mt-1 text-2xl font-semibold">로그인</h1>
      <p className="mt-2 text-sm leading-6 text-[#5c564c]">
        이메일로 로그인하면 보유, 국면, 월간 기록이 이 계정에만 저장됩니다.
      </p>
      <AuthForm mode="login" action={signIn} reset />
      <div className="mt-6 rounded-2xl border border-[#e4dccb] bg-[#faf8f4] px-4 py-4">
        <p className="text-sm font-semibold text-[#1c1915]">처음이신가요?</p>
        <p className="mt-1 text-sm leading-6 text-[#5c564c]">
          이메일과 비밀번호만 있으면 바로 가입할 수 있어요. 이 기기에 저장된 포트폴리오는 첫 계정이 이어받습니다.
        </p>
        <Link
          href="/signup"
          className="mt-3 flex items-center justify-center rounded-xl border border-[#1c1915] bg-white px-3 py-2.5 text-sm font-semibold text-[#1c1915]"
        >
          무료로 가입하기
        </Link>
      </div>
    </main>
  );
}
