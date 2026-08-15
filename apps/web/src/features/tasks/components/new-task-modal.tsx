"use client";

import { useRouter } from "next/navigation";
import { Dialog } from "@/components/dialog";
import { TaskCreateForm } from "./task-create-form";
import { LINK_KIND_LABEL } from "../workflow-labels";
import type { FollowUpPrefill } from "../lib/follow-up";

/**
 * Primary Task-creation path: a modal, not a separate page. Rendered once
 * (blank) by the header's "+ New Task" button — the one default entry point
 * — and, separately, by TaskDetail with a `prefill` for WARNING follow-ups
 * (a contextual action scoped to one Task, not a competing entry point).
 */
export function NewTaskModal({
  open,
  onClose,
  prefill,
}: {
  open: boolean;
  onClose: () => void;
  prefill?: FollowUpPrefill;
}) {
  const router = useRouter();
  const title = prefill ? `${LINK_KIND_LABEL[prefill.linkKind]} Task 생성` : "새 Task 생성";

  return (
    <Dialog open={open} onClose={onClose} title={title} maxWidthClassName="max-w-3xl">
      <TaskCreateForm
        prefill={prefill}
        onCreated={(jobId) => {
          onClose();
          router.push(`/tasks/${jobId}`);
        }}
      />
    </Dialog>
  );
}
