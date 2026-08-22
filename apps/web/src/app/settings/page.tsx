import { RoleSettings } from "@/features/settings/components/role-settings";
import { TaskCleanup } from "@/features/settings/components/task-cleanup";
import { AutoFixSettings } from "@/features/settings/components/auto-fix-settings";

/**
 * Two sections that have nothing to do with each other — who runs the work,
 * and housekeeping on work already done — so on a wide screen they sit side
 * by side instead of one being stacked under a half-empty page. The split is
 * 7:5 rather than even: the role list carries three editable rows and an
 * inline editor, the cleanup list is a checklist. Below `lg` the grid
 * collapses to a single column in source order.
 */
export default function SettingsPage() {
  return (
    <div className="space-y-6">
      <h1 className="text-xl font-semibold text-fg">설정</h1>
      <div className="grid items-start gap-x-8 gap-y-10 lg:grid-cols-[minmax(0,7fr)_minmax(0,5fr)]">
        <div className="space-y-10">
          <RoleSettings />
          <AutoFixSettings />
        </div>
        <TaskCleanup />
      </div>
    </div>
  );
}
