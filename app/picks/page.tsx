import { ViewFrame } from "@/components/frame/ViewFrame";
import { PickPanel } from "@/components/recommend/PickPanel";
import { PICK_DISABLED_MESSAGE } from "@/lib/pick-engine";
import { loadSavedPick } from "@/lib/server/pick-cache";
import { readPickQuota } from "@/lib/server/pick-quota";
import { getCurrentUser } from "@/lib/server/session";

export default async function PicksPage() {
  const user = await getCurrentUser();
  if (!user || user.role !== "user" || !user.pickEnabled) {
    return (
      <ViewFrame>
        {() => (
          <section className="rounded-[22px] bg-white px-5 py-8">
            <p className="text-[15px] font-medium leading-6 text-[#4e5968]">{PICK_DISABLED_MESSAGE}</p>
          </section>
        )}
      </ViewFrame>
    );
  }
  const [saved, quota] = await Promise.all([loadSavedPick(), readPickQuota(user.id)]);
  return <ViewFrame>{() => <PickPanel initial={saved} quota={quota} />}</ViewFrame>;
}
