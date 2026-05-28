"use client";

import { Modal } from "./modal";
import { Button } from "./button";

interface Props {
  open: boolean;
  title: string;
  message: React.ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  /** "danger" gives the confirm button a red treatment. */
  variant?: "default" | "danger";
  busy?: boolean;
  onCancel: () => void;
  onConfirm: () => void | Promise<void>;
}

/**
 * Replaces native `window.confirm()`. Always rendered via portal Modal.
 */
export function ConfirmDialog({
  open,
  title,
  message,
  confirmLabel = "Confirm",
  cancelLabel = "Cancel",
  variant = "default",
  busy,
  onCancel,
  onConfirm,
}: Readonly<Props>) {
  return (
    <Modal
      open={open}
      onClose={onCancel}
      title={title}
      footer={
        <>
          <Button variant="ghost" onClick={onCancel} disabled={busy}>
            {cancelLabel}
          </Button>
          <Button
            variant={variant === "danger" ? "danger" : "primary"}
            onClick={onConfirm}
            disabled={busy}
            isLoading={busy}
          >
            {confirmLabel}
          </Button>
        </>
      }
    >
      <div className="text-sm text-[#525252]">{message}</div>
    </Modal>
  );
}
