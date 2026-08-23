"use client";

import { useMemo } from "react";
import { Button } from "@/components/ui/button";
import { useHotkeys } from "@/lib/hooks/use-hotkeys";
import type { RecordMode } from "@/lib/hooks/use-record-mode";
import { cn } from "@/lib/cn";

export interface DetailActionLabels {
  /** State badge text. */
  view: string;
  editing: string;
  creating: string;
  /** Button labels. */
  create: string;
  edit: string;
  delete: string;
  save: string;
  cancel: string;
}

/**
 * Mode-aware action cluster for a master-detail record panel: a **state badge**
 * (조회 / 수정 중 / 신규 등록) plus the buttons that make sense for the current
 * mode — 조회 shows [신규][수정][삭제]; 수정/신규 show only [저장][취소]. Lives in
 * the detail-panel header (there is no bottom action bar). Binds the ERP F-keys
 * for the active mode (F2 신규 · F3 수정 · F5 저장 · Esc 취소).
 */
export function DetailActions({
  mode,
  labels,
  canManage = true,
  canEdit = false,
  saving = false,
  hotkeys = true,
  onCreate,
  onEdit,
  onDelete,
  onSave,
  onCancel,
}: Readonly<{
  mode: RecordMode;
  labels: DetailActionLabels;
  /** MANAGER+ — when false, no mutating buttons show (read-only viewer). */
  canManage?: boolean;
  /** A record is selected — enables 수정 in 조회 mode. */
  canEdit?: boolean;
  saving?: boolean;
  hotkeys?: boolean;
  onCreate: () => void;
  onEdit: () => void;
  onDelete?: () => void;
  onSave: () => void;
  onCancel: () => void;
}>) {
  const isView = mode === "view";

  const hotkeyMap = useMemo(() => {
    if (!hotkeys || !canManage) return {};
    if (isView) {
      const m: Record<string, () => void> = { F2: onCreate };
      if (canEdit) m.F3 = onEdit;
      if (onDelete && canEdit) m.F4 = onDelete;
      return m;
    }
    return { F5: onSave, Escape: onCancel };
  }, [hotkeys, canManage, isView, canEdit, onCreate, onEdit, onDelete, onSave, onCancel]);
  useHotkeys(hotkeyMap);

  const badge = isView ? labels.view : mode === "edit" ? labels.editing : labels.creating;
  const badgeTone = isView
    ? "border-[#e5e5e5] bg-[#f5f5f5] text-[#525252]"
    : mode === "edit"
      ? "border-[var(--brand-blue-200)] bg-[var(--brand-blue-50)] text-[var(--brand-blue-700)]"
      : "border-emerald-200 bg-emerald-50 text-emerald-700";

  return (
    <div className="flex items-center justify-between gap-2">
      <span
        aria-live="polite"
        className={cn(
          "inline-flex items-center rounded-full border px-2.5 py-0.5 text-[11px] font-semibold",
          badgeTone,
        )}
      >
        {badge}
      </span>

      {canManage && (
        <div className="flex items-center gap-1.5">
          {isView ? (
            <>
              <Button variant="secondary" size="sm" onClick={onCreate}>{labels.create}</Button>
              <Button variant="secondary" size="sm" disabled={!canEdit} onClick={onEdit}>{labels.edit}</Button>
              {onDelete && (
                <Button variant="danger" size="sm" disabled={!canEdit} onClick={onDelete}>{labels.delete}</Button>
              )}
            </>
          ) : (
            <>
              <Button variant="primary" size="sm" isLoading={saving} onClick={onSave}>{labels.save}</Button>
              <Button variant="ghost" size="sm" onClick={onCancel}>{labels.cancel}</Button>
            </>
          )}
        </div>
      )}
    </div>
  );
}
