import { unstable_rethrow } from "next/navigation";
import { AppShell, DbError } from "@/components/layout/AppShell";
import { refreshLiveMarks } from "@/lib/server/live-marks";
import { getView, type AppView } from "@/lib/server/portfolio";

export async function ViewFrame({
  refreshMarks = false,
  children,
}: {
  refreshMarks?: boolean;
  children: (view: AppView) => React.ReactNode;
}) {
  try {
    if (refreshMarks) await refreshLiveMarks();
    const view = await getView();
    return <AppShell view={view}>{children(view)}</AppShell>;
  } catch (error) {
    unstable_rethrow(error);
    return <DbError />;
  }
}
