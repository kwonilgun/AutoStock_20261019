import Link from "next/link";
import { redirect } from "next/navigation";
import { AuthForm } from "@/components/auth/AuthForm";
import { signUp } from "@/lib/server/auth-actions";
import { getCurrentUser } from "@/lib/server/session";

export default async function SignupPage() {
  const user = await getCurrentUser();
  if (user) redirect("/");

  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center px-6 py-16">
      <p className="text-sm text-[#6d675d]">에그밸런스</p>
      <h1 className="mt-1 text-2xl font-semibold">가입</h1>
      <p className="mt-2 text-sm leading-6 text-[#5c564c]">
        회원마다 포트폴리오가 따로 저장됩니다. 이 컴퓨터에 계정이 아직 없으면, 지금 저장돼 있는 포트폴리오를 첫 계정이 이어받습니다. 가입은 바로 되지만, 관리자가 승인하기 전에는 로그인할 수 없습니다.
      </p>
      <AuthForm mode="signup" action={signUp} />
      <p className="mt-4 text-sm text-[#5c564c]">
        이미 계정이 있으면 <Link href="/login?reset=1" className="underline">로그인</Link>
      </p>
    </main>
  );
}
