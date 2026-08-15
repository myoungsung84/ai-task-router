"use client";

import { Dialog } from "./dialog";
import { Button } from "./button";

export function ConfirmDialog({
  open,
  title,
  message,
  confirmLabel,
  danger = true,
  busy = false,
  onConfirm,
  onCancel,
}: {
  open: boolean;
  title: string;
  message: string;
  confirmLabel: string;
  danger?: boolean;
  busy?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  return (
    <Dialog open={open} onClose={onCancel} title={title} maxWidthClassName="max-w-sm">
      <p className="text-sm text-[#c8d1db]">{message}</p>
      <div className="mt-5 flex justify-end gap-2">
        <Button variant="ghost" onClick={onCancel} disabled={busy}>
          취소
        </Button>
        <Button variant={danger ? "danger" : "primary"} onClick={onConfirm} disabled={busy}>
          {busy ? "처리 중..." : confirmLabel}
        </Button>
      </div>
    </Dialog>
  );
}
