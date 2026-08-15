"use client";

import { useRouter } from "next/navigation";
import { TaskCreateForm } from "@/features/tasks/components/task-create-form";

/** Fallback/test path — the primary way to create a Task is the "+ New Task" modal on the main Dashboard. */
export default function NewTaskPage() {
  const router = useRouter();
  return (
    <div className="mx-auto max-w-2xl">
      <h1 className="mb-4 text-xl font-semibold text-white">새 Task 생성</h1>
      <TaskCreateForm onCreated={(jobId) => router.push(`/tasks/${jobId}`)} />
    </div>
  );
}
