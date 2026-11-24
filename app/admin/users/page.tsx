import { ApproveUserSwitch } from "@/components/admin/ApproveUserSwitch";
import { DeleteUserButton } from "@/components/admin/DeleteUserButton";
import { PickClaudeForm } from "@/components/admin/PickClaudeForm";
import { ResetPasswordButton } from "@/components/admin/ResetPasswordButton";
import { UserPickEnabledSwitch } from "@/components/admin/UserPickEnabledSwitch";
import { AdminShell, formatUpdatedAt, requireAdminPage } from "@/components/admin/AdminShell";
import { seoulDay } from "@/lib/format";
import { listLoginUsers } from "@/lib/server/login-users";
import { readPickClaudeAdmin } from "@/lib/server/pick-llm";

export default async function AdminUsersPage() {
  await requireAdminPage();
  const [{ loggedInCount, onlineCount, activeCount, users }, claude] = await Promise.all([listLoginUsers(), readPickClaudeAdmin()]);
  const pendingCount = users.filter((user) => !user.approved).length;
  const today = seoulDay();
  const todayUsers = users
    .filter((user) => user.lastSeenAt && seoulDay(user.lastSeenAt) === today)
    .sort((left, right) => (right.lastSeenAt?.getTime() ?? 0) - (left.lastSeenAt?.getTime() ?? 0));

  return (
    <AdminShell subtitle={`승인 대기 ${pendingCount}명 · 오늘 사용 ${todayUsers.length}명 · 사용 중 ${activeCount}명 · 세션 ${onlineCount}명 · 로그인 ${loggedInCount}명`}>
      <section className="rounded-[22px] bg-white px-5 py-5">
        <p className="text-[13px] font-medium text-[#8b95a1]">사용자</p>
        <p className="mt-1 text-[32px] font-bold tracking-tight text-[#191f28]">{users.length}명</p>
        <p className="mt-1 text-[13px] text-[#8b95a1]">승인 대기 {pendingCount}명 · 사용 중 {activeCount}명</p>
        <p className="mt-2 text-[13px] leading-5 text-[#8b95a1]">
          가입은 바로 되지만, 승인 스위치가 꺼져 있으면 로그인할 수 없습니다. 새 회원은 꺼짐이 기본입니다. 스위치를
          켜야 사용할 수 있고, 다시 끄면 접속 중에도 로그아웃됩니다. 비밀번호 리셋은 0000으로 되돌리며, 삭제는 계정과
          포트폴리오를 함께 지웁니다. 추천종목은 사용자마다 켜거나 끌 수 있고, 기본은 꺼짐입니다. 켜면 옆에 횟수 제한이
          보이며 기본은 1회입니다. 숫자를 바꿔 저장하면 그 사용자만 적용됩니다. 횟수 리셋은 그 사람이 이미 쓴 횟수만
          0으로 되돌리고, 제한은 그대로 둡니다. 추천 종목은 Claude로 받습니다.
        </p>
      </section>

      <PickClaudeForm configured={claude.configured} last4={claude.last4} workspaceId={claude.workspaceId} />

      <section className="rounded-[22px] bg-white px-5 py-5">
        <p className="text-[13px] font-medium text-[#8b95a1]">오늘 들어온 회원</p>
        <p className="mt-1 text-[22px] font-bold tracking-tight text-[#191f28]">{todayUsers.length}명</p>
        <p className="mt-1 text-[13px] text-[#8b95a1]">최근 15분 안에 화면을 연 회원은 사용 중입니다.</p>
        {todayUsers.length === 0 ? (
          <p className="mt-3 text-[15px] text-[#8b95a1]">오늘 들어온 회원이 없습니다.</p>
        ) : (
          <ul className="mt-3 divide-y divide-[#f2f4f6]">
            {todayUsers.map((user) => (
              <li key={user.id} className="flex items-center justify-between gap-3 py-3">
                <p className="min-w-0 truncate text-[15px] font-semibold text-[#191f28]">{user.email}</p>
                <span className="flex shrink-0 items-center gap-2">
                  {user.active ? (
                    <span className="rounded-full bg-[#e8f3ff] px-2.5 py-1 text-[12px] font-semibold text-[#3182f6]">사용 중</span>
                  ) : null}
                  <span className="text-[13px] text-[#8b95a1]">{user.lastSeenAt ? formatUpdatedAt(user.lastSeenAt) : ""}</span>
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="rounded-[22px] bg-white px-5 py-2">
        {users.length === 0 ? (
          <p className="py-4 text-[15px] text-[#8b95a1]">아직 가입한 사용자가 없습니다.</p>
        ) : (
          <ul className="divide-y divide-[#f2f4f6]">
            {users.map((user) => (
              <li key={user.id} className="py-3.5">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="truncate text-[16px] font-semibold text-[#191f28]">{user.email}</p>
                    <p className="mt-0.5 text-[13px] text-[#8b95a1]">
                      가입 {formatUpdatedAt(user.createdAt)}
                      {" · "}
                      {user.lastLoginAt ? `마지막 로그인 ${formatUpdatedAt(user.lastLoginAt)}` : "아직 로그인하지 않음"}
                      {" · "}
                      {user.lastSeenAt ? `최근 사용 ${formatUpdatedAt(user.lastSeenAt)}` : "사용 기록 없음"}
                    </p>
                  </div>
                  <div className="flex shrink-0 items-start gap-1.5">
                    {user.active ? (
                      <span className="rounded-full bg-[#e8f3ff] px-2.5 py-1 text-[12px] font-semibold text-[#3182f6]">
                        사용 중
                      </span>
                    ) : null}
                    <ResetPasswordButton userId={user.id} email={user.email} />
                    <DeleteUserButton userId={user.id} email={user.email} />
                  </div>
                </div>
                <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-2">
                  <ApproveUserSwitch userId={user.id} email={user.email} approved={user.approved} />
                  <UserPickEnabledSwitch
                    userId={user.id}
                    email={user.email}
                    enabled={user.pickEnabled}
                    limit={user.pickLimit}
                    used={user.pickUsed}
                  />
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </AdminShell>
  );
}
