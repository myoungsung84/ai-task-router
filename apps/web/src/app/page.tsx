import { TaskList } from "@/features/tasks/components/task-list";

export default function DashboardPage() {
  return (
    <div className="space-y-4">
      <h1 className="text-xl font-semibold text-white">Tasks</h1>
      <TaskList />
    </div>
  );
}
