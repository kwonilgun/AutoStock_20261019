import { ApproveUserSwitch } from "@/components/admin/ApproveUserSwitch";
import { DeleteUserButton } from "@/components/admin/DeleteUserButton";
import { ResetPasswordButton } from "@/components/admin/ResetPasswordButton";
import { AdminShell, formatUpdatedAt, requireAdminPage } from "@/components/admin/AdminShell";
import { listLoginUsers } from "@/lib/server/login-users";

export default async function AdminUsersPage() {
  await requireAdminPage();
  const { loggedInCount, onlineCount, users } = await listLoginUsers();
  const pendingCount = users.filter((user) => !user.approved).length;

  return (
    <AdminShell subtitle={`승인 대기 ${pendingCount}명 · 로그인 ${loggedInCount}명 · 접속 ${onlineCount}명`}>
      <section className="rounded-[22px] bg-white px-5 py-5">
        <p className="text-[13px] font-medium text-[#8b95a1]">사용자</p>
        <p className="mt-1 text-[32px] font-bold tracking-tight text-[#191f28]">{users.length}명</p>
        <p className="mt-1 text-[13px] text-[#8b95a1]">승인 대기 {pendingCount}명 · 지금 접속 중 {onlineCount}명</p>
        <p className="mt-2 text-[13px] leading-5 text-[#8b95a1]">
          가입은 바로 되지만, 승인 스위치가 꺼져 있으면 로그인할 수 없습니다. 새 회원은 꺼짐이 기본입니다. 스위치를
          켜야 사용할 수 있고, 다시 끄면 접속 중에도 로그아웃됩니다. 비밀번호 리셋은 0000으로 되돌리며, 삭제는 계정과
          포트폴리오를 함께 지웁니다.
        </p>
      </section>

      <section className="rounded-[22px] bg-white px-5 py-2">
        {users.length === 0 ? (
          <p className="py-4 text-[15px] text-[#8b95a1]">아직 가입한 사용자가 없습니다.</p>
        ) : (
          <ul className="divide-y divide-[#f2f4f6]">
            {users.map((user) => (
              <li key={user.id} className="flex items-start justify-between gap-3 py-3.5">
                <div className="min-w-0">
                  <p className="truncate text-[16px] font-semibold text-[#191f28]">{user.email}</p>
                  <p className="mt-0.5 text-[13px] text-[#8b95a1]">
                    가입 {formatUpdatedAt(user.createdAt)}
                    {" · "}
                    {user.lastLoginAt ? `마지막 로그인 ${formatUpdatedAt(user.lastLoginAt)}` : "아직 로그인하지 않음"}
                  </p>
                  <ApproveUserSwitch userId={user.id} email={user.email} approved={user.approved} />
                </div>
                <div className="flex shrink-0 items-start gap-1.5">
                  {user.online ? (
                    <span className="rounded-full bg-[#e8f3ff] px-2.5 py-1 text-[12px] font-semibold text-[#3182f6]">
                      접속 중
                    </span>
                  ) : null}
                  <ResetPasswordButton userId={user.id} email={user.email} />
                  <DeleteUserButton userId={user.id} email={user.email} />
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </AdminShell>
  );
}
