"use client";

import { useRouter } from "next/navigation";
import { Dialog } from "@/components/dialog";
import { TaskCreateForm } from "./task-create-form";
import { LINK_KIND_LABEL } from "../workflow-labels";
import type { FollowUpPrefill } from "../lib/follow-up";

/**
 * Primary task-creation path: a dialog, not a separate page. Rendered by
 * the header's 새 작업 button — the one default entry point — by the empty
 * dashboard's call to action, and by the task detail screen with a
 * `prefill` for follow-ups (a contextual action scoped to one task, not a
 * competing entry point).
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
  const title = prefill ? LINK_KIND_LABEL[prefill.linkKind] : "새 작업";
  const description = prefill
    ? "이전 작업 내용을 채워 두었습니다. 시작 전에 수정할 수 있습니다."
    : undefined;

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={title}
      description={description}
      maxWidthClassName="max-w-2xl"
    >
      <TaskCreateForm
        surface="dialog"
        prefill={prefill}
        onCreated={(jobId) => {
          onClose();
          router.push(`/tasks/${jobId}`);
        }}
      />
    </Dialog>
  );
}
