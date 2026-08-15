"use client";

import Link from "next/link";
import { useTaskList } from "../hooks/use-task-list";
import { TaskStatusBadge, RunnerStatusPill } from "./task-status-badge";
import { formatDuration, projectName } from "@/lib/format";
import { Card } from "@/components/card";

export function TaskList() {
  const { tasks, loading, error } = useTaskList();

  if (loading && tasks.length === 0) {
    return <p className="text-sm text-[#8291a3]">불러오는 중...</p>;
  }

  if (error) {
    return <p className="text-sm text-red-400">목록을 불러오지 못했습니다: {error}</p>;
  }

  if (tasks.length === 0) {
    return (
      <Card>
        <p className="text-sm text-[#8291a3]">
          아직 생성된 Task가 없습니다. 우측 상단의 <span className="text-white">+ New Task</span>로
          시작하세요.
        </p>
      </Card>
    );
  }

  return (
    <div className="overflow-x-auto rounded-lg border border-[#232c38]">
      <table className="w-full text-sm">
        <thead className="bg-[#0e131a] text-left text-xs uppercase tracking-wide text-[#8291a3]">
          <tr>
            <th className="px-4 py-2 font-medium">제목</th>
            <th className="px-4 py-2 font-medium">프로젝트 / branch</th>
            <th className="px-4 py-2 font-medium">상태</th>
            <th className="px-4 py-2 font-medium">Claude</th>
            <th className="px-4 py-2 font-medium">Codex</th>
            <th className="px-4 py-2 font-medium">실행 시간</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-[#232c38]">
          {tasks.map((task) => (
            <tr key={task.id} className="hover:bg-white/[0.03]">
              <td className="px-4 py-3">
                <Link href={`/tasks/${task.id}`} className="text-white hover:underline">
                  {task.title}
                </Link>
              </td>
              <td className="px-4 py-3 text-[#c8d1db]">
                <div>{projectName(task.projectPath)}</div>
                <div className="mono text-xs text-[#8291a3]">
                  {task.branch ?? task.gitInfo?.originalBranch ?? "-"}
                </div>
              </td>
              <td className="px-4 py-3">
                <TaskStatusBadge status={task.status} />
              </td>
              <td className="px-4 py-3">
                <RunnerStatusPill label="" status={task.claudeStatus} />
              </td>
              <td className="px-4 py-3">
                <RunnerStatusPill label="" status={task.codexStatus} />
              </td>
              <td className="px-4 py-3 mono text-xs text-[#8291a3]">
                {formatDuration(task.startedAt, task.completedAt)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
