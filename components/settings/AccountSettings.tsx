import Link from "next/link";
import { DeleteAccountRow } from "@/components/settings/DeleteAccountForm";
import { PasswordSettingRow } from "@/components/settings/SettingsPasswordForm";

export function AccountSettings({ email }: { email: string }) {
  return (
    <>
      <section className="rounded-[22px] bg-white px-5 py-5">
        <p className="text-[13px] font-medium text-[#8b95a1]">로그인 계정</p>
        <p className="mt-1 truncate text-[17px] font-bold text-[#191f28]">{email}</p>
      </section>

      <section className="divide-y divide-[#f2f4f6] rounded-[22px] bg-white px-5 py-2">
        <Link href="/settings/manual" className="flex w-full items-center justify-between py-3 text-left">
          <span className="text-[16px] font-semibold text-[#191f28]">사용자 매뉴얼</span>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden className="text-[#b0b8c1]">
            <path d="m9 6 6 6-6 6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </Link>
        <PasswordSettingRow />
      </section>

      <section className="mt-6 rounded-[22px] bg-white px-5 py-2">
        <DeleteAccountRow />
      </section>
    </>
  );
}
