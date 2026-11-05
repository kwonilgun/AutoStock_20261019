import { SLEEVE_LABEL } from "@/lib/engine/config";
import type { AppView } from "@/lib/server/portfolio";

export function AppShell({ view, children }: { view: AppView; children: React.ReactNode }) {
  return (
    <>
      {children}
      {view.result.incomeTargetSleeve ? (
        <p className="px-1 pt-1 text-[12px] leading-5 text-[#8b95a1]">
          이번 달 분배금은 {SLEEVE_LABEL[view.result.incomeTargetSleeve]}로 향합니다.
        </p>
      ) : null}
    </>
  );
}

export function DbError() {
  return (
    <main className="mx-auto max-w-lg px-6 py-16">
      <h1 className="text-xl font-bold text-[#191f28]">로컬 데이터베이스를 열지 못했습니다</h1>
      <p className="mt-3 text-[15px] leading-6 text-[#4e5968]">
        프로젝트 폴더에서 <code>npm run db:push</code>를 실행한 뒤 다시 열어 주세요.
      </p>
    </main>
  );
}
