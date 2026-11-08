import { ResetPasswordButton } from "@/components/admin/ResetPasswordButton";
import { AdminShell, formatUpdatedAt, requireAdminPage } from "@/components/admin/AdminShell";
import { listLoginUsers } from "@/lib/server/login-users";

export default async function AdminUsersPage() {
  await requireAdminPage();
  const { loggedInCount, onlineCount, users } = await listLoginUsers();

  return (
    <AdminShell subtitle={`로그인 ${loggedInCount}명 · 접속 ${onlineCount}명`}>
      <section className="rounded-[22px] bg-white px-5 py-5">
        <p className="text-[13px] font-medium text-[#8b95a1]">로그인한 사용자</p>
        <p className="mt-1 text-[32px] font-bold tracking-tight text-[#191f28]">{loggedInCount}명</p>
        <p className="mt-1 text-[13px] text-[#8b95a1]">지금 접속 중 {onlineCount}명</p>
        <p className="mt-2 text-[13px] leading-5 text-[#8b95a1]">
          비밀번호를 잊은 사용자는 비밀번호 리셋으로 0000으로 되돌릴 수 있습니다.
        </p>
      </section>

      <section className="rounded-[22px] bg-white px-5 py-2">
        {users.length === 0 ? (
          <p className="py-4 text-[15px] text-[#8b95a1]">아직 로그인한 사용자가 없습니다.</p>
        ) : (
          <ul className="divide-y divide-[#f2f4f6]">
            {users.map((user) => (
              <li key={user.id} className="flex items-center justify-between gap-3 py-3.5">
                <div className="min-w-0">
                  <p className="truncate text-[16px] font-semibold text-[#191f28]">{user.email}</p>
                  <p className="mt-0.5 text-[13px] text-[#8b95a1]">마지막 로그인 {formatUpdatedAt(user.lastLoginAt)}</p>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  {user.online ? (
                    <span className="rounded-full bg-[#e8f3ff] px-2.5 py-1 text-[12px] font-semibold text-[#3182f6]">
                      접속 중
                    </span>
                  ) : null}
                  <ResetPasswordButton userId={user.id} email={user.email} />
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </AdminShell>
  );
}
