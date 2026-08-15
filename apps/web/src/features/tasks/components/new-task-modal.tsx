"use client";

import { useRouter } from "next/navigation";
import { Dialog } from "@/components/dialog";
import { TaskCreateForm } from "./task-create-form";

/** Primary Task-creation path: a modal on the main Dashboard, not a separate page. */
export function NewTaskModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const router = useRouter();

  return (
    <Dialog open={open} onClose={onClose} title="새 Task 생성" maxWidthClassName="max-w-xl">
      <TaskCreateForm
        onCreated={(jobId) => {
          onClose();
          router.push(`/tasks/${jobId}`);
        }}
      />
    </Dialog>
  );
}
