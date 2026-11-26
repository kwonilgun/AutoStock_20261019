import { AccountSettings } from "@/components/settings/AccountSettings";
import { ViewFrame } from "@/components/frame/ViewFrame";
import { readSparkConfig } from "@/lib/server/advice-remote";

export default async function SettingsPage() {
  return (
    <ViewFrame>
      {(view) => (
        <div className="mx-auto flex w-full max-w-lg flex-col gap-3">
          <h1 className="px-1 pt-1 text-[22px] font-bold tracking-tight text-[#191f28]">설정</h1>
          <AccountSettings
            email={view.user.email}
            prefs={view.user.role === "user" ? view.user.pickPrefs : undefined}
            planWeeks={view.user.planWeeks}
            pickEngine={view.user.role === "user" ? view.user.pickEngine : undefined}
            weightEngine={view.user.role === "user" ? view.user.weightEngine : undefined}
            sparkModel={view.user.role === "user" ? (readSparkConfig()?.model ?? null) : null}
          />
        </div>
      )}
    </ViewFrame>
  );
}
