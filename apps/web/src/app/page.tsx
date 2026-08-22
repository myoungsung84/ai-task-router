import { TaskList } from "@/features/tasks/components/task-list";
import { TodaySummary } from "@/features/history/components/today-summary";

export default function DashboardPage() {
  return (
    <div className="space-y-6">
      <TodaySummary />
      <TaskList />
    </div>
  );
}
