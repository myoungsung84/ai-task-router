import { DefaultWorkflowSettings } from "@/features/settings/components/default-workflow-settings";
import { TaskCleanup } from "@/features/settings/components/task-cleanup";

export default function SettingsPage() {
  return (
    <div className="mx-auto max-w-2xl space-y-5">
      <h1 className="text-xl font-semibold text-white">Settings</h1>
      <DefaultWorkflowSettings />
      <TaskCleanup />
    </div>
  );
}
